from __future__ import annotations

import re
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .config import AppConfig
from .security import hash_password, hash_token, new_agent_token, new_public_link_token
from .storage import normalize_path, path_is_within


WORKSPACE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{1,62}$")


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def public_actor(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "actor_id": row["actor_id"],
        "kind": row["kind"],
        "username": row["username"],
        "display_name": row["display_name"],
        "is_admin": bool(row["is_admin"]),
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
    }


def admin_actor(row: dict[str, Any]) -> dict[str, Any]:
    actor = public_actor(row)
    actor["token"] = row.get("agent_token") if row.get("kind") == "agent" else None
    return actor


def normalize_workspace_name(name: str) -> str:
    cleaned = name.strip()
    if not WORKSPACE_NAME_RE.match(cleaned):
        raise ValueError(
            "workspace name must be 2-63 chars and use letters, numbers, dot, dash, or underscore"
        )
    return cleaned


def remap_descendant_path(path: str, source: str, destination: str) -> str:
    if path == source:
        return destination
    return f"{destination}/{path[len(source) + 1:]}"


class Database:
    def __init__(self, config: AppConfig):
        self.config = config

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.config.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def init(self) -> None:
        self.config.data_dir.mkdir(parents=True, exist_ok=True)
        self.config.storage_dir.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS actors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    actor_id TEXT NOT NULL UNIQUE,
                    kind TEXT NOT NULL CHECK(kind IN ('user', 'agent')),
                    username TEXT UNIQUE,
                    display_name TEXT NOT NULL,
                    password_hash TEXT,
                    token_hash TEXT UNIQUE,
                    agent_token TEXT,
                    is_admin INTEGER NOT NULL DEFAULT 0,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS workspaces (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    kind TEXT NOT NULL CHECK(kind IN ('private', 'share_group')),
                    owner_actor_id TEXT REFERENCES actors(actor_id) ON DELETE SET NULL,
                    created_by TEXT REFERENCES actors(actor_id) ON DELETE SET NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS workspace_members (
                    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
                    permission TEXT NOT NULL CHECK(permission IN ('read', 'write', 'owner')),
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (workspace_id, actor_id)
                );

                CREATE TABLE IF NOT EXISTS item_permissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    path TEXT NOT NULL,
                    actor_id TEXT NOT NULL REFERENCES actors(actor_id) ON DELETE CASCADE,
                    permission TEXT NOT NULL CHECK(permission IN ('read', 'write')),
                    created_at TEXT NOT NULL,
                    UNIQUE (workspace_id, path, actor_id)
                );

                CREATE TABLE IF NOT EXISTS public_links (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    path TEXT NOT NULL,
                    token TEXT NOT NULL UNIQUE,
                    created_by TEXT REFERENCES actors(actor_id) ON DELETE SET NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_members_actor ON workspace_members(actor_id);
                CREATE INDEX IF NOT EXISTS idx_item_permissions_actor ON item_permissions(actor_id);
                CREATE INDEX IF NOT EXISTS idx_item_permissions_workspace_path
                    ON item_permissions(workspace_id, path);
                CREATE INDEX IF NOT EXISTS idx_public_links_workspace_path
                    ON public_links(workspace_id, path);
                """
            )
            self._ensure_actor_schema(connection)
            self._ensure_public_link_schema(connection)
            connection.commit()

    def _ensure_actor_schema(self, connection: sqlite3.Connection) -> None:
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(actors)").fetchall()
        }
        if "agent_token" not in columns:
            connection.execute("ALTER TABLE actors ADD COLUMN agent_token TEXT")

    def _ensure_public_link_schema(self, connection: sqlite3.Connection) -> None:
        duplicate_rows = connection.execute(
            """
            SELECT workspace_id, path, MIN(id) AS keep_id
            FROM public_links
            GROUP BY workspace_id, path
            HAVING COUNT(*) > 1
            """
        ).fetchall()
        for row in duplicate_rows:
            connection.execute(
                "DELETE FROM public_links WHERE workspace_id = ? AND path = ? AND id != ?",
                (row["workspace_id"], row["path"], row["keep_id"]),
            )
        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_public_links_workspace_path_unique
            ON public_links(workspace_id, path)
            """
        )

    def create_actor(
        self,
        *,
        kind: str,
        display_name: str,
        username: str | None = None,
        password: str | None = None,
        actor_id: str | None = None,
        token: str | None = None,
        is_admin: bool = False,
        connection: sqlite3.Connection | None = None,
    ) -> tuple[dict[str, Any], str | None]:
        if kind not in {"user", "agent"}:
            raise ValueError("actor kind must be user or agent")
        username = username.strip() if username else None
        if kind == "user":
            if not username or not password:
                raise ValueError("human users require username and password")
            actor_id = actor_id or f"user:{username}"
        else:
            base = (actor_id or username or display_name).strip()
            if not base:
                raise ValueError("agents require actor_id or name")
            actor_id = base if base.startswith("agent:") else f"agent:{base}"
            token = token or new_agent_token()

        if not actor_id or ":" not in actor_id:
            raise ValueError("actor_id must include a type prefix")
        password_hash = hash_password(password) if password else None
        token_hash = hash_token(token) if token else None
        agent_token = token if kind == "agent" else None
        owns_connection = connection is None
        connection = connection or self.connect()
        try:
            connection.execute(
                """
                INSERT INTO actors (
                    actor_id, kind, username, display_name, password_hash,
                    token_hash, agent_token, is_admin, is_active, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    actor_id,
                    kind,
                    username,
                    display_name.strip() or actor_id,
                    password_hash,
                    token_hash,
                    agent_token,
                    1 if is_admin else 0,
                    utcnow(),
                ),
            )
            actor = self.get_actor(actor_id, connection=connection)
            assert actor is not None
            if kind == "user":
                workspace_name = username or actor_id.split(":", 1)[1]
            else:
                workspace_name = actor_id.split(":", 1)[1]
            self.create_workspace(
                name=workspace_name,
                kind="private",
                owner_actor_id=actor_id,
                created_by=actor_id,
                connection=connection,
            )
            if owns_connection:
                connection.commit()
            return public_actor(actor), token
        except Exception:
            if owns_connection:
                connection.rollback()
            raise
        finally:
            if owns_connection:
                connection.close()

    def get_actor(
        self, actor_id: str, *, connection: sqlite3.Connection | None = None
    ) -> dict[str, Any] | None:
        owns_connection = connection is None
        connection = connection or self.connect()
        try:
            row = connection.execute(
                "SELECT * FROM actors WHERE actor_id = ?", (actor_id,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            if owns_connection:
                connection.close()

    def get_actor_by_username(self, username: str) -> dict[str, Any] | None:
        with closing(self.connect()) as connection:
            row = connection.execute(
                "SELECT * FROM actors WHERE username = ? AND kind = 'user'", (username,)
            ).fetchone()
            return row_to_dict(row)

    def get_actor_by_token(self, token: str) -> dict[str, Any] | None:
        with closing(self.connect()) as connection:
            row = connection.execute(
                """
                SELECT * FROM actors
                WHERE token_hash = ? AND is_active = 1
                """,
                (hash_token(token),),
            ).fetchone()
            return row_to_dict(row)

    def create_session(self, actor_id: str, raw_token: str, days: int) -> None:
        expires = datetime.now(timezone.utc) + timedelta(days=days)
        with closing(self.connect()) as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO sessions (token_hash, actor_id, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (hash_token(raw_token), actor_id, expires.isoformat(), utcnow()),
            )
            connection.commit()

    def delete_session(self, raw_token: str) -> None:
        with closing(self.connect()) as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(raw_token),))
            connection.commit()

    def get_actor_by_session(self, raw_token: str) -> dict[str, Any] | None:
        with closing(self.connect()) as connection:
            row = connection.execute(
                """
                SELECT a.* FROM sessions s
                JOIN actors a ON a.actor_id = s.actor_id
                WHERE s.token_hash = ? AND s.expires_at > ? AND a.is_active = 1
                """,
                (hash_token(raw_token), utcnow()),
            ).fetchone()
            return row_to_dict(row)

    def list_actors(
        self,
        *,
        actor_type: str = "all",
        include_inactive: bool = False,
        include_agent_tokens: bool = False,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM actors WHERE 1 = 1"
        params: list[Any] = []
        if actor_type != "all":
            query += " AND kind = ?"
            params.append(actor_type)
        if not include_inactive:
            query += " AND is_active = 1"
        query += " ORDER BY kind DESC, actor_id"
        with closing(self.connect()) as connection:
            rows = connection.execute(query, params).fetchall()
            serializer = admin_actor if include_agent_tokens else public_actor
            return [serializer(dict(row)) for row in rows]

    def update_actor(
        self,
        actor_id: str,
        *,
        display_name: str | None = None,
        password: str | None = None,
        token: str | None = None,
        is_admin: bool | None = None,
        is_active: bool | None = None,
    ) -> dict[str, Any]:
        with closing(self.connect()) as connection:
            actor = self.get_actor(actor_id, connection=connection)
            if not actor:
                raise KeyError("actor not found")

            next_is_admin = bool(actor["is_admin"]) if is_admin is None else bool(is_admin)
            next_is_active = bool(actor["is_active"]) if is_active is None else bool(is_active)
            if actor["is_admin"] and actor["is_active"] and not (next_is_admin and next_is_active):
                admin_count = connection.execute(
                    "SELECT COUNT(*) FROM actors WHERE is_admin = 1 AND is_active = 1"
                ).fetchone()[0]
                if admin_count <= 1:
                    raise ValueError("cannot disable the last active admin")

            updates: list[str] = []
            params: list[Any] = []
            if display_name is not None:
                updates.append("display_name = ?")
                params.append(display_name.strip() or actor_id)
            if password is not None:
                if actor["kind"] != "user":
                    raise ValueError("only human users can update passwords")
                updates.append("password_hash = ?")
                params.append(hash_password(password))
            if token is not None:
                if actor["kind"] != "agent":
                    raise ValueError("only agents can update tokens")
                updates.append("token_hash = ?")
                params.append(hash_token(token))
                updates.append("agent_token = ?")
                params.append(token)
            if is_admin is not None:
                updates.append("is_admin = ?")
                params.append(1 if is_admin else 0)
            if is_active is not None:
                updates.append("is_active = ?")
                params.append(1 if is_active else 0)

            if updates:
                params.extend([actor_id])
                connection.execute(
                    f"UPDATE actors SET {', '.join(updates)} WHERE actor_id = ?",
                    params,
                )
            if is_active is False:
                connection.execute("DELETE FROM sessions WHERE actor_id = ?", (actor_id,))
            connection.commit()
            updated = self.get_actor(actor_id, connection=connection)
            assert updated is not None
            return public_actor(updated)

    def delete_actor(self, actor_id: str) -> list[int]:
        with closing(self.connect()) as connection:
            actor = self.get_actor(actor_id, connection=connection)
            if not actor:
                raise KeyError("actor not found")

            if actor["is_admin"] and actor["is_active"]:
                admin_count = connection.execute(
                    "SELECT COUNT(*) FROM actors WHERE is_admin = 1 AND is_active = 1"
                ).fetchone()[0]
                if admin_count <= 1:
                    raise ValueError("cannot delete the last active admin")

            blocking_workspace = connection.execute(
                """
                SELECT w.name
                FROM workspace_members m
                JOIN workspaces w ON w.id = m.workspace_id
                WHERE m.actor_id = ?
                  AND m.permission = 'owner'
                  AND w.kind = 'share_group'
                  AND NOT EXISTS (
                      SELECT 1 FROM workspace_members other
                      WHERE other.workspace_id = m.workspace_id
                        AND other.permission = 'owner'
                        AND other.actor_id != ?
                  )
                ORDER BY w.name
                LIMIT 1
                """,
                (actor_id, actor_id),
            ).fetchone()
            if blocking_workspace is not None:
                raise ValueError(
                    f"cannot delete the last owner of shared workspace {blocking_workspace['name']}"
                )

            workspace_rows = connection.execute(
                """
                SELECT id FROM workspaces
                WHERE owner_actor_id = ? AND kind = 'private'
                ORDER BY id
                """,
                (actor_id,),
            ).fetchall()
            workspace_ids = [int(row["id"]) for row in workspace_rows]
            if workspace_ids:
                connection.executemany(
                    "DELETE FROM workspaces WHERE id = ?",
                    [(workspace_id,) for workspace_id in workspace_ids],
                )

            cursor = connection.execute("DELETE FROM actors WHERE actor_id = ?", (actor_id,))
            if cursor.rowcount == 0:
                raise KeyError("actor not found")
            connection.commit()
            return workspace_ids

    def create_workspace(
        self,
        *,
        name: str,
        kind: str,
        owner_actor_id: str | None,
        created_by: str,
        members: list[dict[str, str]] | None = None,
        connection: sqlite3.Connection | None = None,
    ) -> dict[str, Any]:
        if kind not in {"private", "share_group"}:
            raise ValueError("workspace kind must be private or share_group")
        name = normalize_workspace_name(name)
        owns_connection = connection is None
        connection = connection or self.connect()
        try:
            cursor = connection.execute(
                """
                INSERT INTO workspaces (name, kind, owner_actor_id, created_by, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (name, kind, owner_actor_id, created_by, utcnow()),
            )
            workspace_id = cursor.lastrowid
            if owner_actor_id:
                connection.execute(
                    """
                    INSERT INTO workspace_members (workspace_id, actor_id, permission, created_at)
                    VALUES (?, ?, 'owner', ?)
                    """,
                    (workspace_id, owner_actor_id, utcnow()),
                )
            for member in members or []:
                actor_id = str(member["actor_id"])
                if actor_id == owner_actor_id:
                    continue
                connection.execute(
                    """
                    INSERT INTO workspace_members (workspace_id, actor_id, permission, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (workspace_id, actor_id, str(member["permission"]), utcnow()),
                )
            if owns_connection:
                connection.commit()
            workspace = self.get_workspace(name, connection=connection)
            assert workspace is not None
            return workspace
        except Exception:
            if owns_connection:
                connection.rollback()
            raise
        finally:
            if owns_connection:
                connection.close()

    def get_workspace(
        self, name_or_id: str | int, *, connection: sqlite3.Connection | None = None
    ) -> dict[str, Any] | None:
        owns_connection = connection is None
        connection = connection or self.connect()
        try:
            if isinstance(name_or_id, int) or str(name_or_id).isdigit():
                row = connection.execute(
                    "SELECT * FROM workspaces WHERE id = ?", (int(name_or_id),)
                ).fetchone()
            else:
                row = connection.execute(
                    "SELECT * FROM workspaces WHERE name = ?", (str(name_or_id),)
                ).fetchone()
            return row_to_dict(row)
        finally:
            if owns_connection:
                connection.close()

    def list_workspaces(self, actor: dict[str, Any]) -> list[dict[str, Any]]:
        with closing(self.connect()) as connection:
            if actor["is_admin"]:
                rows = connection.execute(
                    "SELECT * FROM workspaces ORDER BY kind, name"
                ).fetchall()
            else:
                rows = connection.execute(
                    """
                    SELECT w.* FROM workspaces w
                    JOIN workspace_members m ON m.workspace_id = w.id
                    WHERE m.actor_id = ?
                    ORDER BY w.kind, w.name
                    """,
                    (actor["actor_id"],),
                ).fetchall()
            result = []
            for row in rows:
                workspace = dict(row)
                workspace["permission"] = self.permission_for(
                    actor, workspace["id"], "", connection=connection
                )
                result.append(workspace)
            return result

    def list_members(self, workspace_id: int) -> list[dict[str, Any]]:
        with closing(self.connect()) as connection:
            rows = connection.execute(
                """
                SELECT m.workspace_id, m.actor_id, m.permission, m.created_at,
                       a.kind, a.username, a.display_name
                FROM workspace_members m
                JOIN actors a ON a.actor_id = m.actor_id
                WHERE m.workspace_id = ?
                ORDER BY m.permission DESC, m.actor_id
                """,
                (workspace_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def set_member(self, workspace_id: int, actor_id: str, permission: str) -> dict[str, Any]:
        if permission not in {"read", "write", "owner"}:
            raise ValueError("permission must be read, write, or owner")
        with closing(self.connect()) as connection:
            connection.execute(
                """
                INSERT INTO workspace_members (workspace_id, actor_id, permission, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(workspace_id, actor_id)
                DO UPDATE SET permission = excluded.permission
                """,
                (workspace_id, actor_id, permission, utcnow()),
            )
            connection.commit()
        return {"workspace_id": workspace_id, "actor_id": actor_id, "permission": permission}

    def delete_member(self, workspace_id: int, actor_id: str) -> None:
        with closing(self.connect()) as connection:
            row = connection.execute(
                "SELECT permission FROM workspace_members WHERE workspace_id = ? AND actor_id = ?",
                (workspace_id, actor_id),
            ).fetchone()
            if not row:
                raise KeyError("member not found")
            if row["permission"] == "owner":
                owner_count = connection.execute(
                    "SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ? AND permission = 'owner'",
                    (workspace_id,),
                ).fetchone()[0]
                if owner_count <= 1:
                    raise ValueError("cannot remove the last owner")
            connection.execute(
                "DELETE FROM workspace_members WHERE workspace_id = ? AND actor_id = ?",
                (workspace_id, actor_id),
            )
            connection.commit()

    def permission_for(
        self,
        actor: dict[str, Any],
        workspace_id: int,
        path: str | None,
        *,
        connection: sqlite3.Connection | None = None,
    ) -> str | None:
        if actor["is_admin"]:
            return "write"
        normalized = normalize_path(path)
        owns_connection = connection is None
        connection = connection or self.connect()
        try:
            best: str | None = None
            member = connection.execute(
                """
                SELECT permission FROM workspace_members
                WHERE workspace_id = ? AND actor_id = ?
                """,
                (workspace_id, actor["actor_id"]),
            ).fetchone()
            if member:
                value = member["permission"]
                best = "write" if value in {"write", "owner"} else "read"
            rows = connection.execute(
                """
                SELECT path, permission FROM item_permissions
                WHERE workspace_id = ? AND actor_id = ?
                """,
                (workspace_id, actor["actor_id"]),
            ).fetchall()
            for row in rows:
                if path_is_within(row["path"], normalized):
                    if row["permission"] == "write":
                        return "write"
                    best = best or "read"
            return best
        finally:
            if owns_connection:
                connection.close()

    def can_write_workspace_members(self, actor: dict[str, Any], workspace_id: int) -> bool:
        if actor["is_admin"]:
            return True
        with closing(self.connect()) as connection:
            row = connection.execute(
                """
                SELECT permission FROM workspace_members
                WHERE workspace_id = ? AND actor_id = ?
                """,
                (workspace_id, actor["actor_id"]),
            ).fetchone()
            return bool(row and row["permission"] in {"write", "owner"})

    def can_delete_workspace(self, actor: dict[str, Any], workspace_id: int) -> bool:
        if actor["is_admin"]:
            return True
        with closing(self.connect()) as connection:
            row = connection.execute(
                """
                SELECT permission FROM workspace_members
                WHERE workspace_id = ? AND actor_id = ?
                """,
                (workspace_id, actor["actor_id"]),
            ).fetchone()
            return bool(row and row["permission"] == "owner")

    def delete_workspace(self, workspace_id: int) -> None:
        with closing(self.connect()) as connection:
            cursor = connection.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))
            if cursor.rowcount == 0:
                raise KeyError("workspace not found")
            connection.commit()

    def set_item_permission(
        self, workspace_id: int, path: str, actor_id: str, permission: str
    ) -> dict[str, Any]:
        if permission not in {"read", "write"}:
            raise ValueError("permission must be read or write")
        normalized = normalize_path(path)
        with closing(self.connect()) as connection:
            cursor = connection.execute(
                """
                INSERT INTO item_permissions (workspace_id, path, actor_id, permission, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(workspace_id, path, actor_id)
                DO UPDATE SET permission = excluded.permission
                """,
                (workspace_id, normalized, actor_id, permission, utcnow()),
            )
            connection.commit()
            item_id = cursor.lastrowid
            if not item_id:
                row = connection.execute(
                    """
                    SELECT id FROM item_permissions
                    WHERE workspace_id = ? AND path = ? AND actor_id = ?
                    """,
                    (workspace_id, normalized, actor_id),
                ).fetchone()
                item_id = row["id"]
        return {
            "id": item_id,
            "workspace_id": workspace_id,
            "path": normalized,
            "actor_id": actor_id,
            "permission": permission,
        }

    def get_item_permission(self, item_id: int) -> dict[str, Any] | None:
        with closing(self.connect()) as connection:
            row = connection.execute(
                "SELECT * FROM item_permissions WHERE id = ?",
                (item_id,),
            ).fetchone()
            return row_to_dict(row)

    def list_item_permissions(
        self, workspace_id: int, path: str | None = None
    ) -> list[dict[str, Any]]:
        params: list[Any] = [workspace_id]
        query = """
            SELECT p.*, a.kind, a.username, a.display_name
            FROM item_permissions p
            JOIN actors a ON a.actor_id = p.actor_id
            WHERE p.workspace_id = ?
        """
        if path is not None:
            query += " AND p.path = ?"
            params.append(normalize_path(path))
        query += " ORDER BY p.path, p.actor_id"
        with closing(self.connect()) as connection:
            return [dict(row) for row in connection.execute(query, params).fetchall()]

    def delete_item_permission(self, item_id: int) -> None:
        with closing(self.connect()) as connection:
            connection.execute("DELETE FROM item_permissions WHERE id = ?", (item_id,))
            connection.commit()

    def create_public_link(
        self,
        workspace_id: int,
        path: str,
        created_by: str | None,
    ) -> dict[str, Any]:
        normalized = normalize_path(path)
        if not normalized:
            raise ValueError("public links require a file path")
        with closing(self.connect()) as connection:
            existing = connection.execute(
                """
                SELECT p.*, a.display_name AS created_by_name
                FROM public_links p
                LEFT JOIN actors a ON a.actor_id = p.created_by
                WHERE p.workspace_id = ? AND p.path = ?
                ORDER BY p.id ASC
                LIMIT 1
                """,
                (workspace_id, normalized),
            ).fetchone()
            if existing is not None:
                return dict(existing)
            item_id: int | None = None
            token: str | None = None
            for _ in range(8):
                token = new_public_link_token()
                try:
                    cursor = connection.execute(
                        """
                        INSERT INTO public_links (workspace_id, path, token, created_by, created_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (workspace_id, normalized, token, created_by, utcnow()),
                    )
                    item_id = cursor.lastrowid
                    connection.commit()
                    break
                except sqlite3.IntegrityError:
                    connection.rollback()
                    existing = connection.execute(
                        """
                        SELECT p.*, a.display_name AS created_by_name
                        FROM public_links p
                        LEFT JOIN actors a ON a.actor_id = p.created_by
                        WHERE p.workspace_id = ? AND p.path = ?
                        ORDER BY p.id ASC
                        LIMIT 1
                        """,
                        (workspace_id, normalized),
                    ).fetchone()
                    if existing is not None:
                        return dict(existing)
                    continue
            if not item_id or not token:
                raise ValueError("failed to create public link")
            row = connection.execute(
                """
                SELECT p.*, a.display_name AS created_by_name
                FROM public_links p
                LEFT JOIN actors a ON a.actor_id = p.created_by
                WHERE p.id = ?
                """,
                (item_id,),
            ).fetchone()
            assert row is not None
            return dict(row)

    def get_public_link(self, link_id: int) -> dict[str, Any] | None:
        with closing(self.connect()) as connection:
            row = connection.execute(
                """
                SELECT p.*, a.display_name AS created_by_name
                FROM public_links p
                LEFT JOIN actors a ON a.actor_id = p.created_by
                WHERE p.id = ?
                """,
                (link_id,),
            ).fetchone()
            return row_to_dict(row)

    def get_public_link_by_token(self, token: str) -> dict[str, Any] | None:
        with closing(self.connect()) as connection:
            row = connection.execute(
                """
                SELECT p.*, a.display_name AS created_by_name
                FROM public_links p
                LEFT JOIN actors a ON a.actor_id = p.created_by
                WHERE p.token = ?
                """,
                (token,),
            ).fetchone()
            return row_to_dict(row)

    def list_public_links(self, workspace_id: int, path: str | None = None) -> list[dict[str, Any]]:
        normalized = normalize_path(path) if path is not None else None
        params: list[Any] = [workspace_id]
        query = """
                SELECT p.*, a.display_name AS created_by_name
                FROM public_links p
                LEFT JOIN actors a ON a.actor_id = p.created_by
                WHERE p.workspace_id = ?
                """
        if normalized is not None:
            query += " AND p.path = ?"
            params.append(normalized)
        query += " ORDER BY p.created_at DESC, p.id DESC"
        with closing(self.connect()) as connection:
            rows = connection.execute(query, params).fetchall()
            return [dict(row) for row in rows]

    def delete_public_link(self, link_id: int) -> None:
        with closing(self.connect()) as connection:
            connection.execute("DELETE FROM public_links WHERE id = ?", (link_id,))
            connection.commit()

    def delete_public_links_for_path(self, workspace_id: int, path: str) -> None:
        normalized = normalize_path(path)
        if not normalized:
            return
        with closing(self.connect()) as connection:
            connection.execute(
                "DELETE FROM public_links WHERE workspace_id = ? AND (path = ? OR path LIKE ?)",
                (workspace_id, normalized, f"{normalized}/%"),
            )
            connection.commit()

    def move_public_links(self, workspace_id: int, source_path: str, destination_path: str) -> None:
        source = normalize_path(source_path)
        destination = normalize_path(destination_path)
        if not source or not destination:
            raise ValueError("source and destination must not be empty")
        with closing(self.connect()) as connection:
            rows = [
                dict(row)
                for row in connection.execute(
                    "SELECT id, path FROM public_links WHERE workspace_id = ?",
                    (workspace_id,),
                ).fetchall()
            ]
            moving_rows = [row for row in rows if path_is_within(source, row["path"])]
            if not moving_rows:
                return
            for row in moving_rows:
                connection.execute(
                    "UPDATE public_links SET path = ? WHERE id = ?",
                    (remap_descendant_path(row["path"], source, destination), row["id"]),
                )
            connection.commit()

    def move_item_permissions(self, workspace_id: int, source_path: str, destination_path: str) -> None:
        source = normalize_path(source_path)
        destination = normalize_path(destination_path)
        if not source or not destination:
            raise ValueError("source and destination must not be empty")
        with closing(self.connect()) as connection:
            rows = [
                dict(row)
                for row in connection.execute(
                    "SELECT id, actor_id, path FROM item_permissions WHERE workspace_id = ?",
                    (workspace_id,),
                ).fetchall()
            ]
            moving_rows = [row for row in rows if path_is_within(source, row["path"])]
            if not moving_rows:
                return
            moving_ids = {row["id"] for row in moving_rows}
            existing = {(row["actor_id"], row["path"]): row["id"] for row in rows}
            updates: list[tuple[str, int]] = []
            for row in moving_rows:
                new_path = remap_descendant_path(row["path"], source, destination)
                conflict_id = existing.get((row["actor_id"], new_path))
                if conflict_id and conflict_id not in moving_ids:
                    raise ValueError("destination conflicts with an existing share path")
                updates.append((new_path, row["id"]))
            for new_path, item_id in updates:
                connection.execute(
                    "UPDATE item_permissions SET path = ? WHERE id = ?",
                    (new_path, item_id),
                )
            connection.commit()

    def list_shared_items(self, actor: dict[str, Any]) -> list[dict[str, Any]]:
        with closing(self.connect()) as connection:
            rows = connection.execute(
                """
                SELECT p.*, w.name AS workspace, w.kind AS workspace_kind
                FROM item_permissions p
                JOIN workspaces w ON w.id = p.workspace_id
                WHERE p.actor_id = ?
                ORDER BY w.name, p.path
                """,
                (actor["actor_id"],),
            ).fetchall()
            return [dict(row) for row in rows]

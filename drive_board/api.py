from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse, HTMLResponse
from markdown_it import MarkdownIt

from .db import Database, normalize_workspace_name, public_actor
from .schemas import (
    ActorCreate,
    ActorUpdate,
    FolderCreate,
    LoginRequest,
    MemberUpdate,
    PublicLinkCreate,
    PathCopyOrMove,
    PathRename,
    SelfUpdate,
    ShareCreate,
    TextWrite,
    WorkspaceCreate,
)
from .security import new_session_token, verify_password
from .storage import (
    copy_path,
    delete_path,
    ensure_workspace,
    guess_media_type,
    list_directory,
    make_folder,
    move_path,
    normalize_path,
    parent_path,
    preview_type,
    read_text,
    rename_path,
    resolve_path,
    write_text,
)


md = MarkdownIt("commonmark", {"html": True})


def _db(request: Request) -> Database:
    return request.app.state.db


def _config(request: Request):
    return request.app.state.config


async def current_actor(
    request: Request,
    authorization: str | None = Header(default=None),
    drive_session: str | None = Cookie(default=None),
) -> dict:
    db = _db(request)
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            actor = db.get_actor_by_token(token)
            if actor:
                return actor
    if drive_session:
        actor = db.get_actor_by_session(drive_session)
        if actor:
            return actor
    raise HTTPException(status_code=401, detail="authentication required")


def require_admin(actor: dict) -> None:
    if not actor["is_admin"]:
        raise HTTPException(status_code=403, detail="admin permission required")


def workspace_or_404(db: Database, workspace_name: str) -> dict:
    workspace = db.get_workspace(workspace_name)
    if not workspace:
        raise HTTPException(status_code=404, detail="workspace not found")
    return workspace


def require_permission(
    db: Database,
    actor: dict,
    workspace: dict,
    path: str | None,
    permission: str = "read",
) -> str:
    actual = db.permission_for(actor, workspace["id"], path)
    if not actual:
        raise HTTPException(status_code=403, detail="no access to this path")
    if permission == "write" and actual != "write":
        raise HTTPException(status_code=403, detail="write permission required")
    return actual


def create_api_router() -> APIRouter:
    router = APIRouter()

    def public_link_payload(link: dict) -> dict:
        return {
            **link,
            "download_url": f"/public/{link['token']}",
        }

    @router.post("/api/login")
    async def login(request: Request, payload: LoginRequest, response: Response):
        db = _db(request)
        actor = db.get_actor_by_username(payload.username)
        if not actor or not actor["is_active"] or not verify_password(
            payload.password, actor["password_hash"]
        ):
            raise HTTPException(status_code=401, detail="invalid username or password")
        token = new_session_token()
        db.create_session(actor["actor_id"], token, _config(request).session_days)
        response.set_cookie(
            "drive_session",
            token,
            httponly=True,
            samesite="lax",
            max_age=_config(request).session_days * 24 * 60 * 60,
        )
        return {"actor": public_actor(actor)}

    @router.post("/api/logout")
    async def logout(
        request: Request,
        response: Response,
        drive_session: str | None = Cookie(default=None),
    ):
        if drive_session:
            _db(request).delete_session(drive_session)
        response.delete_cookie("drive_session")
        return {"ok": True}

    @router.get("/api/session")
    async def session(
        request: Request,
        authorization: str | None = Header(default=None),
        drive_session: str | None = Cookie(default=None),
    ):
        actor = None
        db = _db(request)
        if authorization:
            scheme, _, token = authorization.partition(" ")
            if scheme.lower() == "bearer" and token:
                actor = db.get_actor_by_token(token)
        if not actor and drive_session:
            actor = db.get_actor_by_session(drive_session)
        return {"actor": public_actor(actor) if actor else None}

    @router.get("/api/me")
    async def me(actor: dict = Depends(current_actor)):
        return {"actor": public_actor(actor)}

    @router.patch("/api/me")
    async def update_me(
        payload: SelfUpdate,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        try:
            updated = _db(request).update_actor(
                actor["actor_id"],
                display_name=payload.display_name,
                password=payload.password,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"actor": updated}

    @router.get("/api/actors")
    async def actors(
        request: Request,
        actor_type: str = "all",
        include_inactive: bool = False,
        actor: dict = Depends(current_actor),
    ):
        if actor_type not in {"all", "user", "agent"}:
            raise HTTPException(status_code=400, detail="invalid actor type")
        if include_inactive:
            require_admin(actor)
        return {"actors": _db(request).list_actors(actor_type=actor_type, include_inactive=include_inactive)}

    @router.post("/api/actors")
    async def create_actor(
        payload: ActorCreate,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        require_admin(actor)
        created, token = _db(request).create_actor(
            kind=payload.kind,
            username=payload.username,
            actor_id=payload.actor_id,
            display_name=payload.display_name,
            password=payload.password,
            token=payload.token,
            is_admin=payload.is_admin,
        )
        workspace = _db(request).get_workspace(
            payload.username if payload.kind == "user" else created["actor_id"].split(":", 1)[1]
        )
        if workspace:
            ensure_workspace(_config(request).storage_dir, workspace["id"])
        return {"actor": created, "token": token}

    @router.patch("/api/actors/{actor_id}")
    async def update_actor(
        actor_id: str,
        payload: ActorUpdate,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        require_admin(actor)
        db = _db(request)
        if not db.get_actor(actor_id):
            raise HTTPException(status_code=404, detail="actor not found")
        try:
            updated = db.update_actor(
                actor_id,
                display_name=payload.display_name,
                password=payload.password,
                token=payload.token,
                is_admin=payload.is_admin,
                is_active=payload.is_active,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"actor": updated}

    @router.delete("/api/actors/{actor_id}")
    async def delete_actor(
        actor_id: str,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        require_admin(actor)
        db = _db(request)
        if not db.get_actor(actor_id):
            raise HTTPException(status_code=404, detail="actor not found")
        try:
            db.update_actor(actor_id, is_active=False)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True}

    @router.get("/api/workspaces")
    async def workspaces(request: Request, actor: dict = Depends(current_actor)):
        items = _db(request).list_workspaces(actor)
        for item in items:
            ensure_workspace(_config(request).storage_dir, item["id"])
        return {"workspaces": items}

    @router.post("/api/workspaces")
    async def create_workspace(
        payload: WorkspaceCreate,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        try:
            name = normalize_workspace_name(payload.name)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        member_permissions: dict[str, str] = {}
        for member in payload.members:
            if not db.get_actor(member.actor_id):
                raise HTTPException(status_code=404, detail="actor not found")
            if member.actor_id == actor["actor_id"]:
                continue
            member_permissions[member.actor_id] = member.permission
        workspace = db.create_workspace(
            name=name,
            kind=payload.kind,
            owner_actor_id=actor["actor_id"],
            created_by=actor["actor_id"],
            members=[
                {"actor_id": actor_id, "permission": permission}
                for actor_id, permission in member_permissions.items()
            ],
        )
        ensure_workspace(_config(request).storage_dir, workspace["id"])
        return {"workspace": workspace}

    @router.get("/api/workspaces/{workspace_name}/members")
    async def members(
        workspace_name: str,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        workspace = workspace_or_404(_db(request), workspace_name)
        require_permission(_db(request), actor, workspace, "", "read")
        return {"members": _db(request).list_members(workspace["id"])}

    @router.post("/api/workspaces/{workspace_name}/members")
    async def set_member(
        workspace_name: str,
        payload: MemberUpdate,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        workspace = workspace_or_404(db, workspace_name)
        if not db.can_write_workspace_members(actor, workspace["id"]):
            raise HTTPException(status_code=403, detail="workspace write permission required")
        if not db.get_actor(payload.actor_id):
            raise HTTPException(status_code=404, detail="actor not found")
        return {"member": db.set_member(workspace["id"], payload.actor_id, payload.permission)}

    @router.delete("/api/workspaces/{workspace_name}/members/{actor_id}")
    async def delete_member(
        workspace_name: str,
        actor_id: str,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        workspace = workspace_or_404(db, workspace_name)
        if not db.can_write_workspace_members(actor, workspace["id"]):
            raise HTTPException(status_code=403, detail="workspace write permission required")
        try:
            db.delete_member(workspace["id"], actor_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True}

    @router.delete("/api/workspaces/{workspace_name}")
    async def delete_workspace(
        workspace_name: str,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        workspace = workspace_or_404(db, workspace_name)
        if workspace["kind"] != "share_group":
            raise HTTPException(status_code=400, detail="only share_group workspaces can be deleted")
        if not db.can_delete_workspace(actor, workspace["id"]):
            raise HTTPException(status_code=403, detail="workspace owner permission required")
        db.delete_workspace(workspace["id"])
        shutil.rmtree(_config(request).storage_dir / str(workspace["id"]), ignore_errors=True)
        return {"ok": True}

    @router.get("/api/files")
    async def list_files(
        request: Request,
        workspace: str,
        path: str = "",
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, workspace)
        normalized = normalize_path(path)
        permission = require_permission(db, actor, ws, normalized, "read")
        ensure_workspace(_config(request).storage_dir, ws["id"])
        try:
            items = list_directory(_config(request).storage_dir, ws["id"], normalized)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="folder not found") from exc
        except NotADirectoryError as exc:
            raise HTTPException(status_code=400, detail="path is not a folder") from exc
        return {
            "workspace": ws,
            "path": normalized,
            "permission": permission,
            "items": items,
        }

    @router.post("/api/folders")
    async def create_folder(
        payload: FolderCreate,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, payload.workspace)
        normalized = normalize_path(payload.path)
        require_permission(db, actor, ws, parent_path(normalized), "write")
        make_folder(_config(request).storage_dir, ws["id"], normalized)
        return {"path": normalized, "kind": "folder"}

    @router.get("/api/files/text")
    async def get_text(
        request: Request,
        workspace: str,
        path: str,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, workspace)
        normalized = normalize_path(path)
        require_permission(db, actor, ws, normalized, "read")
        try:
            content = read_text(_config(request).storage_dir, ws["id"], normalized)
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=415, detail="file is not UTF-8 text") from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="file not found") from exc
        return {
            "workspace": workspace,
            "path": normalized,
            "preview_type": preview_type(normalized),
            "content": content,
        }

    @router.post("/api/files/text")
    async def put_text(
        payload: TextWrite,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, payload.workspace)
        normalized = normalize_path(payload.path)
        target = resolve_path(_config(request).storage_dir, ws["id"], normalized)
        check_path = normalized if target.exists() else parent_path(normalized)
        require_permission(db, actor, ws, check_path, "write")
        write_text(_config(request).storage_dir, ws["id"], normalized, payload.content)
        return {
            "workspace": payload.workspace,
            "path": normalized,
            "preview_type": preview_type(normalized),
        }

    @router.post("/api/files/upload")
    async def upload_file(
        request: Request,
        workspace: str = Form(...),
        path: str = Form(""),
        file: UploadFile = File(...),
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, workspace)
        folder = normalize_path(path)
        require_permission(db, actor, ws, folder, "write")
        filename = normalize_path(file.filename)
        if not filename or "/" in filename:
            raise HTTPException(status_code=400, detail="invalid filename")
        destination_path = f"{folder}/{filename}" if folder else filename
        destination = resolve_path(_config(request).storage_dir, ws["id"], destination_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as handle:
            shutil.copyfileobj(file.file, handle)
        return {
            "workspace": workspace,
            "path": destination_path,
            "preview_type": preview_type(destination_path),
        }

    @router.delete("/api/files")
    async def remove_file(
        request: Request,
        workspace: str,
        path: str,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, workspace)
        normalized = normalize_path(path)
        require_permission(db, actor, ws, normalized, "write")
        try:
            delete_path(_config(request).storage_dir, ws["id"], normalized)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="path not found") from exc
        db.delete_public_links_for_path(ws["id"], normalized)
        return {"ok": True}

    @router.post("/api/files/copy")
    async def copy_file(
        payload: PathCopyOrMove,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, payload.workspace)
        source = normalize_path(payload.source_path)
        destination = normalize_path(payload.destination_path)
        require_permission(db, actor, ws, source, "read")
        require_permission(db, actor, ws, parent_path(destination), "write")
        try:
            copy_path(_config(request).storage_dir, ws["id"], source, destination)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="source path not found") from exc
        except FileExistsError as exc:
            raise HTTPException(status_code=409, detail="destination path already exists") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        target = resolve_path(_config(request).storage_dir, ws["id"], destination)
        return {
            "workspace": payload.workspace,
            "path": destination,
            "kind": "folder" if target.is_dir() else "file",
            "preview_type": preview_type(destination, target.is_dir()),
        }

    @router.post("/api/files/move")
    async def move_file(
        payload: PathCopyOrMove,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, payload.workspace)
        source = normalize_path(payload.source_path)
        destination = normalize_path(payload.destination_path)
        require_permission(db, actor, ws, source, "write")
        require_permission(db, actor, ws, parent_path(destination), "write")
        try:
            move_path(_config(request).storage_dir, ws["id"], source, destination)
            db.move_item_permissions(ws["id"], source, destination)
            db.move_public_links(ws["id"], source, destination)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="source path not found") from exc
        except FileExistsError as exc:
            raise HTTPException(status_code=409, detail="destination path already exists") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        target = resolve_path(_config(request).storage_dir, ws["id"], destination)
        return {
            "workspace": payload.workspace,
            "path": destination,
            "kind": "folder" if target.is_dir() else "file",
            "preview_type": preview_type(destination, target.is_dir()),
        }

    @router.post("/api/files/rename")
    async def rename_file(
        payload: PathRename,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, payload.workspace)
        source = normalize_path(payload.path)
        require_permission(db, actor, ws, source, "write")
        try:
            destination = rename_path(
                _config(request).storage_dir,
                ws["id"],
                source,
                payload.new_name,
            )
            db.move_item_permissions(ws["id"], source, destination)
            db.move_public_links(ws["id"], source, destination)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="source path not found") from exc
        except FileExistsError as exc:
            raise HTTPException(status_code=409, detail="destination path already exists") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        target = resolve_path(_config(request).storage_dir, ws["id"], destination)
        return {
            "workspace": payload.workspace,
            "path": destination,
            "kind": "folder" if target.is_dir() else "file",
            "preview_type": preview_type(destination, target.is_dir()),
        }

    @router.get("/api/files/download")
    async def download_file(
        request: Request,
        workspace: str,
        path: str,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, workspace)
        normalized = normalize_path(path)
        require_permission(db, actor, ws, normalized, "read")
        target = resolve_path(_config(request).storage_dir, ws["id"], normalized)
        if not target.exists() or target.is_dir():
            raise HTTPException(status_code=404, detail="file not found")
        return FileResponse(
            target,
            media_type=guess_media_type(normalized),
            filename=Path(normalized).name,
        )

    @router.get("/api/files/markdown")
    async def markdown_preview(
        request: Request,
        workspace: str,
        path: str,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, workspace)
        normalized = normalize_path(path)
        require_permission(db, actor, ws, normalized, "read")
        try:
            content = read_text(_config(request).storage_dir, ws["id"], normalized)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="file not found") from exc
        return HTMLResponse(md.render(content))

    @router.post("/api/shares")
    async def share_item(
        payload: ShareCreate,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, payload.workspace)
        normalized = normalize_path(payload.path)
        require_permission(db, actor, ws, normalized, "write")
        if not db.get_actor(payload.actor_id):
            raise HTTPException(status_code=404, detail="actor not found")
        if normalized:
            target = resolve_path(_config(request).storage_dir, ws["id"], normalized)
            if not target.exists():
                raise HTTPException(status_code=404, detail="path not found")
        return {
            "share": db.set_item_permission(
                ws["id"], normalized, payload.actor_id, payload.permission
            )
        }

    @router.get("/api/shares")
    async def shares(
        request: Request,
        workspace: str,
        path: str | None = None,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, workspace)
        require_permission(db, actor, ws, path or "", "write")
        return {"shares": db.list_item_permissions(ws["id"], path)}

    @router.post("/api/public-links")
    async def create_public_link(
        payload: PublicLinkCreate,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, payload.workspace)
        normalized = normalize_path(payload.path)
        require_permission(db, actor, ws, normalized, "write")
        if not normalized:
            raise HTTPException(status_code=400, detail="public links require a file path")
        target = resolve_path(_config(request).storage_dir, ws["id"], normalized)
        if not target.exists() or target.is_dir():
            raise HTTPException(status_code=400, detail="public links only support files")
        link = db.create_public_link(ws["id"], normalized, actor["actor_id"])
        return {"public_link": public_link_payload(link)}

    @router.get("/api/public-links")
    async def list_public_links(
        request: Request,
        workspace: str,
        path: str | None = None,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, workspace)
        if path is None:
            require_permission(db, actor, ws, "", "write")
            return {
                "target_kind": "workspace",
                "public_links": [public_link_payload(link) for link in db.list_public_links(ws["id"])],
            }
        normalized = normalize_path(path)
        require_permission(db, actor, ws, normalized, "write")
        if not normalized:
            return {"target_kind": "folder", "public_links": []}
        target = resolve_path(_config(request).storage_dir, ws["id"], normalized)
        if not target.exists():
            raise HTTPException(status_code=404, detail="path not found")
        target_kind = "folder" if target.is_dir() else "file"
        return {
            "target_kind": target_kind,
            "public_links": [public_link_payload(link) for link in db.list_public_links(ws["id"], normalized)],
        }

    @router.delete("/api/public-links/{link_id}")
    async def remove_public_link(
        link_id: int,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        link = db.get_public_link(link_id)
        if not link:
            raise HTTPException(status_code=404, detail="public link not found")
        workspace = workspace_or_404(db, link["workspace_id"])
        require_permission(db, actor, workspace, link["path"], "write")
        db.delete_public_link(link_id)
        return {"ok": True}

    @router.delete("/api/shares/{share_id}")
    async def remove_share(
        share_id: int,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        share = db.get_item_permission(share_id)
        if not share:
            raise HTTPException(status_code=404, detail="share not found")
        workspace = workspace_or_404(db, share["workspace_id"])
        require_permission(db, actor, workspace, share["path"], "write")
        db.delete_item_permission(share_id)
        return {"ok": True}

    @router.get("/api/shared")
    async def shared_with_me(request: Request, actor: dict = Depends(current_actor)):
        items = _db(request).list_shared_items(actor)
        for item in items:
            target = resolve_path(_config(request).storage_dir, item["workspace_id"], item["path"])
            item["kind"] = "folder" if target.is_dir() else "file"
            item["preview_type"] = preview_type(item["path"], target.is_dir())
            item["parent_path"] = parent_path(item["path"])
        return {"items": items}

    @router.get("/preview/{workspace}/{path:path}")
    async def preview(
        workspace: str,
        path: str,
        request: Request,
        actor: dict = Depends(current_actor),
    ):
        db = _db(request)
        ws = workspace_or_404(db, workspace)
        normalized = normalize_path(path)
        require_permission(db, actor, ws, normalized, "read")
        target = resolve_path(_config(request).storage_dir, ws["id"], normalized)
        if target.is_dir():
            index = target / "index.html"
            if index.exists():
                normalized = f"{normalized}/index.html" if normalized else "index.html"
                target = index
            else:
                raise HTTPException(status_code=404, detail="folder preview needs index.html")
        if not target.exists():
            raise HTTPException(status_code=404, detail="file not found")
        return FileResponse(
            target,
            media_type=guess_media_type(normalized),
            headers={"Cache-Control": "no-store"},
        )

    @router.get("/public/{token}")
    async def public_download(token: str, request: Request):
        db = _db(request)
        link = db.get_public_link_by_token(token)
        if not link:
            raise HTTPException(status_code=404, detail="public link not found")
        workspace = db.get_workspace(link["workspace_id"])
        if not workspace:
            raise HTTPException(status_code=404, detail="workspace not found")
        target = resolve_path(_config(request).storage_dir, workspace["id"], link["path"])
        if not target.exists() or target.is_dir():
            raise HTTPException(status_code=404, detail="file not found")
        return FileResponse(
            target,
            media_type=guess_media_type(link["path"]),
            filename=Path(link["path"]).name,
            headers={"Cache-Control": "no-store"},
        )

    return router

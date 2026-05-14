from __future__ import annotations

import sqlite3

from fastapi.testclient import TestClient

from drive_board.main import create_app


def make_client(tmp_path):
    return TestClient(create_app(str(tmp_path)))


def login(client: TestClient, username: str = "huangshiyu", password: str = "huangshiyu"):
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return response


def agent_headers(token: str = "main-agent-token"):
    return {"Authorization": f"Bearer {token}"}


def test_login_and_token_identity(tmp_path):
    client = make_client(tmp_path)

    login(client)
    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["actor"]["actor_id"] == "user:huangshiyu"

    agent = client.get("/api/me", headers=agent_headers())
    assert agent.status_code == 200
    assert agent.json()["actor"]["actor_id"] == "agent:main-agent"


def test_app_routes_return_spa_shell(tmp_path):
    client = make_client(tmp_path)

    for path in ["/app/files/huangshiyu/notes", "/app/share-manager/huangshiyu"]:
        response = client.get(path)
        assert response.status_code == 200
        assert "Online Drive" in response.text


def test_self_profile_update(tmp_path):
    client = make_client(tmp_path)

    login(client)
    update = client.patch(
        "/api/me",
        json={"display_name": "HSY Updated", "password": "new-password-123"},
    )
    assert update.status_code == 200, update.text
    assert update.json()["actor"]["display_name"] == "HSY Updated"

    client.post("/api/logout")
    relogin = client.post("/api/login", json={"username": "huangshiyu", "password": "new-password-123"})
    assert relogin.status_code == 200, relogin.text


def test_workspace_visibility_and_admin_visibility(tmp_path):
    client = make_client(tmp_path)

    agent_spaces = client.get("/api/workspaces", headers=agent_headers()).json()["workspaces"]
    assert [workspace["name"] for workspace in agent_spaces] == ["main-agent"]

    login(client, "admin", "admin")
    admin_spaces = client.get("/api/workspaces").json()["workspaces"]
    names = {workspace["name"] for workspace in admin_spaces}
    assert {"admin", "huangshiyu", "main-agent", "cli-agent"}.issubset(names)


def test_file_lifecycle_and_text_edit(tmp_path):
    client = make_client(tmp_path)
    login(client)

    response = client.post("/api/folders", json={"workspace": "huangshiyu", "path": "notes"})
    assert response.status_code == 200, response.text

    response = client.post(
        "/api/files/text",
        json={"workspace": "huangshiyu", "path": "notes/readme.md", "content": "# Hello"},
    )
    assert response.status_code == 200, response.text

    listing = client.get("/api/files", params={"workspace": "huangshiyu", "path": "notes"})
    assert listing.status_code == 200
    assert listing.json()["items"][0]["name"] == "readme.md"

    text = client.get(
        "/api/files/text", params={"workspace": "huangshiyu", "path": "notes/readme.md"}
    )
    assert text.json()["content"] == "# Hello"

    download = client.get(
        "/api/files/download", params={"workspace": "huangshiyu", "path": "notes/readme.md"}
    )
    assert download.status_code == 200
    assert download.text == "# Hello"


def test_folder_share_and_html_relative_preview(tmp_path):
    client = make_client(tmp_path)
    login(client)

    assert client.post("/api/folders", json={"workspace": "huangshiyu", "path": "test_html"}).status_code == 200
    assert (
        client.post(
            "/api/files/text",
            json={
                "workspace": "huangshiyu",
                "path": "test_html/index.html",
                "content": '<link rel="stylesheet" href="./style.css"><h1>OK</h1>',
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/files/text",
            json={
                "workspace": "huangshiyu",
                "path": "test_html/style.css",
                "content": "h1 { color: red; }",
            },
        ).status_code
        == 200
    )

    share = client.post(
        "/api/shares",
        json={
            "workspace": "huangshiyu",
            "path": "test_html",
            "actor_id": "agent:main-agent",
            "permission": "read",
        },
    )
    assert share.status_code == 200, share.text

    root_denied = client.get(
        "/api/files",
        params={"workspace": "huangshiyu", "path": ""},
        headers=agent_headers(),
    )
    assert root_denied.status_code == 403

    folder = client.get(
        "/api/files",
        params={"workspace": "huangshiyu", "path": "test_html"},
        headers=agent_headers(),
    )
    assert folder.status_code == 200, folder.text
    assert {item["name"] for item in folder.json()["items"]} == {"index.html", "style.css"}

    html = client.get("/preview/huangshiyu/test_html/index.html", headers=agent_headers())
    css = client.get("/preview/huangshiyu/test_html/style.css", headers=agent_headers())
    assert html.status_code == 200
    assert './style.css' in html.text
    assert css.status_code == 200
    assert "color: red" in css.text


def test_pdf_preview_route_returns_pdf_media_type(tmp_path):
    client = make_client(tmp_path)
    login(client)

    upload = client.post(
        "/api/files/upload",
        data={"workspace": "huangshiyu", "path": ""},
        files={
            "file": (
                "sample.pdf",
                b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n",
                "application/pdf",
            )
        },
    )
    assert upload.status_code == 200, upload.text

    preview = client.get("/preview/huangshiyu/sample.pdf")
    assert preview.status_code == 200, preview.text
    assert preview.headers["content-type"].startswith("application/pdf")


def test_upload_requires_overwrite_and_supports_named_destination(tmp_path):
    client = make_client(tmp_path)
    login(client)

    first_upload = client.post(
        "/api/files/upload",
        data={"workspace": "huangshiyu", "path": "reports/"},
        files={"file": ("sample.txt", b"first", "text/plain")},
    )
    assert first_upload.status_code == 200, first_upload.text
    assert first_upload.json()["path"] == "reports/sample.txt"

    conflicting_upload = client.post(
        "/api/files/upload",
        data={"workspace": "huangshiyu", "path": "reports/"},
        files={"file": ("sample.txt", b"second", "text/plain")},
    )
    assert conflicting_upload.status_code == 409, conflicting_upload.text

    overwrite_upload = client.post(
        "/api/files/upload",
        data={"workspace": "huangshiyu", "path": "reports/", "overwrite": "true"},
        files={"file": ("sample.txt", b"second", "text/plain")},
    )
    assert overwrite_upload.status_code == 200, overwrite_upload.text

    overwritten_text = client.get(
        "/api/files/text", params={"workspace": "huangshiyu", "path": "reports/sample.txt"}
    )
    assert overwritten_text.status_code == 200, overwritten_text.text
    assert overwritten_text.json()["content"] == "second"

    named_upload = client.post(
        "/api/files/upload",
        data={"workspace": "huangshiyu", "path": "reports/final-name.md"},
        files={"file": ("ignored-name.txt", b"named", "text/plain")},
    )
    assert named_upload.status_code == 200, named_upload.text
    assert named_upload.json()["path"] == "reports/final-name.md"

    named_text = client.get(
        "/api/files/text", params={"workspace": "huangshiyu", "path": "reports/final-name.md"}
    )
    assert named_text.status_code == 200, named_text.text
    assert named_text.json()["content"] == "named"


def test_public_link_download_and_revoke(tmp_path):
    client = make_client(tmp_path)
    anonymous = make_client(tmp_path)
    login(client)

    create_text = client.post(
        "/api/files/text",
        json={
            "workspace": "huangshiyu",
            "path": "public-note.txt",
            "content": "public download",
        },
    )
    assert create_text.status_code == 200, create_text.text

    create_folder = client.post("/api/folders", json={"workspace": "huangshiyu", "path": "public-folder"})
    assert create_folder.status_code == 200, create_folder.text

    invalid_folder_link = client.post(
        "/api/public-links",
        json={"workspace": "huangshiyu", "path": "public-folder"},
    )
    assert invalid_folder_link.status_code == 400, invalid_folder_link.text

    created = client.post(
        "/api/public-links",
        json={"workspace": "huangshiyu", "path": "public-note.txt"},
    )
    assert created.status_code == 200, created.text
    link = created.json()["public_link"]
    assert link["download_url"].startswith("/public/")

    recreated = client.post(
        "/api/public-links",
        json={"workspace": "huangshiyu", "path": "public-note.txt"},
    )
    assert recreated.status_code == 200, recreated.text
    assert recreated.json()["public_link"]["id"] == link["id"]
    assert recreated.json()["public_link"]["token"] == link["token"]

    listed = client.get(
        "/api/public-links",
        params={"workspace": "huangshiyu", "path": "public-note.txt"},
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["target_kind"] == "file"
    assert [item["id"] for item in listed.json()["public_links"]] == [link["id"]]

    public_download = anonymous.get(link["download_url"])
    assert public_download.status_code == 200, public_download.text
    assert public_download.text == "public download"

    revoked = client.delete(f"/api/public-links/{link['id']}")
    assert revoked.status_code == 200, revoked.text

    revoked_download = anonymous.get(link["download_url"])
    assert revoked_download.status_code == 404, revoked_download.text


def test_html_public_link_renders_in_browser_instead_of_downloading(tmp_path):
    client = make_client(tmp_path)
    anonymous = make_client(tmp_path)
    login(client)

    create_html = client.post(
        "/api/files/text",
        json={
            "workspace": "huangshiyu",
            "path": "public-page.html",
            "content": "<!doctype html><html><head><style>body{font-family:sans-serif}</style></head><body><h1>Public HTML</h1><script>window.rendered = true;</script></body></html>",
        },
    )
    assert create_html.status_code == 200, create_html.text

    created = client.post(
        "/api/public-links",
        json={"workspace": "huangshiyu", "path": "public-page.html"},
    )
    assert created.status_code == 200, created.text
    link = created.json()["public_link"]

    public_response = anonymous.get(link["download_url"])
    assert public_response.status_code == 200, public_response.text
    assert public_response.headers["content-type"].startswith("text/html")
    assert "attachment" not in public_response.headers.get("content-disposition", "").lower()
    assert "<h1>Public HTML</h1>" in public_response.text


def test_public_link_schema_deduplicates_existing_rows_on_startup(tmp_path):
    client = make_client(tmp_path)
    login(client)

    create_text = client.post(
        "/api/files/text",
        json={
            "workspace": "huangshiyu",
            "path": "dup-note.txt",
            "content": "duplicate cleanup",
        },
    )
    assert create_text.status_code == 200, create_text.text

    created = client.post(
        "/api/public-links",
        json={"workspace": "huangshiyu", "path": "dup-note.txt"},
    )
    assert created.status_code == 200, created.text
    first_link = created.json()["public_link"]

    db_path = tmp_path / "drive_board.sqlite3"
    with sqlite3.connect(db_path) as connection:
        connection.execute("DROP INDEX IF EXISTS idx_public_links_workspace_path_unique")
        connection.execute(
            """
            INSERT INTO public_links (workspace_id, path, token, created_by, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (2, "dup-note.txt", "legacy-duplicate-token", "user:huangshiyu", "2026-05-14T07:00:00+00:00"),
        )
        connection.commit()

    restarted = make_client(tmp_path)
    login(restarted)

    listed = restarted.get(
        "/api/public-links",
        params={"workspace": "huangshiyu", "path": "dup-note.txt"},
    )
    assert listed.status_code == 200, listed.text
    public_links = listed.json()["public_links"]
    assert len(public_links) == 1
    assert public_links[0]["id"] == first_link["id"]
    assert public_links[0]["token"] == first_link["token"]


def test_share_member_and_actor_management_routes(tmp_path):
    client = make_client(tmp_path)

    login(client)
    create_workspace = client.post(
        "/api/workspaces",
        json={
            "name": "team-alpha",
            "kind": "share_group",
            "members": [{"actor_id": "agent:main-agent", "permission": "read"}],
        },
    )
    assert create_workspace.status_code == 200, create_workspace.text

    members = client.get("/api/workspaces/team-alpha/members")
    assert members.status_code == 200, members.text
    member_permissions = {item["actor_id"]: item["permission"] for item in members.json()["members"]}
    assert member_permissions["user:huangshiyu"] == "owner"
    assert member_permissions["agent:main-agent"] == "read"

    share = client.post(
        "/api/shares",
        json={
            "workspace": "huangshiyu",
            "path": "",
            "actor_id": "agent:main-agent",
            "permission": "read",
        },
    )
    assert share.status_code == 200, share.text
    share_id = share.json()["share"]["id"]

    listed = client.get("/api/shares", params={"workspace": "huangshiyu"})
    assert listed.status_code == 200, listed.text
    assert any(item["id"] == share_id for item in listed.json()["shares"])

    deleted = client.delete(f"/api/shares/{share_id}")
    assert deleted.status_code == 200, deleted.text

    update_member = client.post(
        "/api/workspaces/team-alpha/members",
        json={"actor_id": "agent:main-agent", "permission": "write"},
    )
    assert update_member.status_code == 200, update_member.text
    assert update_member.json()["member"]["permission"] == "write"

    remove_member = client.delete("/api/workspaces/team-alpha/members/agent:main-agent")
    assert remove_member.status_code == 200, remove_member.text

    delete_workspace = client.delete("/api/workspaces/team-alpha")
    assert delete_workspace.status_code == 200, delete_workspace.text

    deleted_members = client.get("/api/workspaces/team-alpha/members")
    assert deleted_members.status_code == 404, deleted_members.text

    listed_workspaces = client.get("/api/workspaces")
    assert listed_workspaces.status_code == 200, listed_workspaces.text
    assert all(item["name"] != "team-alpha" for item in listed_workspaces.json()["workspaces"])

    login(client, "admin", "admin")
    seeded_actors = client.get("/api/actors", params={"include_inactive": "true"})
    assert seeded_actors.status_code == 200, seeded_actors.text
    main_agent = next(item for item in seeded_actors.json()["actors"] if item["actor_id"] == "agent:main-agent")
    admin_user = next(item for item in seeded_actors.json()["actors"] if item["actor_id"] == "user:admin")
    assert main_agent["token"] == "main-agent-token"
    assert admin_user["token"] is None

    create_actor = client.post(
        "/api/actors",
        json={
            "kind": "user",
            "username": "newuser",
            "display_name": "New User",
            "password": "secret-123",
        },
    )
    assert create_actor.status_code == 200, create_actor.text

    update_actor = client.patch(
        "/api/actors/user:newuser",
        json={"display_name": "Renamed User", "password": "updated-secret-456", "is_active": True},
    )
    assert update_actor.status_code == 200, update_actor.text
    assert update_actor.json()["actor"]["display_name"] == "Renamed User"

    delete_last_admin = client.delete("/api/actors/user:admin")
    assert delete_last_admin.status_code == 400, delete_last_admin.text

    newuser_client = make_client(tmp_path)
    login(newuser_client, "newuser", "updated-secret-456")

    create_owned_workspace = newuser_client.post(
        "/api/workspaces",
        json={"name": "newuser-team", "kind": "share_group", "members": []},
    )
    assert create_owned_workspace.status_code == 200, create_owned_workspace.text

    create_agent = client.post(
        "/api/actors",
        json={
            "kind": "agent",
            "actor_id": "agent:token-viewer",
            "display_name": "Token Viewer",
            "token": "viewer-token-123",
        },
    )
    assert create_agent.status_code == 200, create_agent.text

    update_agent = client.patch(
        "/api/actors/agent:token-viewer",
        json={"token": "viewer-token-456", "display_name": "Token Viewer Updated"},
    )
    assert update_agent.status_code == 200, update_agent.text

    actors_with_tokens = client.get("/api/actors", params={"include_inactive": "true"})
    assert actors_with_tokens.status_code == 200, actors_with_tokens.text
    token_viewer = next(item for item in actors_with_tokens.json()["actors"] if item["actor_id"] == "agent:token-viewer")
    assert token_viewer["display_name"] == "Token Viewer Updated"
    assert token_viewer["token"] == "viewer-token-456"

    workspaces_before_delete = client.get("/api/workspaces")
    assert workspaces_before_delete.status_code == 200, workspaces_before_delete.text
    newuser_workspace = next(item for item in workspaces_before_delete.json()["workspaces"] if item["name"] == "newuser")
    private_workspace_storage = tmp_path / "storage" / str(newuser_workspace["id"])
    assert private_workspace_storage.is_dir()

    blocked_delete = client.delete("/api/actors/user:newuser")
    assert blocked_delete.status_code == 400, blocked_delete.text
    assert "last owner of shared workspace newuser-team" in blocked_delete.text

    add_admin_owner = newuser_client.post(
        "/api/workspaces/newuser-team/members",
        json={"actor_id": "user:admin", "permission": "owner"},
    )
    assert add_admin_owner.status_code == 200, add_admin_owner.text

    delete_actor = client.delete("/api/actors/user:newuser")
    assert delete_actor.status_code == 200, delete_actor.text

    actors = client.get("/api/actors", params={"include_inactive": "true"})
    assert actors.status_code == 200, actors.text
    assert all(item["actor_id"] != "user:newuser" for item in actors.json()["actors"])

    workspaces_after_delete = client.get("/api/workspaces")
    assert workspaces_after_delete.status_code == 200, workspaces_after_delete.text
    workspace_names = {item["name"] for item in workspaces_after_delete.json()["workspaces"]}
    assert "newuser" not in workspace_names
    assert "newuser-team" in workspace_names
    assert not private_workspace_storage.exists()

    deleted_login = newuser_client.post(
        "/api/login",
        json={"username": "newuser", "password": "updated-secret-456"},
    )
    assert deleted_login.status_code == 401, deleted_login.text


def test_file_copy_move_rename_and_share_path_updates(tmp_path):
    client = make_client(tmp_path)
    anonymous = make_client(tmp_path)
    login(client)

    assert client.post("/api/folders", json={"workspace": "huangshiyu", "path": "archive"}).status_code == 200
    assert client.post("/api/folders", json={"workspace": "huangshiyu", "path": "reports"}).status_code == 200
    assert (
        client.post(
            "/api/files/text",
            json={
                "workspace": "huangshiyu",
                "path": "reports/daily.md",
                "content": "daily report",
            },
        ).status_code
        == 200
    )

    copied = client.post(
        "/api/files/copy",
        json={
            "workspace": "huangshiyu",
            "source_path": "reports/daily.md",
            "destination_path": "reports/daily-copy.md",
        },
    )
    assert copied.status_code == 200, copied.text

    copied_text = client.get(
        "/api/files/text",
        params={"workspace": "huangshiyu", "path": "reports/daily-copy.md"},
    )
    assert copied_text.status_code == 200, copied_text.text
    assert copied_text.json()["content"] == "daily report"

    public_link = client.post(
        "/api/public-links",
        json={"workspace": "huangshiyu", "path": "reports/daily-copy.md"},
    )
    assert public_link.status_code == 200, public_link.text
    public_download_url = public_link.json()["public_link"]["download_url"]
    assert public_download_url.startswith("/public/")

    renamed = client.post(
        "/api/files/rename",
        json={
            "workspace": "huangshiyu",
            "path": "reports/daily-copy.md",
            "new_name": "summary.md",
        },
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["path"] == "reports/summary.md"

    moved = client.post(
        "/api/files/move",
        json={
            "workspace": "huangshiyu",
            "source_path": "reports/summary.md",
            "destination_path": "archive/summary.md",
        },
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["path"] == "archive/summary.md"

    remapped_public_download = anonymous.get(public_download_url)
    assert remapped_public_download.status_code == 200, remapped_public_download.text
    assert remapped_public_download.text == "daily report"

    archive_listing = client.get("/api/files", params={"workspace": "huangshiyu", "path": "archive"})
    assert archive_listing.status_code == 200, archive_listing.text
    assert {item["name"] for item in archive_listing.json()["items"]} == {"summary.md"}

    share = client.post(
        "/api/shares",
        json={
            "workspace": "huangshiyu",
            "path": "reports",
            "actor_id": "agent:main-agent",
            "permission": "read",
        },
    )
    assert share.status_code == 200, share.text

    move_folder = client.post(
        "/api/files/move",
        json={
            "workspace": "huangshiyu",
            "source_path": "reports",
            "destination_path": "archive/reports",
        },
    )
    assert move_folder.status_code == 200, move_folder.text

    old_shared_path = client.get(
        "/api/files",
        params={"workspace": "huangshiyu", "path": "reports"},
        headers=agent_headers(),
    )
    assert old_shared_path.status_code in {403, 404}

    new_shared_path = client.get(
        "/api/files",
        params={"workspace": "huangshiyu", "path": "archive/reports"},
        headers=agent_headers(),
    )
    assert new_shared_path.status_code == 200, new_shared_path.text
    assert {item["name"] for item in new_shared_path.json()["items"]} == {"daily.md"}

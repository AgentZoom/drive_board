from __future__ import annotations

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

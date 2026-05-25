from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse

from .api import create_api_router
from .config import get_config
from .db import Database


WEB_DIR = Path(__file__).parent / "web"
LOGIN_HTML = (WEB_DIR / "login.html").read_text(encoding="utf-8")
APP_HTML = (WEB_DIR / "app.html").read_text(encoding="utf-8")


def _render_app_shell(*, is_admin: bool, extension_module: str | None = None, extension_style: str | None = None) -> HTMLResponse:
    extension_link = (
        '<a id="extensionEntryLink" class="sidebar-action secondary nav-button" href="/app/admin/actors">用户管理</a>'
        if is_admin
        else ""
    )
    html = (
        APP_HTML.replace("__EXTENSION_NAV_LINK__", extension_link)
        .replace("__EXTENSION_MODULE__", extension_module or "")
        .replace("__EXTENSION_STYLE__", extension_style or "")
    )
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})


def _current_actor_from_request(request: Request) -> dict | None:
    db = request.app.state.db
    authorization = request.headers.get("authorization")
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            actor = db.get_actor_by_token(token)
            if actor:
                return actor
    drive_session = request.cookies.get("drive_session")
    if drive_session:
        actor = db.get_actor_by_session(drive_session)
        if actor:
            return actor
    return None


def _auth_file_response(request: Request, relative_path: str) -> FileResponse:
    actor = _current_actor_from_request(request)
    if not actor:
        raise HTTPException(status_code=401, detail="authentication required")
    return FileResponse(WEB_DIR / relative_path, headers={"Cache-Control": "no-store"})


def _admin_file_response(request: Request, relative_path: str) -> FileResponse:
    actor = _current_actor_from_request(request)
    if not actor:
        raise HTTPException(status_code=401, detail="authentication required")
    if not actor["is_admin"]:
        raise HTTPException(status_code=403, detail="admin permission required")
    return FileResponse(WEB_DIR / relative_path, headers={"Cache-Control": "no-store"})


def create_app(data_dir: str | None = None) -> FastAPI:
    config = get_config(data_dir)
    db = Database(config)
    db.init()

    app = FastAPI(title="Drive Board", version="0.1.0")
    app.state.config = config
    app.state.db = db
    app.include_router(create_api_router())

    @app.get("/static/login.css")
    async def public_login_css():
        return FileResponse(WEB_DIR / "static" / "login.css", headers={"Cache-Control": "no-store"})

    @app.get("/static/login.js")
    async def public_login_js():
        return FileResponse(WEB_DIR / "static" / "login.js", headers={"Cache-Control": "no-store"})

    @app.get("/assets/app.css")
    async def app_css(request: Request):
        return _auth_file_response(request, "static/styles.css")

    @app.get("/assets/app.js")
    async def app_js(request: Request):
        return _auth_file_response(request, "static/app.js")

    @app.get("/assets/admin.css")
    async def admin_css(request: Request):
        return _admin_file_response(request, "static/admin.css")

    @app.get("/assets/admin.js")
    async def admin_js(request: Request):
        return _admin_file_response(request, "static/admin.js")

    @app.get("/")
    async def index(request: Request):
        actor = _current_actor_from_request(request)
        if not actor:
            return HTMLResponse(LOGIN_HTML, headers={"Cache-Control": "no-store"})
        return _render_app_shell(is_admin=bool(actor["is_admin"]))

    @app.get("/app")
    async def app_index(request: Request):
        actor = _current_actor_from_request(request)
        if not actor:
            return HTMLResponse(LOGIN_HTML, headers={"Cache-Control": "no-store"})
        return _render_app_shell(is_admin=bool(actor["is_admin"]))

    @app.get("/app/{frontend_path:path}")
    async def app_index_path(frontend_path: str, request: Request):
        actor = _current_actor_from_request(request)
        if not actor:
            return HTMLResponse(LOGIN_HTML, headers={"Cache-Control": "no-store"})
        normalized = frontend_path.strip("/")
        if normalized.startswith("admin/"):
            if not actor["is_admin"]:
                raise HTTPException(status_code=403, detail="admin permission required")
            return _render_app_shell(
                is_admin=True,
                extension_module="/assets/admin.js",
                extension_style="/assets/admin.css",
            )
        return _render_app_shell(is_admin=bool(actor["is_admin"]))

    @app.get("/healthz")
    async def healthz():
        return {"ok": True}

    return app


app = create_app()

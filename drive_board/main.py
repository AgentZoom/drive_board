from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse

from .api import create_api_router
from .config import get_config
from .db import Database


WEB_DIR = Path(__file__).parent / "web"


@dataclass(frozen=True)
class FrontendAssets:
    login_html_path: Path
    app_html_path: Path
    login_css_path: Path
    login_js_path: Path
    app_css_path: Path
    app_js_path: Path
    admin_css_path: Path
    admin_js_path: Path


def resolve_frontend_assets(config, web_dir: Path = WEB_DIR) -> FrontendAssets:
    static_dir = web_dir / "static"
    if not config.is_production:
        return FrontendAssets(
            login_html_path=web_dir / "login.html",
            app_html_path=web_dir / "app.html",
            login_css_path=static_dir / "login.css",
            login_js_path=static_dir / "login.js",
            app_css_path=static_dir / "styles.css",
            app_js_path=static_dir / "app.js",
            admin_css_path=static_dir / "admin.css",
            admin_js_path=static_dir / "admin.js",
        )

    dist_dir = web_dir / "dist"
    assets = FrontendAssets(
        login_html_path=dist_dir / "login.html",
        app_html_path=dist_dir / "app.html",
        login_css_path=dist_dir / "login.css",
        login_js_path=dist_dir / "login.js",
        app_css_path=dist_dir / "app.css",
        app_js_path=dist_dir / "app.js",
        admin_css_path=dist_dir / "admin.css",
        admin_js_path=dist_dir / "admin.js",
    )
    missing = [str(path.relative_to(web_dir)) for path in assets.__dict__.values() if not path.exists()]
    if missing:
        missing_text = ", ".join(missing)
        raise RuntimeError(
            f"production frontend assets are missing: {missing_text}. "
            "Run `npm install` and `npm run build:frontend` before serving production."
        )
    return assets


def _html_response(path: Path) -> HTMLResponse:
    return HTMLResponse(path.read_text(encoding="utf-8"), headers={"Cache-Control": "no-store"})


def _render_app_shell(frontend: FrontendAssets, *, is_admin: bool, extension_module: str | None = None, extension_style: str | None = None) -> HTMLResponse:
    extension_link = (
        '<a id="extensionEntryLink" class="sidebar-action secondary nav-button" href="/app/admin/actors">用户管理</a>'
        if is_admin
        else ""
    )
    html = (
        frontend.app_html_path.read_text(encoding="utf-8")
        .replace("__EXTENSION_NAV_LINK__", extension_link)
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


def _auth_file_response(request: Request, path: Path) -> FileResponse:
    actor = _current_actor_from_request(request)
    if not actor:
        raise HTTPException(status_code=401, detail="authentication required")
    return FileResponse(path, headers={"Cache-Control": "no-store"})


def _admin_file_response(request: Request, path: Path) -> FileResponse:
    actor = _current_actor_from_request(request)
    if not actor:
        raise HTTPException(status_code=401, detail="authentication required")
    if not actor["is_admin"]:
        raise HTTPException(status_code=403, detail="admin permission required")
    return FileResponse(path, headers={"Cache-Control": "no-store"})


def create_app(data_dir: str | None = None) -> FastAPI:
    config = get_config(data_dir)
    db = Database(config)
    db.init()
    frontend = resolve_frontend_assets(config)

    app = FastAPI(title="Drive Board", version="0.1.0")
    app.state.config = config
    app.state.db = db
    app.state.frontend = frontend
    app.include_router(create_api_router())

    @app.get("/static/login.css")
    async def public_login_css(request: Request):
        return FileResponse(request.app.state.frontend.login_css_path, headers={"Cache-Control": "no-store"})

    @app.get("/static/login.js")
    async def public_login_js(request: Request):
        return FileResponse(request.app.state.frontend.login_js_path, headers={"Cache-Control": "no-store"})

    @app.get("/assets/app.css")
    async def app_css(request: Request):
        return _auth_file_response(request, request.app.state.frontend.app_css_path)

    @app.get("/assets/app.js")
    async def app_js(request: Request):
        return _auth_file_response(request, request.app.state.frontend.app_js_path)

    @app.get("/assets/admin.css")
    async def admin_css(request: Request):
        return _admin_file_response(request, request.app.state.frontend.admin_css_path)

    @app.get("/assets/admin.js")
    async def admin_js(request: Request):
        return _admin_file_response(request, request.app.state.frontend.admin_js_path)

    @app.get("/")
    async def index(request: Request):
        actor = _current_actor_from_request(request)
        if not actor:
            return _html_response(request.app.state.frontend.login_html_path)
        return _render_app_shell(request.app.state.frontend, is_admin=bool(actor["is_admin"]))

    @app.get("/app")
    async def app_index(request: Request):
        actor = _current_actor_from_request(request)
        if not actor:
            return _html_response(request.app.state.frontend.login_html_path)
        return _render_app_shell(request.app.state.frontend, is_admin=bool(actor["is_admin"]))

    @app.get("/app/{frontend_path:path}")
    async def app_index_path(frontend_path: str, request: Request):
        actor = _current_actor_from_request(request)
        if not actor:
            return _html_response(request.app.state.frontend.login_html_path)
        normalized = frontend_path.strip("/")
        if normalized.startswith("admin/"):
            if not actor["is_admin"]:
                raise HTTPException(status_code=403, detail="admin permission required")
            return _render_app_shell(
                request.app.state.frontend,
                is_admin=True,
                extension_module="/assets/admin.js",
                extension_style="/assets/admin.css",
            )
        return _render_app_shell(request.app.state.frontend, is_admin=bool(actor["is_admin"]))

    @app.get("/healthz")
    async def healthz():
        return {"ok": True}

    return app


app = create_app()

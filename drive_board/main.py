from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import create_api_router
from .config import get_config
from .db import Database


WEB_DIR = Path(__file__).parent / "web"


def create_app(data_dir: str | None = None) -> FastAPI:
    config = get_config(data_dir)
    db = Database(config)
    db.init()

    app = FastAPI(title="Drive Board", version="0.1.0")
    app.state.config = config
    app.state.db = db
    app.include_router(create_api_router())
    app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")

    @app.get("/")
    async def index():
        return FileResponse(WEB_DIR / "index.html")

    @app.get("/app")
    async def app_index():
        return FileResponse(WEB_DIR / "index.html")

    @app.get("/app/{frontend_path:path}")
    async def app_index_path(frontend_path: str):
        return FileResponse(WEB_DIR / "index.html")

    @app.get("/healthz")
    async def healthz():
        return {"ok": True}

    return app


app = create_app()

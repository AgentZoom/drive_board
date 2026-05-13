from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


DEFAULT_PORT = 8362


@dataclass(frozen=True)
class AppConfig:
    data_dir: Path
    db_path: Path
    storage_dir: Path
    session_days: int = 14


def get_config(data_dir: str | os.PathLike[str] | None = None) -> AppConfig:
    base = Path(data_dir or os.environ.get("DRIVE_BOARD_DATA_DIR", "data")).expanduser()
    return AppConfig(
        data_dir=base,
        db_path=base / "drive_board.sqlite3",
        storage_dir=base / "storage",
    )

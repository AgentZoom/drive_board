from __future__ import annotations

import mimetypes
import shutil
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


TEXT_EXTENSIONS = {
    ".css",
    ".csv",
    ".html",
    ".htm",
    ".js",
    ".json",
    ".log",
    ".md",
    ".py",
    ".rst",
    ".svg",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}


def normalize_path(path: str | None) -> str:
    raw = (path or "").replace("\\", "/").strip()
    if raw in {"", ".", "/"}:
        return ""
    if "\x00" in raw:
        raise ValueError("path contains NUL byte")
    pure = PurePosixPath(raw)
    if pure.is_absolute():
        raise ValueError("absolute paths are not allowed")
    parts = [part for part in pure.parts if part not in {"", "."}]
    if any(part == ".." for part in parts):
        raise ValueError("parent directory traversal is not allowed")
    return "/".join(parts)


def parent_path(path: str) -> str:
    normalized = normalize_path(path)
    if not normalized or "/" not in normalized:
        return ""
    return normalized.rsplit("/", 1)[0]


def path_is_within(parent: str, child: str) -> bool:
    parent = normalize_path(parent)
    child = normalize_path(child)
    return parent == "" or child == parent or child.startswith(parent.rstrip("/") + "/")


def workspace_root(storage_dir: Path, workspace_id: int) -> Path:
    return storage_dir / str(workspace_id)


def resolve_path(storage_dir: Path, workspace_id: int, path: str | None) -> Path:
    root = workspace_root(storage_dir, workspace_id).resolve()
    target = (root / normalize_path(path)).resolve()
    if target != root and root not in target.parents:
        raise ValueError("path escapes workspace root")
    return target


def ensure_workspace(storage_dir: Path, workspace_id: int) -> Path:
    root = workspace_root(storage_dir, workspace_id)
    root.mkdir(parents=True, exist_ok=True)
    return root


def preview_type(path: str, is_dir: bool = False) -> str:
    if is_dir:
        return "folder"
    suffix = Path(path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}:
        return "image"
    if suffix in {".mp4", ".webm", ".mov", ".m4v", ".ogg"}:
        return "video"
    if suffix in {".mp3", ".wav", ".flac", ".m4a", ".aac", ".oga"}:
        return "audio"
    if suffix == ".pdf":
        return "pdf"
    if suffix in {".md", ".markdown"}:
        return "markdown"
    if suffix in {".html", ".htm"}:
        return "html"
    if suffix in TEXT_EXTENSIONS:
        return "text"
    mime, _ = mimetypes.guess_type(path)
    if mime and mime.startswith("text/"):
        return "text"
    return "binary"


def guess_media_type(path: str) -> str:
    mime, _ = mimetypes.guess_type(path)
    return mime or "application/octet-stream"


def list_directory(storage_dir: Path, workspace_id: int, folder_path: str) -> list[dict]:
    target = resolve_path(storage_dir, workspace_id, folder_path)
    if not target.exists():
        raise FileNotFoundError(folder_path)
    if not target.is_dir():
        raise NotADirectoryError(folder_path)
    items: list[dict] = []
    base = normalize_path(folder_path)
    for child in target.iterdir():
        stat = child.stat()
        rel = f"{base}/{child.name}" if base else child.name
        is_dir = child.is_dir()
        items.append(
            {
                "name": child.name,
                "path": rel,
                "kind": "folder" if is_dir else "file",
                "size": None if is_dir else stat.st_size,
                "modified_at": datetime.fromtimestamp(
                    stat.st_mtime, timezone.utc
                ).isoformat(),
                "preview_type": preview_type(rel, is_dir),
            }
        )
    return sorted(items, key=lambda item: (item["kind"] != "folder", item["name"].lower()))


def write_text(storage_dir: Path, workspace_id: int, path: str, content: str) -> None:
    target = resolve_path(storage_dir, workspace_id, path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def read_text(storage_dir: Path, workspace_id: int, path: str) -> str:
    return resolve_path(storage_dir, workspace_id, path).read_text(encoding="utf-8")


def make_folder(storage_dir: Path, workspace_id: int, path: str) -> None:
    resolve_path(storage_dir, workspace_id, path).mkdir(parents=True, exist_ok=True)


def delete_path(storage_dir: Path, workspace_id: int, path: str) -> None:
    target = resolve_path(storage_dir, workspace_id, path)
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()


def _validate_transfer(source_path: str, destination_path: str, source: Path, destination: Path) -> None:
    if not source_path:
        raise ValueError("source path must not be empty")
    if not destination_path:
        raise ValueError("destination path must not be empty")
    if source_path == destination_path:
        raise ValueError("source and destination cannot be the same")
    if not source.exists():
        raise FileNotFoundError(source_path)
    if not destination.parent.exists() or not destination.parent.is_dir():
        raise ValueError("destination parent folder not found")
    if destination.exists():
        raise FileExistsError(destination_path)
    if source.is_dir() and path_is_within(source_path, destination_path):
        raise ValueError("cannot move or copy a folder into itself")


def copy_path(storage_dir: Path, workspace_id: int, source_path: str, destination_path: str) -> None:
    source_normalized = normalize_path(source_path)
    destination_normalized = normalize_path(destination_path)
    source = resolve_path(storage_dir, workspace_id, source_normalized)
    destination = resolve_path(storage_dir, workspace_id, destination_normalized)
    _validate_transfer(source_normalized, destination_normalized, source, destination)
    if source.is_dir():
        shutil.copytree(source, destination)
    else:
        shutil.copy2(source, destination)


def move_path(storage_dir: Path, workspace_id: int, source_path: str, destination_path: str) -> None:
    source_normalized = normalize_path(source_path)
    destination_normalized = normalize_path(destination_path)
    source = resolve_path(storage_dir, workspace_id, source_normalized)
    destination = resolve_path(storage_dir, workspace_id, destination_normalized)
    _validate_transfer(source_normalized, destination_normalized, source, destination)
    shutil.move(str(source), str(destination))


def rename_path(storage_dir: Path, workspace_id: int, path: str, new_name: str) -> str:
    source_normalized = normalize_path(path)
    candidate = normalize_path(new_name)
    if not source_normalized:
        raise ValueError("path must not be empty")
    if not candidate or "/" in candidate:
        raise ValueError("new name must be a single path segment")
    destination = f"{parent_path(source_normalized)}/{candidate}" if parent_path(source_normalized) else candidate
    move_path(storage_dir, workspace_id, source_normalized, destination)
    return destination

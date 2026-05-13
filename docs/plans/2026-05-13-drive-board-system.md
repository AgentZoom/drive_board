# Drive Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web and CLI drive system for human users and agents with authentication, workspaces, sharing, previews, editing, and local file storage.

**Architecture:** FastAPI serves the JSON API, authenticated web UI, and preview/download routes. SQLite stores actors, sessions, workspaces, memberships, and item-level shares; file bytes are stored under a local data directory keyed by workspace ID. Typer implements the agent-friendly `drive-board` CLI with token authentication and machine-readable output.

**Tech Stack:** Python 3.10+, FastAPI, SQLite stdlib, Typer, httpx, Rich, markdown-it-py, pytest.

---

### Task 1: Project Skeleton

**Files:**
- Create: `pyproject.toml`
- Create: `drive_board/__init__.py`
- Create: `drive_board/config.py`
- Create: `drive_board/main.py`
- Create: `drive_board/cli.py`

**Steps:**
1. Define package metadata, dependencies, console script, and test settings.
2. Add configuration helpers for data directory, database path, storage path, and default port `8362`.
3. Add a FastAPI application factory and `serve` CLI command.
4. Verify `python -m pytest` imports the package.

### Task 2: Auth, Data Model, and Permissions

**Files:**
- Create: `drive_board/db.py`
- Create: `drive_board/security.py`
- Create: `drive_board/schemas.py`

**Steps:**
1. Create SQLite schema for actors, sessions, workspaces, workspace members, and item permissions.
2. Seed demo actors: `admin/admin`, `huangshiyu/huangshiyu`, and agent tokens.
3. Implement password hashing with PBKDF2 and token hashing with SHA-256.
4. Implement permission helpers for admin, workspace membership, and item-level shares.

### Task 3: API and Storage

**Files:**
- Create: `drive_board/storage.py`
- Create: `drive_board/api.py`

**Steps:**
1. Implement safe POSIX-style path normalization and local file operations.
2. Add login/logout/me endpoints for browser sessions and bearer token auth for CLI.
3. Add actor, workspace, member, file, preview, edit, and share endpoints.
4. Ensure HTML preview routes preserve relative paths under `/preview/{workspace}/{path}`.

### Task 4: Web UI

**Files:**
- Create: `drive_board/web/index.html`
- Create: `drive_board/web/static/styles.css`
- Create: `drive_board/web/static/app.js`

**Steps:**
1. Build login and app shells.
2. Build workspace sidebar, breadcrumb, folder table, upload, new folder, new text file, delete, share, and admin actor creation flows.
3. Build preview panel for images, audio/video, PDF, markdown, HTML, and editable text files.
4. Verify text does not overflow and controls are usable on desktop and mobile widths.

### Task 5: CLI and Docs

**Files:**
- Modify: `drive_board/cli.py`
- Create: `docs/cli-guide.md`
- Modify: `README.md`

**Steps:**
1. Implement `whoami`, `actors`, `workspaces`, `files`, `shares`, and `serve` command groups.
2. Support global `--server`, `--token`, and `--format table|json|jsonl` with env vars.
3. Document installation, default server, tokens, examples, and preview behavior.

### Task 6: Tests and Verification

**Files:**
- Create: `tests/test_drive_board.py`

**Steps:**
1. Test login and token auth.
2. Test workspace visibility and admin visibility.
3. Test upload/list/download/edit.
4. Test folder sharing and HTML relative asset preview.
5. Run `python -m pytest`.
6. Start `drive-board serve --port 8362` and verify the app loads.

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx
import typer
import uvicorn
from rich.console import Console
from rich.table import Table

from .config import DEFAULT_PORT


DEFAULT_SERVER = f"http://127.0.0.1:{DEFAULT_PORT}"

app = typer.Typer(no_args_is_help=True, help="Drive Board web drive CLI.")
actors_app = typer.Typer(help="List users and agents.")
workspaces_app = typer.Typer(help="Workspace commands.")
files_app = typer.Typer(help="File and folder commands.")
shares_app = typer.Typer(help="File and folder sharing commands.")
console = Console()


class CliState:
    server: str = DEFAULT_SERVER
    token: str | None = None
    output_format: str = "table"


state = CliState()


@app.callback()
def configure(
    server: str = typer.Option(
        DEFAULT_SERVER,
        "--server",
        envvar="DRIVE_BOARD_SERVER",
        help="Drive Board server URL.",
    ),
    token: str | None = typer.Option(
        None,
        "--token",
        envvar="DRIVE_BOARD_TOKEN",
        help="Bearer token for agent/user automation.",
    ),
    output_format: str = typer.Option(
        "table",
        "--format",
        "-f",
        envvar="DRIVE_BOARD_FORMAT",
        help="Output format: table, json, or jsonl.",
    ),
):
    if output_format not in {"table", "json", "jsonl"}:
        raise typer.BadParameter("format must be table, json, or jsonl")
    state.server = server.rstrip("/")
    state.token = token
    state.output_format = output_format


def client() -> httpx.Client:
    headers = {}
    if state.token:
        headers["Authorization"] = f"Bearer {state.token}"
    return httpx.Client(base_url=state.server, headers=headers, timeout=60)


def fail(message: str, code: int = 1) -> None:
    console.print(f"[red]Error:[/red] {message}", stderr=True)
    raise typer.Exit(code)


def request(method: str, url: str, **kwargs: Any) -> Any:
    with client() as http:
        try:
            response = http.request(method, url, **kwargs)
        except httpx.RequestError as exc:
            fail(str(exc))
    if response.status_code >= 400:
        try:
            payload = response.json()
            detail = payload.get("detail", payload)
        except ValueError:
            detail = response.text
        fail(f"{response.status_code}: {detail}")
    if response.headers.get("content-type", "").startswith("application/json"):
        return response.json()
    return response.text


def simplified(data: Any) -> Any:
    if isinstance(data, dict) and len(data) == 1:
        value = next(iter(data.values()))
        if isinstance(value, (list, dict)):
            return value
    return data


def print_output(data: Any) -> None:
    data = simplified(data)
    if state.output_format == "json":
        console.print(json.dumps(data, ensure_ascii=False, indent=2))
        return
    if state.output_format == "jsonl":
        if isinstance(data, list):
            for item in data:
                console.print(json.dumps(item, ensure_ascii=False))
        else:
            console.print(json.dumps(data, ensure_ascii=False))
        return
    if isinstance(data, list):
        render_table(data)
    elif isinstance(data, dict):
        table = Table(show_header=False)
        table.add_column("Field", style="bold")
        table.add_column("Value")
        for key, value in data.items():
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)
            table.add_row(str(key), "" if value is None else str(value))
        console.print(table)
    else:
        console.print(data)


def render_table(rows: list[dict[str, Any]]) -> None:
    if not rows:
        console.print("No rows.")
        return
    columns: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in columns and key not in {"password_hash", "token_hash"}:
                columns.append(key)
    table = Table()
    for column in columns:
        table.add_column(column)
    for row in rows:
        values = []
        for column in columns:
            value = row.get(column)
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)
            values.append("" if value is None else str(value))
        table.add_row(*values)
    console.print(table)


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", "--host", help="Bind host."),
    port: int = typer.Option(DEFAULT_PORT, "--port", help="Bind port."),
    reload: bool = typer.Option(False, "--reload", help="Enable development reload."),
    data_dir: Path | None = typer.Option(None, "--data-dir", help="Data directory."),
):
    """Start the Drive Board web server."""
    if data_dir:
        os.environ["DRIVE_BOARD_DATA_DIR"] = str(data_dir)
    if reload:
        uvicorn.run("drive_board.main:create_app", factory=True, host=host, port=port, reload=True)
    else:
        from .main import create_app

        uvicorn.run(create_app(str(data_dir) if data_dir else None), host=host, port=port)


@app.command()
def whoami():
    """Show the current token identity."""
    print_output(request("GET", "/api/me"))


@actors_app.command("list")
def actors_list(
    actor_type: str = typer.Option("all", "--type", help="all, user, or agent."),
    include_inactive: bool = typer.Option(False, "--include-inactive"),
):
    """List visible humans and agents."""
    print_output(
        request(
            "GET",
            "/api/actors",
            params={"actor_type": actor_type, "include_inactive": include_inactive},
        )
    )


@workspaces_app.command("list")
def workspaces_list():
    """List workspaces visible to the current actor."""
    print_output(request("GET", "/api/workspaces"))


@workspaces_app.command("create-group")
def workspaces_create_group(name: str = typer.Option(..., "--name", "-n")):
    """Create a share_group workspace."""
    print_output(request("POST", "/api/workspaces", json={"name": name, "kind": "share_group"}))


@workspaces_app.command("members")
def workspaces_members(workspace: str):
    """List members of a workspace."""
    print_output(request("GET", f"/api/workspaces/{workspace}/members"))


@workspaces_app.command("add-member")
def workspaces_add_member(
    workspace: str,
    actor_id: str = typer.Option(..., "--actor"),
    permission: str = typer.Option("read", "--permission"),
):
    """Add or update a workspace member."""
    print_output(
        request(
            "POST",
            f"/api/workspaces/{workspace}/members",
            json={"actor_id": actor_id, "permission": permission},
        )
    )


@files_app.command("list")
def files_list(workspace: str, path: str = ""):
    """List a folder."""
    print_output(request("GET", "/api/files", params={"workspace": workspace, "path": path}))


@files_app.command("mkdir")
def files_mkdir(workspace: str, path: str):
    """Create a folder."""
    print_output(request("POST", "/api/folders", json={"workspace": workspace, "path": path}))


@files_app.command("upload")
def files_upload(
    workspace: str,
    local_path: Path,
    path: str = typer.Option("", "--path", "-p", help="Destination folder path."),
):
    """Upload one local file into a workspace folder."""
    if not local_path.is_file():
        fail(f"local file not found: {local_path}")
    with client() as http, local_path.open("rb") as handle:
        response = http.post(
            "/api/files/upload",
            data={"workspace": workspace, "path": path},
            files={"file": (local_path.name, handle)},
        )
    if response.status_code >= 400:
        fail(f"{response.status_code}: {response.text}")
    print_output(response.json())


@files_app.command("download")
def files_download(
    workspace: str,
    remote_path: str,
    output: Path | None = typer.Option(None, "--output", "-o"),
):
    """Download a file."""
    with client() as http:
        response = http.get(
            "/api/files/download", params={"workspace": workspace, "path": remote_path}
        )
    if response.status_code >= 400:
        fail(f"{response.status_code}: {response.text}")
    destination = output or Path(remote_path).name
    Path(destination).write_bytes(response.content)
    print_output({"output": str(destination), "bytes": len(response.content)})


@files_app.command("cat")
def files_cat(workspace: str, path: str):
    """Print a UTF-8 text file."""
    payload = request("GET", "/api/files/text", params={"workspace": workspace, "path": path})
    content = payload["content"] if isinstance(payload, dict) else payload
    sys.stdout.write(content)


@files_app.command("write")
def files_write(
    workspace: str,
    path: str,
    file: Path | None = typer.Option(None, "--file", "-i", help="Read content from file."),
    stdin: bool = typer.Option(False, "--stdin", help="Read content from stdin."),
):
    """Create or overwrite a UTF-8 text file."""
    if bool(file) == stdin:
        fail("provide exactly one of --file or --stdin")
    if file:
        content = file.read_text(encoding="utf-8")
    else:
        content = sys.stdin.read()
    print_output(
        request("POST", "/api/files/text", json={"workspace": workspace, "path": path, "content": content})
    )


@files_app.command("delete")
def files_delete(workspace: str, path: str):
    """Delete a file or folder."""
    print_output(request("DELETE", "/api/files", params={"workspace": workspace, "path": path}))


@files_app.command("preview-url")
def files_preview_url(workspace: str, path: str):
    """Print the browser preview URL for a file."""
    safe_path = "/".join(part for part in path.replace("\\", "/").split("/") if part)
    print_output({"url": f"{state.server}/preview/{workspace}/{safe_path}"})


@shares_app.command("add")
def shares_add(
    workspace: str,
    path: str,
    actor_id: str = typer.Option(..., "--actor"),
    permission: str = typer.Option("read", "--permission"),
):
    """Share a file or folder with a human or agent."""
    print_output(
        request(
            "POST",
            "/api/shares",
            json={
                "workspace": workspace,
                "path": path,
                "actor_id": actor_id,
                "permission": permission,
            },
        )
    )


@shares_app.command("list")
def shares_list(workspace: str, path: str | None = typer.Option(None, "--path")):
    """List shares on a workspace path."""
    params = {"workspace": workspace}
    if path is not None:
        params["path"] = path
    print_output(request("GET", "/api/shares", params=params))


@shares_app.command("shared")
def shares_shared():
    """List files and folders shared directly with the current actor."""
    print_output(request("GET", "/api/shared"))


app.add_typer(actors_app, name="actors")
app.add_typer(workspaces_app, name="workspaces")
app.add_typer(files_app, name="files")
app.add_typer(shares_app, name="shares")


if __name__ == "__main__":
    app()

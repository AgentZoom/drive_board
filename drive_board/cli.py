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


DEFAULT_SERVER = "http://drive.mm-lab.cn"

app = typer.Typer(no_args_is_help=True, help="Drive Board web drive CLI.")
actors_app = typer.Typer(help="List users and agents.")
workspaces_app = typer.Typer(help="Workspace commands.")
files_app = typer.Typer(help="File and folder commands.")
shares_app = typer.Typer(help="File and folder sharing commands.")
public_links_app = typer.Typer(help="Authenticated public link commands.")
console = Console()


class CliState:
    server: str = DEFAULT_SERVER.rstrip("/")
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


def response_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
        detail = payload.get("detail", payload)
    except ValueError:
        detail = response.text
    return str(detail)


def request(method: str, url: str, **kwargs: Any) -> Any:
    with client() as http:
        try:
            response = http.request(method, url, **kwargs)
        except httpx.RequestError as exc:
            fail(str(exc))
    if response.status_code >= 400:
        fail(f"{response.status_code}: {response_error_detail(response)}")
    if response.headers.get("content-type", "").startswith("application/json"):
        return response.json()
    return response.text


def absolute_server_url(path: str) -> str:
    if path.startswith(("http://", "https://")):
        return path
    normalized = path if path.startswith("/") else f"/{path}"
    return f"{state.server}{normalized}"


def absolutize_public_link_payload(data: Any) -> Any:
    if isinstance(data, dict):
        converted = {key: absolutize_public_link_payload(value) for key, value in data.items()}
        if isinstance(converted.get("download_url"), str):
            converted["download_url"] = absolute_server_url(converted["download_url"])
        return converted
    if isinstance(data, list):
        return [absolutize_public_link_payload(item) for item in data]
    return data


def read_text_input(
    *,
    file: Path | None = None,
    stdin: bool = False,
) -> str:
    if bool(file) == stdin:
        fail("provide exactly one of --file or --stdin")
    if file:
        return file.read_text(encoding="utf-8")
    return sys.stdin.read()


def get_text_content(workspace: str, path: str, *, allow_missing: bool = False) -> str:
    with client() as http:
        try:
            response = http.get("/api/files/text", params={"workspace": workspace, "path": path})
        except httpx.RequestError as exc:
            fail(str(exc))
    if allow_missing and response.status_code == 404:
        return ""
    if response.status_code >= 400:
        try:
            payload = response.json()
            detail = payload.get("detail", payload)
        except ValueError:
            detail = response.text
        fail(f"{response.status_code}: {detail}")
    payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
    if isinstance(payload, dict):
        return str(payload.get("content", ""))
    return str(payload)


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


@workspaces_app.command("remove-member")
def workspaces_remove_member(workspace: str, actor_id: str):
    """Remove a member from a workspace."""
    print_output(request("DELETE", f"/api/workspaces/{workspace}/members/{actor_id}"))


def _files_list_impl(workspace: str, path: str = "") -> None:
    print_output(request("GET", "/api/files", params={"workspace": workspace, "path": path}))


@files_app.command("ls")
def files_ls(workspace: str, path: str = ""):
    """List a folder."""
    _files_list_impl(workspace, path)


@files_app.command("list")
def files_list(workspace: str, path: str = ""):
    """Alias for ls."""
    _files_list_impl(workspace, path)


@files_app.command("mkdir")
def files_mkdir(workspace: str, path: str):
    """Create a folder."""
    print_output(request("POST", "/api/folders", json={"workspace": workspace, "path": path}))


@files_app.command("upload")
def files_upload(
    workspace: str,
    local_path: Path,
    path: str = typer.Option(
        "",
        "--path",
        "-p",
        help="Destination path. End with / to upload into a folder; otherwise treated as the remote file path.",
    ),
    force: bool = typer.Option(False, "--force", help="Overwrite the remote file if it already exists."),
):
    """Upload one local file into a workspace path."""
    if not local_path.is_file():
        fail(f"local file not found: {local_path}")
    with client() as http, local_path.open("rb") as handle:
        response = http.post(
            "/api/files/upload",
            data={
                "workspace": workspace,
                "path": path,
                "overwrite": "true" if force else "false",
            },
            files={"file": (local_path.name, handle)},
        )
    if response.status_code >= 400:
        fail(f"{response.status_code}: {response_error_detail(response)}")
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
    content = read_text_input(file=file, stdin=stdin)
    print_output(
        request("POST", "/api/files/text", json={"workspace": workspace, "path": path, "content": content})
    )


@files_app.command("append")
def files_append(
    workspace: str,
    path: str,
    file: Path | None = typer.Option(None, "--file", "-i", help="Read appended content from file."),
    stdin: bool = typer.Option(False, "--stdin", help="Read appended content from stdin."),
):
    """Append UTF-8 text to an existing file, or create it if missing."""
    existing_content = get_text_content(workspace, path, allow_missing=True)
    appended_content = read_text_input(file=file, stdin=stdin)
    print_output(
        request(
            "POST",
            "/api/files/text",
            json={
                "workspace": workspace,
                "path": path,
                "content": f"{existing_content}{appended_content}",
            },
        )
    )


@files_app.command("cp")
def files_cp(workspace: str, source_path: str, destination_path: str):
    """Copy a file or folder to another path."""
    print_output(
        request(
            "POST",
            "/api/files/copy",
            json={
                "workspace": workspace,
                "source_path": source_path,
                "destination_path": destination_path,
            },
        )
    )


@files_app.command("mv")
def files_mv(workspace: str, source_path: str, destination_path: str):
    """Move a file or folder to another path."""
    print_output(
        request(
            "POST",
            "/api/files/move",
            json={
                "workspace": workspace,
                "source_path": source_path,
                "destination_path": destination_path,
            },
        )
    )


@files_app.command("rename")
def files_rename(workspace: str, path: str, new_name: str):
    """Rename a file or folder inside its current parent directory."""
    print_output(
        request(
            "POST",
            "/api/files/rename",
            json={
                "workspace": workspace,
                "path": path,
                "new_name": new_name,
            },
        )
    )


def _files_delete_impl(workspace: str, path: str) -> None:
    print_output(request("DELETE", "/api/files", params={"workspace": workspace, "path": path}))


@files_app.command("rm")
def files_rm(workspace: str, path: str):
    """Delete a file or folder."""
    _files_delete_impl(workspace, path)


@files_app.command("delete")
def files_delete(workspace: str, path: str):
    """Alias for rm."""
    _files_delete_impl(workspace, path)


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


def _shares_list_impl(workspace: str, path: str | None = None) -> None:
    params = {"workspace": workspace}
    if path is not None:
        params["path"] = path
    print_output(request("GET", "/api/shares", params=params))


@shares_app.command("ls")
def shares_ls(workspace: str, path: str | None = typer.Option(None, "--path")):
    """List shares on a workspace path."""
    _shares_list_impl(workspace, path)


@shares_app.command("list")
def shares_list(workspace: str, path: str | None = typer.Option(None, "--path")):
    """Alias for ls."""
    _shares_list_impl(workspace, path)


@shares_app.command("rm")
def shares_remove(share_id: int):
    """Cancel an existing share record."""
    print_output(request("DELETE", f"/api/shares/{share_id}"))


@shares_app.command("shared")
def shares_shared():
    """List files and folders shared directly with the current actor."""
    print_output(request("GET", "/api/shared"))


def _public_links_list_impl(workspace: str, path: str | None = None) -> None:
    params = {"workspace": workspace}
    if path is not None:
        params["path"] = path
    print_output(absolutize_public_link_payload(request("GET", "/api/public-links", params=params)))


@public_links_app.command("create")
def public_links_create(workspace: str, path: str):
    """Create a public download link for a file."""
    print_output(
        absolutize_public_link_payload(
            request("POST", "/api/public-links", json={"workspace": workspace, "path": path})
        )
    )


@public_links_app.command("ls")
def public_links_ls(workspace: str, path: str | None = typer.Option(None, "--path")):
    """List public links on a workspace or a specific path."""
    _public_links_list_impl(workspace, path)


@public_links_app.command("list")
def public_links_list(workspace: str, path: str | None = typer.Option(None, "--path")):
    """Alias for ls."""
    _public_links_list_impl(workspace, path)


@public_links_app.command("rm")
def public_links_remove(link_id: int):
    """Revoke a public link by id."""
    print_output(request("DELETE", f"/api/public-links/{link_id}"))


app.add_typer(actors_app, name="actors")
app.add_typer(workspaces_app, name="workspaces")
app.add_typer(files_app, name="files")
app.add_typer(shares_app, name="shares")
app.add_typer(public_links_app, name="public-links")


if __name__ == "__main__":
    app()

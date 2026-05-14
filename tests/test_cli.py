from __future__ import annotations

import io
import json
import re

import httpx
from typer.testing import CliRunner

from drive_board import cli as cli_module


runner = CliRunner()


def test_configure_uses_production_server_by_default(monkeypatch):
    monkeypatch.setattr(cli_module.state, "server", "http://example.invalid")

    cli_module.configure(version=False, server=cli_module.DEFAULT_SERVER, token=None, output_format="table")

    assert cli_module.DEFAULT_SERVER == "http://drive.mm-lab.cn"
    assert cli_module.state.server == "http://drive.mm-lab.cn"


def test_cli_supports_version_flag():
    result = runner.invoke(cli_module.app, ["--version"])

    assert result.exit_code == 0
    assert result.stdout.strip() == f"drive-board {cli_module.__version__}"


def test_configure_standard_streams_switches_to_utf8(monkeypatch):
    stdin = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
    stdout = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
    stderr = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")

    monkeypatch.setattr(cli_module.sys, "stdin", stdin)
    monkeypatch.setattr(cli_module.sys, "stdout", stdout)
    monkeypatch.setattr(cli_module.sys, "stderr", stderr)

    cli_module.configure_standard_streams()

    assert stdin.encoding.lower().startswith("utf-8")
    assert stdout.encoding.lower() == "utf-8"
    assert stderr.encoding.lower() == "utf-8"


def test_read_text_input_strips_utf8_bom_from_file(tmp_path):
    source = tmp_path / "bom.txt"
    source.write_text("中文内容", encoding="utf-8-sig")

    assert cli_module.read_text_input(file=source) == "中文内容"


def test_read_text_input_decodes_utf8_stdin_bytes(monkeypatch):
    stdin = io.TextIOWrapper(io.BytesIO("中文内容".encode("utf-8-sig")), encoding="gbk")

    monkeypatch.setattr(cli_module.sys, "stdin", stdin)

    assert cli_module.read_text_input(stdin=True) == "中文内容"


class FakeTextClient:
    def __init__(self, response: httpx.Response, calls: list[tuple[str, str, dict]]):
        self.response = response
        self.calls = calls

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url: str, **kwargs):
        self.calls.append(("GET", url, kwargs))
        return self.response


class FakeUploadClient:
    def __init__(self, response: httpx.Response, calls: list[tuple[str, str, dict]]):
        self.response = response
        self.calls = calls

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, url: str, **kwargs):
        self.calls.append(("POST", url, kwargs))
        return self.response


class FakeRequestClient:
    def __init__(self, response: httpx.Response, calls: list[tuple[str, str, dict]]):
        self.response = response
        self.calls = calls

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def request(self, method: str, url: str, **kwargs):
        self.calls.append((method, url, kwargs))
        return self.response


def test_files_append_appends_stdin_to_existing_text(monkeypatch):
    get_calls: list[tuple[str, str, dict]] = []
    post_calls: list[tuple[str, str, dict]] = []

    def fake_client():
        return FakeTextClient(
            httpx.Response(
                200,
                headers={"content-type": "application/json"},
                json={"content": "Hello"},
            ),
            get_calls,
        )

    def fake_request(method: str, url: str, **kwargs):
        post_calls.append((method, url, kwargs))
        return kwargs["json"]

    monkeypatch.setattr(cli_module, "client", fake_client)
    monkeypatch.setattr(cli_module, "request", fake_request)
    monkeypatch.setattr(cli_module, "print_output", lambda data: None)
    monkeypatch.setattr(cli_module.sys, "stdin", io.StringIO(" world"))

    cli_module.files_append("main-agent", "notes/readme.md", file=None, stdin=True)

    assert get_calls == [
        (
            "GET",
            "/api/files/text",
            {"params": {"workspace": "main-agent", "path": "notes/readme.md"}},
        )
    ]
    assert post_calls[0][0] == "POST"
    assert post_calls[0][1] == "/api/files/text"
    assert post_calls[0][2]["json"]["content"] == "Hello world"


def test_files_append_creates_missing_text_from_file(monkeypatch, tmp_path):
    get_calls: list[tuple[str, str, dict]] = []
    post_calls: list[tuple[str, str, dict]] = []
    fragment = tmp_path / "fragment.md"
    fragment.write_text("First line\n", encoding="utf-8")

    def fake_client():
        return FakeTextClient(
            httpx.Response(
                404,
                headers={"content-type": "application/json"},
                json={"detail": "file not found"},
            ),
            get_calls,
        )

    def fake_request(method: str, url: str, **kwargs):
        post_calls.append((method, url, kwargs))
        return kwargs["json"]

    monkeypatch.setattr(cli_module, "client", fake_client)
    monkeypatch.setattr(cli_module, "request", fake_request)
    monkeypatch.setattr(cli_module, "print_output", lambda data: None)

    cli_module.files_append("main-agent", "notes/new.md", file=fragment)

    assert get_calls == [
        (
            "GET",
            "/api/files/text",
            {"params": {"workspace": "main-agent", "path": "notes/new.md"}},
        )
    ]
    assert post_calls[0][2]["json"]["content"] == "First line\n"


def test_cli_reports_http_errors_without_traceback(monkeypatch):
    request_calls: list[tuple[str, str, dict]] = []

    def fake_client():
        return FakeRequestClient(
            httpx.Response(
                401,
                headers={"content-type": "application/json"},
                json={"detail": "Not authenticated"},
            ),
            request_calls,
        )

    monkeypatch.setattr(cli_module, "client", fake_client)

    result = runner.invoke(cli_module.app, ["whoami"])

    assert result.exit_code == 1
    assert "Error: 401: Not authenticated" in result.output
    assert "TypeError" not in result.output


def test_cli_json_output_is_machine_readable_for_long_preview_urls():
    long_path = "/".join(["nested"] * 30 + ["index.html"])

    result = runner.invoke(
        cli_module.app,
        ["--format", "json", "files", "preview-url", "main-agent", long_path],
    )

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["url"].endswith(f"/preview/main-agent/{long_path}")


def test_cli_help_hides_internal_serve_command():
    result = runner.invoke(cli_module.app, ["--help"])

    assert result.exit_code == 0
    assert re.search(r"^\s*serve\s", result.stdout, re.MULTILINE) is None


def test_cli_jsonl_output_is_machine_readable(monkeypatch):
    def fake_request(method: str, url: str, **kwargs):
        return {
            "workspaces": [
                {"name": "workspace-a", "permission": "write", "description": "a" * 160},
                {"name": "workspace-b", "permission": "read", "description": "b" * 160},
            ]
        }

    monkeypatch.setattr(cli_module, "request", fake_request)

    result = runner.invoke(cli_module.app, ["--format", "jsonl", "workspaces", "list"])

    assert result.exit_code == 0
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    assert len(lines) == 2
    assert [json.loads(line)["name"] for line in lines] == ["workspace-a", "workspace-b"]


def test_list_commands_accept_positional_and_flag_paths(monkeypatch):
    request_calls: list[tuple[str, str, dict]] = []

    def fake_request(method: str, url: str, **kwargs):
        request_calls.append((method, url, kwargs))
        if url == "/api/files":
            return {"items": []}
        if url == "/api/shares":
            return {"shares": []}
        return {"public_links": []}

    monkeypatch.setattr(cli_module, "request", fake_request)

    files_result = runner.invoke(cli_module.app, ["files", "ls", "main-agent", "reports"])
    shares_positional_result = runner.invoke(cli_module.app, ["shares", "ls", "main-agent", "reports"])
    shares_option_result = runner.invoke(cli_module.app, ["shares", "ls", "main-agent", "--path", "archive"])
    public_links_result = runner.invoke(
        cli_module.app,
        ["public-links", "ls", "main-agent", "reports/a.pdf"],
    )

    assert files_result.exit_code == 0
    assert shares_positional_result.exit_code == 0
    assert shares_option_result.exit_code == 0
    assert public_links_result.exit_code == 0
    assert request_calls == [
        ("GET", "/api/files", {"params": {"workspace": "main-agent", "path": "reports"}}),
        ("GET", "/api/shares", {"params": {"workspace": "main-agent", "path": "reports"}}),
        ("GET", "/api/shares", {"params": {"workspace": "main-agent", "path": "archive"}}),
        ("GET", "/api/public-links", {"params": {"workspace": "main-agent", "path": "reports/a.pdf"}}),
    ]


def test_files_upload_passes_raw_path_and_force_flag(monkeypatch, tmp_path):
    post_calls: list[tuple[str, str, dict]] = []
    upload = tmp_path / "report.md"
    upload.write_text("# Report\n", encoding="utf-8")

    def fake_client():
        return FakeUploadClient(
            httpx.Response(
                200,
                headers={"content-type": "application/json"},
                json={"path": "reports/report.md"},
            ),
            post_calls,
        )

    monkeypatch.setattr(cli_module, "client", fake_client)
    monkeypatch.setattr(cli_module, "print_output", lambda data: None)

    cli_module.files_upload("main-agent", upload, path="reports/", force=True)

    assert post_calls[0][0] == "POST"
    assert post_calls[0][1] == "/api/files/upload"
    assert post_calls[0][2]["data"] == {
        "workspace": "main-agent",
        "path": "reports/",
        "overwrite": "true",
    }


def test_files_upload_supports_named_remote_file_path(monkeypatch, tmp_path):
    post_calls: list[tuple[str, str, dict]] = []
    upload = tmp_path / "local.txt"
    upload.write_text("local\n", encoding="utf-8")

    def fake_client():
        return FakeUploadClient(
            httpx.Response(
                200,
                headers={"content-type": "application/json"},
                json={"path": "reports/renamed.md"},
            ),
            post_calls,
        )

    monkeypatch.setattr(cli_module, "client", fake_client)
    monkeypatch.setattr(cli_module, "print_output", lambda data: None)

    cli_module.files_upload("main-agent", upload, path="reports/renamed.md", force=False)

    assert post_calls[0][2]["data"] == {
        "workspace": "main-agent",
        "path": "reports/renamed.md",
        "overwrite": "false",
    }


def test_workspace_share_and_public_link_remove_commands_use_expected_routes(monkeypatch):
    request_calls: list[tuple[str, str, dict]] = []

    def fake_request(method: str, url: str, **kwargs):
        request_calls.append((method, url, kwargs))
        return {"ok": True}

    monkeypatch.setattr(cli_module, "request", fake_request)
    monkeypatch.setattr(cli_module, "print_output", lambda data: None)

    cli_module.workspaces_remove_member("research-team", "agent:cli-agent")
    cli_module.workspaces_delete("research-team")
    cli_module.shares_remove(7)
    cli_module.public_links_remove(11)

    assert request_calls == [
        ("DELETE", "/api/workspaces/research-team/members/agent:cli-agent", {}),
        ("DELETE", "/api/workspaces/research-team", {}),
        ("DELETE", "/api/shares/7", {}),
        ("DELETE", "/api/public-links/11", {}),
    ]


def test_files_linux_style_commands_send_expected_payloads(monkeypatch):
    request_calls: list[tuple[str, str, dict]] = []

    def fake_request(method: str, url: str, **kwargs):
        request_calls.append((method, url, kwargs))
        return {"ok": True}

    monkeypatch.setattr(cli_module, "request", fake_request)
    monkeypatch.setattr(cli_module, "print_output", lambda data: None)

    cli_module.files_ls("main-agent", "reports")
    cli_module.files_cp("main-agent", "reports/a.md", "archive/a.md")
    cli_module.files_mv("main-agent", "archive/a.md", "archive/final.md")
    cli_module.files_rename("main-agent", "archive/final.md", "summary.md")
    cli_module.files_rm("main-agent", "archive/summary.md")

    assert request_calls == [
        ("GET", "/api/files", {"params": {"workspace": "main-agent", "path": "reports"}}),
        (
            "POST",
            "/api/files/copy",
            {
                "json": {
                    "workspace": "main-agent",
                    "source_path": "reports/a.md",
                    "destination_path": "archive/a.md",
                }
            },
        ),
        (
            "POST",
            "/api/files/move",
            {
                "json": {
                    "workspace": "main-agent",
                    "source_path": "archive/a.md",
                    "destination_path": "archive/final.md",
                }
            },
        ),
        (
            "POST",
            "/api/files/rename",
            {
                "json": {
                    "workspace": "main-agent",
                    "path": "archive/final.md",
                    "new_name": "summary.md",
                }
            },
        ),
        ("DELETE", "/api/files", {"params": {"workspace": "main-agent", "path": "archive/summary.md"}}),
    ]


def test_public_link_commands_send_expected_payloads(monkeypatch):
    request_calls: list[tuple[str, str, dict]] = []

    def fake_request(method: str, url: str, **kwargs):
        request_calls.append((method, url, kwargs))
        return {"ok": True}

    monkeypatch.setattr(cli_module, "request", fake_request)
    monkeypatch.setattr(cli_module, "print_output", lambda data: None)

    cli_module.public_links_create("main-agent", "reports/a.pdf")
    cli_module.public_links_ls("main-agent", path=None)
    cli_module.public_links_ls("main-agent", path="reports/a.pdf")
    cli_module.shares_ls("main-agent", path="reports")

    assert request_calls == [
        (
            "POST",
            "/api/public-links",
            {"json": {"workspace": "main-agent", "path": "reports/a.pdf"}},
        ),
        ("GET", "/api/public-links", {"params": {"workspace": "main-agent"}}),
        (
            "GET",
            "/api/public-links",
            {"params": {"workspace": "main-agent", "path": "reports/a.pdf"}},
        ),
        ("GET", "/api/shares", {"params": {"workspace": "main-agent", "path": "reports"}}),
    ]


def test_public_link_commands_absolutize_download_urls_from_server(monkeypatch):
    outputs: list[dict] = []

    def fake_request(method: str, url: str, **kwargs):
        if method == "POST":
            return {
                "public_link": {
                    "id": 3,
                    "download_url": "/public/token-123",
                }
            }
        return {
            "target_kind": "file",
            "public_links": [
                {
                    "id": 3,
                    "download_url": "/public/token-123",
                }
            ],
        }

    monkeypatch.setattr(cli_module, "request", fake_request)
    monkeypatch.setattr(cli_module, "print_output", lambda data: outputs.append(data))
    monkeypatch.setattr(cli_module.state, "server", "https://drive.example.com")

    cli_module.public_links_create("main-agent", "reports/a.pdf")
    cli_module.public_links_ls("main-agent", path="reports/a.pdf")

    assert outputs == [
        {
            "public_link": {
                "id": 3,
                "download_url": "https://drive.example.com/public/token-123",
            }
        },
        {
            "target_kind": "file",
            "public_links": [
                {
                    "id": 3,
                    "download_url": "https://drive.example.com/public/token-123",
                }
            ],
        },
    ]
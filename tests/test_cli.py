from __future__ import annotations

import io

import httpx

from drive_board import cli as cli_module


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
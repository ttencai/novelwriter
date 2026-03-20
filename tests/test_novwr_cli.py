from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

import app.cli as cli
from app.cli import (
    DEFAULT_IMAGE,
    build_env_file,
    cmd_uninstall,
    docker_compose_template,
    ensure_install_scaffold,
    healthcheck_url_for_env,
    parse_env_file,
    resolve_data_dir,
)


def test_build_env_file_includes_expected_defaults() -> None:
    env = parse_env_file(build_env_file())

    assert env["NOVWR_IMAGE"] == DEFAULT_IMAGE
    assert env["NOVWR_BIND_HOST"] == "127.0.0.1"
    assert env["NOVWR_PORT"] == "8000"
    assert env["DEPLOY_MODE"] == "selfhost"
    assert env["JWT_SECRET_KEY"]


def test_ensure_install_scaffold_preserves_existing_values_and_applies_overrides(
    tmp_path: Path,
) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text(
        "OPENAI_API_KEY=existing-key\nJWT_SECRET_KEY=keep-me\nNOVWR_PORT=7000\nMAX_CONTEXT_CHAPTERS=7\n",
        encoding="utf-8",
    )

    env = ensure_install_scaffold(tmp_path, port="9000")

    saved = parse_env_file(env_path.read_text(encoding="utf-8"))
    assert saved["OPENAI_API_KEY"] == "existing-key"
    assert saved["JWT_SECRET_KEY"] == "keep-me"
    assert saved["NOVWR_PORT"] == "9000"
    assert saved["MAX_CONTEXT_CHAPTERS"] == "7"
    assert env["NOVWR_PORT"] == "9000"
    assert (tmp_path / "docker-compose.yml").exists()
    assert (tmp_path / "data").is_dir()


def test_healthcheck_url_uses_loopback_for_wildcard_bind() -> None:
    url = healthcheck_url_for_env({"NOVWR_BIND_HOST": "0.0.0.0", "NOVWR_PORT": "8123"})

    assert url == "http://127.0.0.1:8123/api/health"


def test_resolve_data_dir_supports_relative_and_absolute_paths(tmp_path: Path) -> None:
    relative = resolve_data_dir(tmp_path, {"NOVWR_DATA_DIR": "./data"})
    absolute = resolve_data_dir(tmp_path, {"NOVWR_DATA_DIR": str(tmp_path / "custom-data")})

    assert relative == (tmp_path / "data").resolve()
    assert absolute == (tmp_path / "custom-data").resolve()


def test_docker_compose_template_uses_image_based_selfhost_stack() -> None:
    template = docker_compose_template()

    assert "${NOVWR_IMAGE}" in template
    assert "${NOVWR_BIND_HOST}:${NOVWR_PORT}:8000" in template
    assert "${NOVWR_DATA_DIR}:/data" in template


def test_cmd_uninstall_removes_managed_files_and_preserves_data_by_default(
    tmp_path: Path, monkeypatch
) -> None:
    ensure_install_scaffold(tmp_path)
    monkeypatch.setattr(cli, "detect_compose_command", lambda: None)

    result = cmd_uninstall(argparse.Namespace(dir=str(tmp_path), delete_data=False))

    assert result == 0
    assert not (tmp_path / ".env").exists()
    assert not (tmp_path / "docker-compose.yml").exists()
    assert (tmp_path / "data").exists()
    assert tmp_path.exists()


def test_cmd_uninstall_with_delete_data_removes_install_dir_when_empty(
    tmp_path: Path, monkeypatch
) -> None:
    ensure_install_scaffold(tmp_path)
    monkeypatch.setattr(cli, "detect_compose_command", lambda: None)

    result = cmd_uninstall(argparse.Namespace(dir=str(tmp_path), delete_data=True))

    assert result == 0
    assert not tmp_path.exists()


def test_cmd_uninstall_runs_compose_down_when_available(tmp_path: Path, monkeypatch) -> None:
    ensure_install_scaffold(tmp_path)
    calls: list[tuple[list[str], Path | None, bool]] = []

    monkeypatch.setattr(cli, "detect_compose_command", lambda: ["docker", "compose"])

    def fake_run(command, *, cwd=None, capture_output=False, check=False):
        calls.append((list(command), cwd, check))

        class Result:
            returncode = 0
            stdout = ""
            stderr = ""

        return Result()

    monkeypatch.setattr(cli, "_run", fake_run)

    result = cmd_uninstall(argparse.Namespace(dir=str(tmp_path), delete_data=False))

    assert result == 0
    assert calls[0] == (["docker", "compose", "down", "--remove-orphans"], tmp_path, True)


def test_install_script_bootstraps_default_archive_without_git(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    uv_log = tmp_path / "uv.log"

    def _write_executable(name: str, content: str) -> None:
        path = bin_dir / name
        path.write_text(content, encoding="utf-8")
        path.chmod(0o755)

    _write_executable(
        "curl",
        "#!/bin/bash\nexit 0\n",
    )
    _write_executable(
        "uv",
        "#!/bin/bash\nprintf '%s\\n' \"$@\" > \"$NOVWR_TEST_UV_LOG\"\nexit 0\n",
    )
    _write_executable(
        "novwr",
        "#!/bin/bash\nexit 0\n",
    )
    _write_executable(
        "cat",
        "#!/bin/bash\n/bin/cat \"$@\"\n",
    )

    env = os.environ.copy()
    env.update(
        {
            "PATH": str(bin_dir),
            "HOME": str(tmp_path / "home"),
            "NOVWR_HOME": str(tmp_path / "managed"),
            "NOVWR_TEST_UV_LOG": str(uv_log),
        }
    )

    completed = subprocess.run(
        ["/bin/bash", str(root / "install.sh")],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr or completed.stdout
    uv_args = uv_log.read_text(encoding="utf-8")
    assert "git+" not in uv_args
    assert "archive/refs/heads/master.tar.gz" in uv_args

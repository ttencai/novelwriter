#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".uv-version"
TARGETS = (
    ROOT / "pyproject.toml",
    ROOT / "install.sh",
)


def read_uv_version() -> str:
    version = SOURCE.read_text(encoding="utf-8").strip()
    if not version:
        raise SystemExit(f"Empty uv version in {SOURCE}")
    return version


def sync_pyproject(text: str, version: str) -> str:
    updated, count = re.subn(
        r'(?m)^required-version = "==[^"]+"$',
        f'required-version = "=={version}"',
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit("Failed to sync required-version in pyproject.toml")
    return updated


def sync_install(text: str, version: str) -> str:
    updated, count = re.subn(
        r'(?m)^DEFAULT_NOVWR_UV_VERSION="[^"]+"$',
        f'DEFAULT_NOVWR_UV_VERSION="{version}"',
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit("Failed to sync DEFAULT_NOVWR_UV_VERSION in install.sh")
    return updated


def sync_target(path: Path, version: str) -> bool:
    original = path.read_text(encoding="utf-8")
    if path.name == "pyproject.toml":
        updated = sync_pyproject(original, version)
    elif path.name == "install.sh":
        updated = sync_install(original, version)
    else:
        raise SystemExit(f"Unsupported sync target: {path}")

    if updated == original:
        return False

    path.write_text(updated, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync generated uv version targets from .uv-version."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero if any generated target is out of sync.",
    )
    args = parser.parse_args()

    version = read_uv_version()
    changed: list[Path] = []

    for path in TARGETS:
        original = path.read_text(encoding="utf-8")
        if path.name == "pyproject.toml":
            updated = sync_pyproject(original, version)
        else:
            updated = sync_install(original, version)

        if updated != original:
            if args.check:
                changed.append(path)
            else:
                path.write_text(updated, encoding="utf-8")
                changed.append(path)

    if args.check and changed:
        for path in changed:
            print(f"Out of sync: {path.relative_to(ROOT)}", file=sys.stderr)
        return 1

    if not args.check:
        if changed:
            print("Synced:")
            for path in changed:
                print(f"- {path.relative_to(ROOT)}")
        else:
            print("Already in sync.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

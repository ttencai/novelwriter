#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${VENV_DIR:-$ROOT_DIR/.venv}"
PYTHON_REQUEST="${PYTHON_BIN:-}"
INSTALL_DEV=true

usage() {
  cat <<'EOF'
Usage: scripts/setup_python_env.sh [--no-dev]

Bootstraps the repo-local uv-managed virtualenv from pyproject.toml + uv.lock.

Environment overrides:
  VENV_DIR   Custom virtualenv path (default: <repo>/.venv)
  PYTHON_BIN Python executable or version request for `uv venv --python`
EOF
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --dev)
      INSTALL_DEV=true
      ;;
    --no-dev)
      INSTALL_DEV=false
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if ! command -v uv >/dev/null 2>&1; then
  echo "Error: uv is not installed." >&2
  exit 1
fi

if [[ -z "$PYTHON_REQUEST" ]] && [[ -f "$ROOT_DIR/.python-version" ]]; then
  PYTHON_REQUEST="$(tr -d '[:space:]' < "$ROOT_DIR/.python-version")"
fi

if [[ -z "$PYTHON_REQUEST" ]]; then
  PYTHON_REQUEST="python3"
fi

mkdir -p "$(dirname "$VENV_DIR")"

cd "$ROOT_DIR"
uv venv --allow-existing --python "$PYTHON_REQUEST" "$VENV_DIR"

PY_BIN="$VENV_DIR/bin/python"
export UV_PROJECT_ENVIRONMENT="$VENV_DIR"

if [[ "$INSTALL_DEV" == false ]]; then
  uv sync \
    --project "$ROOT_DIR" \
    --python "$PY_BIN" \
    --frozen \
    --no-install-project \
    --no-dev
else
  uv sync \
    --project "$ROOT_DIR" \
    --python "$PY_BIN" \
    --frozen \
    --no-install-project
fi

echo "Python environment ready at $VENV_DIR"

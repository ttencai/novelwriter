#!/usr/bin/env bash
set -euo pipefail

NOVWR_REPO_URL="${NOVWR_REPO_URL:-https://github.com/Hurricane0698/novelwriter.git}"
NOVWR_INSTALL_REF="${NOVWR_INSTALL_REF:-}"
NOVWR_PACKAGE_SPEC="${NOVWR_PACKAGE_SPEC:-}"
NOVWR_UV_VERSION="${NOVWR_UV_VERSION:-}"
NOVWR_HOME="${NOVWR_HOME:-$HOME/.novwr}"
NOVWR_IMAGE="${NOVWR_IMAGE:-}"
NOVWR_BIND_HOST="${NOVWR_BIND_HOST:-}"
NOVWR_PORT="${NOVWR_PORT:-}"
NOVWR_SKIP_INIT="${NOVWR_SKIP_INIT:-0}"
NOVWR_SKIP_RUN="${NOVWR_SKIP_RUN:-0}"
DEFAULT_NOVWR_UV_VERSION="0.10.4"

ensure_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

ensure_uv() {
  if command -v uv >/dev/null 2>&1; then
    return
  fi

  local uv_version
  uv_version="$(resolve_uv_version)"
  echo "uv not found; installing uv..."
  local installer
  installer="$(mktemp)"
  curl -LsSf "https://astral.sh/uv/${uv_version}/install.sh" -o "$installer"
  UV_NO_MODIFY_PATH=1 sh "$installer" --quiet
  rm -f "$installer"
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
}

github_raw_base() {
  local repo_url="${NOVWR_REPO_URL%.git}"
  if [[ "$repo_url" =~ ^https://github\.com/([^/]+)/([^/]+)$ ]]; then
    printf 'https://raw.githubusercontent.com/%s/%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return
  fi
  return 1
}

resolve_uv_version() {
  if [[ -n "$NOVWR_UV_VERSION" ]]; then
    printf '%s\n' "$NOVWR_UV_VERSION"
    return
  fi

  local raw_base repo_ref detected_version
  repo_ref="${NOVWR_INSTALL_REF:-master}"
  if raw_base="$(github_raw_base)"; then
    detected_version="$(
      curl -fsSL "${raw_base}/${repo_ref}/.uv-version" 2>/dev/null | tr -d '[:space:]'
    )" || true
    if [[ -n "$detected_version" ]]; then
      printf '%s\n' "$detected_version"
      return
    fi
  fi

  printf '%s\n' "$DEFAULT_NOVWR_UV_VERSION"
}

build_package_spec() {
  if [[ -n "$NOVWR_PACKAGE_SPEC" ]]; then
    printf '%s\n' "$NOVWR_PACKAGE_SPEC"
    return
  fi

  local repo_url="${NOVWR_REPO_URL%.git}"
  if [[ "$repo_url" == https://github.com/* ]]; then
    if [[ -z "$NOVWR_INSTALL_REF" ]]; then
      printf 'novwr @ %s/archive/refs/heads/master.tar.gz\n' "$repo_url"
      return
    fi
    printf 'novwr @ %s/archive/%s.tar.gz\n' "$repo_url" "$NOVWR_INSTALL_REF"
    return
  fi

  if [[ -z "$NOVWR_INSTALL_REF" ]]; then
    printf 'git+%s\n' "$NOVWR_REPO_URL"
    return
  fi

  printf 'git+%s@%s\n' "$NOVWR_REPO_URL" "$NOVWR_INSTALL_REF"
}

ensure_command curl
ensure_uv

package_spec="$(build_package_spec)"
if [[ "$package_spec" == git+* ]]; then
  ensure_command git
fi

echo "Installing novwr CLI from ${package_spec} ..."
uv tool install --force "$package_spec"
export PATH="$HOME/.local/bin:$PATH"

if ! command -v novwr >/dev/null 2>&1; then
  echo "novwr CLI is not on PATH after installation." >&2
  echo "Try adding \$HOME/.local/bin to PATH, then run novwr manually." >&2
  exit 1
fi

if [[ "$NOVWR_SKIP_INIT" != "1" ]]; then
  init_args=(init --dir "$NOVWR_HOME")
  if [[ -n "$NOVWR_IMAGE" ]]; then
    init_args+=(--image "$NOVWR_IMAGE")
  fi
  if [[ -n "$NOVWR_BIND_HOST" ]]; then
    init_args+=(--bind-host "$NOVWR_BIND_HOST")
  fi
  if [[ -n "$NOVWR_PORT" ]]; then
    init_args+=(--port "$NOVWR_PORT")
  fi
  novwr "${init_args[@]}"
fi

if [[ "$NOVWR_SKIP_RUN" != "1" ]]; then
  novwr run --dir "$NOVWR_HOME"
fi

cat <<EOF

NovWr CLI installed successfully.

Common commands:
  novwr init --dir "$NOVWR_HOME"
  novwr run --dir "$NOVWR_HOME"
  novwr doctor --dir "$NOVWR_HOME"
  novwr upgrade --dir "$NOVWR_HOME"
  novwr uninstall --dir "$NOVWR_HOME"

Installation directory:
  $NOVWR_HOME

If OPENAI_API_KEY is still empty, edit:
  $NOVWR_HOME/.env
EOF

#!/usr/bin/env bash
set -euo pipefail

OTTO_ROOT="${OTTO_ROOT:-$HOME/.local/share/otto}"
RELEASES_DIR="${OTTO_ROOT}/releases"
CURRENT_LINK="${OTTO_ROOT}/current"
BIN_DIR="${OTTO_BIN_DIR:-$HOME/.local/bin}"
INSTALL_META="${OTTO_ROOT}/install.env"
DEFAULT_REPO="MarcoMuellner/otto"

BLUE=$'\033[0;34m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
NC=$'\033[0m'

info() { echo "${BLUE}[install]${NC} $*"; }
success() { echo "${GREEN}[install]${NC} $*"; }
warn() { echo "${YELLOW}[install]${NC} $*"; }
error() { echo "${RED}[install]${NC} $*" >&2; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command '$1' not found"
    exit 1
  fi
}

detect_shell_rc_file() {
  local shell_name
  shell_name="$(basename "${SHELL:-}")"

  case "${shell_name}" in
    zsh) echo "${HOME}/.zshrc" ;;
    bash) echo "${HOME}/.bashrc" ;;
    *)
      if [[ -f "${HOME}/.zshrc" ]]; then
        echo "${HOME}/.zshrc"
      else
        echo "${HOME}/.bashrc"
      fi
      ;;
  esac
}

ensure_local_bin_on_path() {
  local rc_file
  rc_file="$(detect_shell_rc_file)"
  mkdir -p "${BIN_DIR}"

  if [[ ":${PATH}:" == *":${BIN_DIR}:"* ]]; then
    return
  fi

  touch "${rc_file}"

  if ! grep -Fq "${BIN_DIR}" "${rc_file}"; then
    {
      echo ""
      echo "# Added by Otto installer"
      echo "export PATH=\"${BIN_DIR}:\$PATH\""
    } >> "${rc_file}"
    warn "Added ${BIN_DIR} to PATH in ${rc_file}. Restart shell or run: source ${rc_file}"
  fi
}

resolve_repo() {
  local repo="${1:-}"

  if [[ -z "${repo}" ]]; then
    echo "${DEFAULT_REPO}"
    return
  fi

  echo "${repo}"
}

fetch_release_info() {
  local repo="$1"
  local channel="$2"
  local install_ref="${OTTO_INSTALL_REF:-main}"
  local helper_url="https://raw.githubusercontent.com/${repo}/${install_ref}/scripts/resolve-release.mjs"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap "rm -rf \"${tmp_dir}\"" RETURN

  curl -fsSL "${helper_url}" -o "${tmp_dir}/resolve-release.mjs"
  node "${tmp_dir}/resolve-release.mjs" "${repo}" "${channel}"
}

install_release() {
  local tag="$1"
  local artifact_url="$2"

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap "rm -rf \"${tmp_dir}\"" RETURN

  mkdir -p "${RELEASES_DIR}"

  info "Downloading ${tag}..."
  curl -fsSL "${artifact_url}" -o "${tmp_dir}/otto.tgz"

  local release_dir="${RELEASES_DIR}/${tag}"
  rm -rf "${release_dir}"
  mkdir -p "${release_dir}"
  tar -xzf "${tmp_dir}/otto.tgz" -C "${release_dir}"

  ln -sfn "${release_dir}" "${CURRENT_LINK}"

  if [[ ! -f "${CURRENT_LINK}/bin/ottoctl" ]]; then
    error "Artifact does not contain bin/ottoctl"
    exit 1
  fi

  mkdir -p "${BIN_DIR}"
  cp "${CURRENT_LINK}/bin/ottoctl" "${BIN_DIR}/ottoctl"
  chmod +x "${BIN_DIR}/ottoctl"

  success "Installed release ${tag}"
}

write_install_meta() {
  local repo="$1"
  mkdir -p "${OTTO_ROOT}"
  cat > "${INSTALL_META}" <<EOF
OTTO_GITHUB_REPO=${repo}
OTTO_ROOT=${OTTO_ROOT}
OTTO_BIN_DIR=${BIN_DIR}
EOF
}

main() {
  local channel="stable"
  local repo=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --nightly)
        channel="nightly"
        shift
        ;;
      --repo)
        repo="${2:-}"
        shift 2
        ;;
      *)
        error "Unknown option: $1"
        exit 1
        ;;
    esac
  done

  require_cmd curl
  require_cmd tar
  require_cmd node

  repo="$(resolve_repo "${repo}")"

  local release_info
  release_info="$(fetch_release_info "${repo}" "${channel}")"
  local tag artifact_url artifact_name
  tag="$(printf '%s\n' "${release_info}" | sed -n '1p')"
  artifact_url="$(printf '%s\n' "${release_info}" | sed -n '2p')"
  artifact_name="$(printf '%s\n' "${release_info}" | sed -n '3p')"

  info "Using artifact ${artifact_name} (${tag})"

  install_release "${tag}" "${artifact_url}"
  write_install_meta "${repo}"
  ensure_local_bin_on_path

  info "Running first-time setup..."
  NODE_ENV=production node "${CURRENT_LINK}/dist/index.mjs" setup

  info "Installing and starting service..."
  "${BIN_DIR}/ottoctl" start

  success "Otto installed successfully"
  success "Control command: ottoctl"
}

main "$@"

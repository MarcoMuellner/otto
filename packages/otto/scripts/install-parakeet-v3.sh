#!/usr/bin/env bash
set -euo pipefail

OTTO_ROOT="${OTTO_ROOT:-$HOME/.local/share/otto}"
MODEL_ROOT="${OTTO_ROOT}/models/faster-whisper"
VENV_DIR="${MODEL_ROOT}/.venv"
MODEL_NAME="${OTTO_WHISPER_MODEL:-small}"
COMPUTE_TYPE="${OTTO_WHISPER_COMPUTE_TYPE:-int8}"
WHISPER_DEVICE="${OTTO_WHISPER_DEVICE:-auto}"
WHISPER_CACHE_DIR="${OTTO_WHISPER_CACHE:-${MODEL_ROOT}/cache}"
ENABLE_WARMUP="${OTTO_WHISPER_WARMUP:-1}"

BLUE=$'\033[0;34m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
NC=$'\033[0m'

info() { echo "${BLUE}[voice-setup]${NC} $*"; }
success() { echo "${GREEN}[voice-setup]${NC} $*"; }
warn() { echo "${YELLOW}[voice-setup]${NC} $*"; }
error() { echo "${RED}[voice-setup]${NC} $*" >&2; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command '$1' not found"
    exit 1
  fi
}

resolve_python_minor() {
  python3 - <<'PY'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}")
PY
}

ensure_ffmpeg() {
  if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
    info "ffmpeg is already installed"
    return 0
  fi

  warn "ffmpeg is missing; attempting automatic installation"

  if command -v apt-get >/dev/null 2>&1; then
    local apt_prefix=""
    if [[ "${EUID}" -ne 0 ]]; then
      if command -v sudo >/dev/null 2>&1; then
        apt_prefix="sudo"
      else
        warn "sudo is not available; cannot install ffmpeg automatically"
        return 1
      fi
    fi

    if ${apt_prefix} apt-get update && ${apt_prefix} apt-get install -y ffmpeg; then
      success "Installed ffmpeg"
      return 0
    fi
  fi

  warn "Automatic ffmpeg installation failed. Install ffmpeg manually and rerun this script."
  return 1
}

install_python_venv_prereqs() {
  if ! command -v apt-get >/dev/null 2>&1; then
    return 1
  fi

  local apt_prefix=""
  if [[ "${EUID}" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      apt_prefix="sudo"
    else
      warn "sudo is not available; cannot install python3-venv/python3-pip automatically"
      return 1
    fi
  fi

  local python_minor
  python_minor="$(resolve_python_minor)"

  info "Attempting to install Python runtime prerequisites"
  if ${apt_prefix} apt-get update && ${apt_prefix} apt-get install -y python3-venv python3-pip python3-virtualenv ca-certificates curl; then
    ${apt_prefix} apt-get install -y "python${python_minor}-venv" >/dev/null 2>&1 || true
    success "Installed Python prerequisites"
    return 0
  fi

  return 1
}

create_virtual_environment() {
  if python3 -m venv "${VENV_DIR}" >/dev/null 2>&1; then
    return 0
  fi

  if command -v virtualenv >/dev/null 2>&1; then
    virtualenv -p python3 "${VENV_DIR}" >/dev/null 2>&1
    return $?
  fi

  return 1
}

bootstrap_pip_with_download() {
  local get_pip
  get_pip="$(mktemp)"

  if command -v curl >/dev/null 2>&1; then
    if ! curl -fsSL "https://bootstrap.pypa.io/get-pip.py" -o "${get_pip}"; then
      rm -f "${get_pip}"
      return 1
    fi
  elif command -v wget >/dev/null 2>&1; then
    if ! wget -q "https://bootstrap.pypa.io/get-pip.py" -O "${get_pip}"; then
      rm -f "${get_pip}"
      return 1
    fi
  else
    rm -f "${get_pip}"
    return 1
  fi

  if ! "${VENV_DIR}/bin/python" "${get_pip}" >/dev/null 2>&1; then
    rm -f "${get_pip}"
    return 1
  fi

  if ! "${VENV_DIR}/bin/python" -m pip --version >/dev/null 2>&1; then
    rm -f "${get_pip}"
    return 1
  fi

  rm -f "${get_pip}"
  return 0
}

recreate_virtual_environment() {
  rm -rf "${VENV_DIR}"
  if ! create_virtual_environment; then
    error "Failed to recreate Python virtual environment at ${VENV_DIR}"
    return 1
  fi

  return 0
}

ensure_venv_pip() {
  if "${VENV_DIR}/bin/python" -m pip --version >/dev/null 2>&1; then
    return 0
  fi

  warn "pip is missing in virtual environment, attempting bootstrap"

  if "${VENV_DIR}/bin/python" -m ensurepip --upgrade >/dev/null 2>&1; then
    return 0
  fi

  if bootstrap_pip_with_download; then
    return 0
  fi

  error "Unable to bootstrap pip in ${VENV_DIR}."
  return 1
}

info "Preparing local Faster-Whisper runtime"
require_cmd python3
ensure_ffmpeg

# Pre-install Python packaging prerequisites proactively when available. This mirrors
# the manual workaround path that proved stable on Jetson hosts.
if command -v apt-get >/dev/null 2>&1; then
  install_python_venv_prereqs || warn "Could not preinstall Python prerequisites automatically"
fi

mkdir -p "${MODEL_ROOT}" "${WHISPER_CACHE_DIR}"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  info "Creating Python virtual environment at ${VENV_DIR}"
  if ! create_virtual_environment; then
    error "Failed to create Python virtual environment at ${VENV_DIR}"
    exit 1
  fi
fi

if ! ensure_venv_pip; then
  warn "pip bootstrap failed in existing virtual environment"

  if command -v apt-get >/dev/null 2>&1; then
    install_python_venv_prereqs || warn "Could not install Python prerequisites automatically"
  fi

  warn "Recreating virtual environment after failed pip bootstrap"
  if ! recreate_virtual_environment; then
    exit 1
  fi

  # First attempt standard bootstrap path.
  if ! ensure_venv_pip; then
    warn "Standard pip bootstrap failed in recreated environment; forcing get-pip fallback"

    # ensurepip can fail on some distros/python builds; tolerate failure and continue.
    "${VENV_DIR}/bin/python" -m ensurepip --upgrade >/dev/null 2>&1 || true

    if ! bootstrap_pip_with_download; then
      if command -v virtualenv >/dev/null 2>&1; then
        warn "Retrying with virtualenv seeder"
        rm -rf "${VENV_DIR}"
        if ! virtualenv -p python3 "${VENV_DIR}" >/dev/null 2>&1; then
          error "Failed to create Python virtual environment with virtualenv"
          exit 1
        fi
        if ! ensure_venv_pip; then
          error "Unable to provision pip in ${VENV_DIR}. Install python3-venv/python3-pip/python3-virtualenv and rerun."
          exit 1
        fi
      else
        error "Unable to provision pip in ${VENV_DIR}. Install python3-venv/python3-pip/python3-virtualenv and rerun."
        exit 1
      fi
    fi
  fi
fi

"${VENV_DIR}/bin/python" -m pip install --upgrade pip >/dev/null

info "Installing faster-whisper runtime"
if ! "${VENV_DIR}/bin/python" -m pip install --upgrade faster-whisper; then
  error "Failed to install faster-whisper runtime"
  exit 1
fi

if [[ "${ENABLE_WARMUP}" == "1" ]]; then
  info "Warming Faster-Whisper model cache (${MODEL_NAME})"
  if ! "${VENV_DIR}/bin/python" - <<PY
from faster_whisper import WhisperModel
WhisperModel(
    "${MODEL_NAME}",
    device="${WHISPER_DEVICE}",
    compute_type="${COMPUTE_TYPE}",
    download_root="${WHISPER_CACHE_DIR}",
)
print("ok")
PY
  then
    error "Failed to download/load model ${MODEL_NAME}"
    exit 1
  fi
else
  info "Skipping model warmup (set OTTO_WHISPER_WARMUP=1 to enable)"
fi

success "Installed Faster-Whisper runtime in ${VENV_DIR}"
success "Model cache root: ${WHISPER_CACHE_DIR}"

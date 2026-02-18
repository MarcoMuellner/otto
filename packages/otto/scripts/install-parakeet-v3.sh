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

ensure_venv_pip() {
  if "${VENV_DIR}/bin/python" -m pip --version >/dev/null 2>&1; then
    return 0
  fi

  warn "pip is missing in virtual environment, attempting bootstrap"

  if "${VENV_DIR}/bin/python" -m ensurepip --upgrade >/dev/null 2>&1; then
    return 0
  fi

  if command -v curl >/dev/null 2>&1; then
    local get_pip
    get_pip="$(mktemp)"
    if curl -fsSL "https://bootstrap.pypa.io/get-pip.py" -o "${get_pip}"; then
      if "${VENV_DIR}/bin/python" "${get_pip}" >/dev/null 2>&1; then
        rm -f "${get_pip}"
        return 0
      fi
    fi
    rm -f "${get_pip}"
  fi

  error "Unable to bootstrap pip in ${VENV_DIR}. Install python3-venv/python3-pip and retry."
  return 1
}

info "Preparing local Faster-Whisper runtime"
require_cmd python3
ensure_ffmpeg

mkdir -p "${MODEL_ROOT}" "${WHISPER_CACHE_DIR}"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  info "Creating Python virtual environment at ${VENV_DIR}"
  python3 -m venv "${VENV_DIR}"
fi

ensure_venv_pip
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

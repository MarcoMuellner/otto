#!/usr/bin/env bash
set -euo pipefail

OTTO_ROOT="${OTTO_ROOT:-$HOME/.local/share/otto}"
BIN_DIR="${OTTO_BIN_DIR:-$HOME/.local/bin}"
MODEL_ROOT="${OTTO_ROOT}/models/parakeet-v3"
VENV_DIR="${MODEL_ROOT}/.venv"
MODEL_NAME="${OTTO_PARAKEET_MODEL:-nvidia/parakeet-tdt-0.6b-v3}"
COMMAND_PATH="${BIN_DIR}/parakeet-v3-transcribe"
TORCH_INDEX_URL_JETSON="${OTTO_TORCH_INDEX_URL_JETSON:-https://pypi.jetson-ai-lab.io/jp6/cu126}"
ENABLE_WARMUP="${OTTO_PARAKEET_WARMUP:-0}"

BLUE=$'\033[0;34m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
NC=$'\033[0m'

info() { echo "${BLUE}[parakeet-setup]${NC} $*"; }
success() { echo "${GREEN}[parakeet-setup]${NC} $*"; }
warn() { echo "${YELLOW}[parakeet-setup]${NC} $*"; }
error() { echo "${RED}[parakeet-setup]${NC} $*" >&2; }

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

is_jetson_platform() {
  [[ -f /etc/nv_tegra_release ]]
}

ensure_torch_runtime() {
  if "${VENV_DIR}/bin/python" - <<'PY' >/dev/null 2>&1
import torch
print(torch.__version__)
PY
  then
    if "${VENV_DIR}/bin/python" - <<'PY' >/dev/null 2>&1
import torch
raise SystemExit(0 if torch.cuda.is_available() else 1)
PY
    then
      info "PyTorch with CUDA is already available in venv"
      return 0
    fi
  fi

  if is_jetson_platform; then
    info "Installing Jetson CUDA-enabled PyTorch from ${TORCH_INDEX_URL_JETSON}"
    if ! "${VENV_DIR}/bin/python" -m pip install --upgrade --force-reinstall --index-url "${TORCH_INDEX_URL_JETSON}" torch; then
      error "Failed to install CUDA-enabled torch for Jetson"
      return 1
    fi

    if ! "${VENV_DIR}/bin/python" - <<'PY' >/dev/null 2>&1
import torch
raise SystemExit(0 if torch.cuda.is_available() else 1)
PY
    then
      error "Installed torch does not expose CUDA. Check JetPack/PyTorch wheel compatibility."
      return 1
    fi

    success "CUDA-enabled PyTorch detected"
    return 0
  fi

  info "Installing default PyTorch runtime"
  if ! "${VENV_DIR}/bin/python" -m pip install --upgrade torch; then
    error "Failed to install PyTorch runtime"
    return 1
  fi
}

info "Preparing local Parakeet v3 runtime"
require_cmd python3
ensure_ffmpeg

mkdir -p "${MODEL_ROOT}" "${BIN_DIR}"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  info "Creating Python virtual environment at ${VENV_DIR}"
  python3 -m venv "${VENV_DIR}"
fi

ensure_venv_pip
"${VENV_DIR}/bin/python" -m pip install --upgrade pip >/dev/null
ensure_torch_runtime

if ! "${VENV_DIR}/bin/python" -c "import nemo.collections.asr" >/dev/null 2>&1; then
  info "Installing NeMo ASR dependencies (this can take a while)"
  if ! "${VENV_DIR}/bin/python" -m pip install "nemo_toolkit[asr]"; then
    error "Failed to install NeMo ASR runtime"
    exit 1
  fi
else
  info "NeMo ASR already installed in venv"
fi

if [[ "${ENABLE_WARMUP}" == "1" ]]; then
  info "Warming Parakeet model cache (${MODEL_NAME})"
  if ! "${VENV_DIR}/bin/python" - <<PY
from nemo.collections.asr.models import ASRModel
ASRModel.from_pretrained("${MODEL_NAME}")
print("ok")
PY
  then
    error "Failed to download/load model ${MODEL_NAME}"
    exit 1
  fi
else
  info "Skipping model warmup for faster setup (set OTTO_PARAKEET_WARMUP=1 to enable)"
fi

cat > "${COMMAND_PATH}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

OTTO_ROOT="${OTTO_ROOT:-$HOME/.local/share/otto}"
VENV_DIR="${OTTO_ROOT}/models/parakeet-v3/.venv"
MODEL_NAME="${OTTO_PARAKEET_MODEL:-nvidia/parakeet-tdt-0.6b-v3}"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  echo "Parakeet runtime not installed" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: parakeet-v3-transcribe <audio-file>" >&2
  exit 1
fi

INPUT_FILE="$1"
if [[ ! -f "${INPUT_FILE}" ]]; then
  echo "Input file not found: ${INPUT_FILE}" >&2
  exit 1
fi

"${VENV_DIR}/bin/python" - "${INPUT_FILE}" "${MODEL_NAME}" <<'PY'
import json
import sys
from nemo.collections.asr.models import ASRModel

input_file = sys.argv[1]
model_name = sys.argv[2]

model = ASRModel.from_pretrained(model_name)
result = model.transcribe([input_file])

if isinstance(result, list):
    text = str(result[0]) if result else ""
else:
    text = str(result)

print(json.dumps({"text": text.strip(), "language": None}))
PY
EOF

chmod +x "${COMMAND_PATH}"

if [[ ":${PATH}:" != *":${BIN_DIR}:"* ]]; then
  warn "${BIN_DIR} is not currently on PATH"
fi

success "Installed parakeet-v3-transcribe at ${COMMAND_PATH}"

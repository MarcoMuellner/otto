#!/usr/bin/env bash
set -euo pipefail

OTTO_ROOT="${OTTO_ROOT:-$HOME/.local/share/otto}"
BIN_DIR="${OTTO_BIN_DIR:-$HOME/.local/bin}"
MODEL_ROOT="${OTTO_ROOT}/models/parakeet-v3"
VENV_DIR="${MODEL_ROOT}/.venv"
MODEL_NAME="${OTTO_PARAKEET_MODEL:-nvidia/parakeet-tdt-0.6b-v3}"
COMMAND_PATH="${BIN_DIR}/parakeet-v3-transcribe"

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

info "Preparing local Parakeet v3 runtime"
require_cmd python3

mkdir -p "${MODEL_ROOT}" "${BIN_DIR}"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  info "Creating Python virtual environment at ${VENV_DIR}"
  python3 -m venv "${VENV_DIR}"
fi

"${VENV_DIR}/bin/python" -m pip install --upgrade pip >/dev/null

if ! "${VENV_DIR}/bin/python" -c "import nemo.collections.asr" >/dev/null 2>&1; then
  info "Installing NeMo ASR dependencies (this can take a while)"
  if ! "${VENV_DIR}/bin/python" -m pip install "nemo_toolkit[asr]"; then
    error "Failed to install NeMo ASR runtime"
    exit 1
  fi
else
  info "NeMo ASR already installed in venv"
fi

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

#!/usr/bin/env python3
import json
import os
import sys
import traceback
import importlib


def write_event(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def write_error(message):
    sys.stderr.write(message + "\n")
    sys.stderr.flush()


def resolve_text(result):
    if isinstance(result, list):
        if not result:
            return ""
        return str(result[0])
    return str(result)


def main():
    try:
        asr_models = importlib.import_module("nemo.collections.asr.models")
        ASRModel = getattr(asr_models, "ASRModel")
    except Exception as exc:
        write_error(f"Failed to import NeMo ASR: {exc}")
        raise

    model_name = os.environ.get("OTTO_PARAKEET_MODEL", "nvidia/parakeet-tdt-0.6b-v3")

    try:
        model = ASRModel.from_pretrained(model_name)
    except Exception as exc:
        write_error(f"Failed to load Parakeet model '{model_name}': {exc}")
        raise

    write_event({"event": "ready"})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            payload = json.loads(line)
        except Exception:
            write_error("Ignoring invalid JSON payload")
            continue

        event = payload.get("event")
        if event == "shutdown":
            return

        if event != "transcribe":
            write_error(f"Ignoring unsupported event: {event}")
            continue

        request_id = payload.get("id")
        if not isinstance(request_id, str) or not request_id:
            write_error("Ignoring transcription request without valid id")
            continue

        audio_file_path = payload.get("audioFilePath")
        if not isinstance(audio_file_path, str) or not os.path.isfile(audio_file_path):
            write_event(
                {
                    "event": "result",
                    "id": request_id,
                    "ok": False,
                    "error": f"Input file not found: {audio_file_path}",
                }
            )
            continue

        try:
            result = model.transcribe([audio_file_path])
            text = resolve_text(result).strip()
            if not text:
                raise RuntimeError("Parakeet returned empty transcription")

            write_event(
                {
                    "event": "result",
                    "id": request_id,
                    "ok": True,
                    "text": text,
                    "language": None,
                }
            )
        except Exception as exc:
            write_event(
                {
                    "event": "result",
                    "id": request_id,
                    "ok": False,
                    "error": str(exc),
                }
            )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

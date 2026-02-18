#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import tempfile
import traceback


def write_event(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def write_error(message):
    sys.stderr.write(message + "\n")
    sys.stderr.flush()


def normalize_language(value):
    if not isinstance(value, str):
        return None

    normalized = value.strip().lower()
    if not normalized or normalized == "auto":
        return None

    return normalized.split("-", 1)[0]


def normalize_audio_to_wav(source_path):
    handle, destination_path = tempfile.mkstemp(prefix="otto-fw-", suffix=".wav")
    os.close(handle)

    command = [
        "ffmpeg",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        source_path,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        destination_path,
    ]

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        if os.path.exists(destination_path):
            os.remove(destination_path)
        raise RuntimeError(
            f"ffmpeg normalization failed (code {result.returncode}): {stderr or 'unknown error'}"
        )

    return destination_path


class WhisperWorker:
    def __init__(self):
        try:
            from faster_whisper import WhisperModel
        except Exception as exc:
            write_error(f"Failed to import faster-whisper: {exc}")
            raise

        self._WhisperModel = WhisperModel
        self.model_name = None
        self.model = None
        self.download_root = os.environ.get(
            "OTTO_WHISPER_CACHE",
            os.path.join(
                os.environ.get(
                    "OTTO_ROOT",
                    os.path.join(os.path.expanduser("~"), ".local", "share", "otto"),
                ),
                "models",
                "faster-whisper",
                "cache",
            ),
        )
        self.device = os.environ.get("OTTO_WHISPER_DEVICE", "auto")
        self.compute_type = os.environ.get("OTTO_WHISPER_COMPUTE_TYPE", "int8")

        default_model = os.environ.get("OTTO_WHISPER_MODEL", "small")
        self.ensure_model(default_model)

    def ensure_model(self, requested_model):
        if not isinstance(requested_model, str) or not requested_model.strip():
            requested_model = os.environ.get("OTTO_WHISPER_MODEL", "small")

        resolved = requested_model.strip()
        if self.model is not None and self.model_name == resolved:
            return

        self.model = self._WhisperModel(
            resolved,
            device=self.device,
            compute_type=self.compute_type,
            download_root=self.download_root,
        )
        self.model_name = resolved

    def transcribe_file(self, audio_file_path, language, model_name):
        self.ensure_model(model_name)
        if self.model is None:
            raise RuntimeError("faster-whisper model is not initialized")
        normalized_language = normalize_language(language)

        normalized_path = normalize_audio_to_wav(audio_file_path)
        try:
            segments, info = self.model.transcribe(
                normalized_path,
                language=normalized_language,
                vad_filter=True,
                condition_on_previous_text=False,
                beam_size=5,
            )

            text_parts = []
            for segment in segments:
                part = segment.text.strip()
                if part:
                    text_parts.append(part)

            text = " ".join(text_parts).strip()
            if not text:
                raise RuntimeError("faster-whisper returned empty transcription")

            language_value = getattr(info, "language", None)
            language_text = str(language_value).strip() if language_value else None
            return text, language_text or None
        finally:
            if os.path.exists(normalized_path):
                os.remove(normalized_path)


def main():
    worker = WhisperWorker()
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
            text, language = worker.transcribe_file(
                audio_file_path,
                payload.get("language"),
                payload.get("model"),
            )
            write_event(
                {
                    "event": "result",
                    "id": request_id,
                    "ok": True,
                    "text": text,
                    "language": language,
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

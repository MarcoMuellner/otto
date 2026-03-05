---
id: setup-and-config
title: Setup and Configuration Commands
description: Configure Telegram, voice transcription, and service runtime environment.
---

These commands configure installed runtime behavior without editing service files
manually.

## Telegram Configuration

### `ottoctl configure-telegram`

Runs interactive Telegram credential setup.

- Stores credentials in `~/.local/share/otto/secrets/telegram.env`
- Accepts skip in interactive flow

## Voice Transcription Configuration

### `ottoctl configure-voice-transcription`

Runs interactive local Faster-Whisper setup.

- Attempts auto-provisioning
- Falls back safely when provisioning is unavailable
- Writes settings into `~/.config/otto/config.jsonc`

## Runtime Environment Commands

### `ottoctl env list`

Prints current runtime environment file content.

### `ottoctl env path`

Prints runtime environment file path.

### `ottoctl env set <KEY> <VALUE>`

Persists a runtime env var.

### `ottoctl env unset <KEY>`

Removes a runtime env var.

Environment changes require restart to apply:

```bash
ottoctl restart
```

## Examples

```bash
ottoctl configure-telegram
ottoctl configure-voice-transcription
ottoctl env set OTTO_DOCS_PORT 4174
ottoctl env unset OTTO_DOCS_PORT
```

## Failure Modes

- Invalid env key format is rejected.
- Missing required arguments prints usage and exits non-zero.
- Non-interactive terminals skip interactive setup paths where designed.

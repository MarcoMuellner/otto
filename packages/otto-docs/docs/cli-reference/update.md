---
id: update
title: Update Command
description: Update installed Otto release channel and refresh running services.
---

`ottoctl update` installs a release artifact, runs setup, refreshes service
definitions, and restarts services.

## Command

- `ottoctl update [--nightly] [--pr <number>] [--repo <owner>/<repo>]`

## Channel Selection

- Default: latest stable
- `--nightly`: latest nightly
- `--pr <number>`: nightly artifact for a pull request

## Repository Override

- `--repo <owner>/<repo>` selects alternate GitHub repository

## Examples

```bash
ottoctl update
ottoctl update --nightly
ottoctl update --pr 123
ottoctl update --repo owner/repo
```

## Side Effects

- Updates installed `current` release link
- Runs `setup`
- Re-runs credential/setup prompts where needed
- Installs service definitions and restarts runtime/control-plane/docs service

## Failure Modes

- Invalid `--pr` values are rejected.
- Unknown update options fail with non-zero exit.
- Artifact fetch failures abort update.

---
id: doctor
title: Doctor Commands
description: Run fast or deep health checks with deterministic exit behavior.
---

Doctor checks validate runtime, connectivity, auth, and deeper probe contracts.

## Commands

- `ottoctl doctor`
- `ottoctl doctor --deep`

## Modes

- `doctor` runs fast checks.
- `doctor --deep` runs fast and deep checks.

## Exit Behavior

- `0`: verdict is green
- `1`: verdict is yellow or red
- `2`: internal doctor failure

## Output and Artifacts

- Terminal output includes verdict, phase summary, problems, and remediation
  hints.
- Non-green runs generate local incident markdown reports.

## Examples

```bash
ottoctl doctor
ottoctl doctor --deep
```

## Failure Modes

- Unknown doctor options fail with usage guidance.
- Deep checks can report requirement/probe/cleanup failures with explicit evidence
  codes.

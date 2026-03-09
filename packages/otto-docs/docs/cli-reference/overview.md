---
id: overview
title: CLI Reference Overview
description: Command-level reference for ottoctl.
---

This section is the release-matched reference for `ottoctl`.

Use these pages when you need exact command behavior, accepted arguments, and
operator-safe examples.

## Command Groups

- [Lifecycle Commands](./lifecycle.md)
- [Setup and Configuration Commands](./setup-and-config.md)
- [Task Commands](./tasks.md)
- [Model Commands](./models.md)
- [Prompt Command](./prompt.md)
- [Extension Commands](./extensions.md)
- [Doctor Commands](./doctor.md)
- [Update Command](./update.md)

## Source of Truth

- Runtime command dispatch: `packages/otto/bin/ottoctl`
- Runtime doctor mode dispatch: `packages/otto/src/cli/command.ts`
- Model/extension/prompt sub-CLI behavior:
  - `packages/otto/src/model-cli.ts`
  - `packages/otto/src/extension-cli.ts`
  - `packages/otto/src/prompt-cli.ts`

When command behavior changes, this reference must be updated in the same
delivery.

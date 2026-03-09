---
id: models
title: Model Commands
description: Inspect model catalog, refresh catalog data, and manage flow defaults.
---

Model commands call Otto external API using bearer token auth.

## Commands

- `ottoctl model list`
- `ottoctl model refresh`
- `ottoctl model defaults show`
- `ottoctl model defaults set <flow> <provider/model|inherit>`

## Auth and Endpoint Resolution

Model CLI resolves runtime access in this order:

1. `OTTO_EXTERNAL_API_URL` (explicit)
2. `OTTO_EXTERNAL_API_HOST` + `OTTO_EXTERNAL_API_PORT`
3. Token from `OTTO_EXTERNAL_API_TOKEN` or token file

Default token file path:

- `~/.otto/secrets/internal-api.token`

## Examples

```bash
ottoctl model list
ottoctl model refresh
ottoctl model defaults show
ottoctl model defaults set interactiveAssistant openai/gpt-5-mini
```

## Failure Modes

- Unreachable API endpoint returns non-zero with actionable message.
- Missing/invalid token returns non-zero.
- Invalid model ref or flow name is rejected by schema validation.

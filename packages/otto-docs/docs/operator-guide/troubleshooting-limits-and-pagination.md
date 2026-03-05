---
id: troubleshooting-limits-and-pagination
title: Troubleshooting Limits and Pagination
description: Resolve issues related to scheduler, audit, runs, and other operational limits.
---

Use this page when commands fail due to limit constraints or list truncation.

## Symptoms

- `task audit` rejects a requested limit
- Live snapshot `limits` values differ from operator assumptions
- List views show fewer rows than expected

## Checks

```bash
ottoctl task audit 50
ottoctl task audit 200
```

Inspect deployed live docs (if enabled) for current values under:

- `limits.scheduler`
- `limits.pagination`
- `limits.profile`

## Known Constraints

- `ottoctl task audit [limit]` accepts `1-200`
- Scheduler behavior follows configured tick/batch/lease values
- List-style endpoints and views may enforce default and max page limits

## Recovery Actions

- Re-run commands with accepted bounds.
- Align operational runbooks with currently exposed limits.
- If limits changed unexpectedly, validate release/version context and recent
  update history.

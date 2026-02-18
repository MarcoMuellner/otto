---
name: onepassword
description: Set up and use 1Password CLI (`op`) for sign-in, account checks, secret reads, and safe env injection.
license: MIT
compatibility: opencode
metadata:
  tool: op
  security: high
---

# 1Password CLI Skill

Use this skill when you need secrets from 1Password through the `op` CLI.

## References

- https://developer.1password.com/docs/cli/get-started/

## Workflow

1. Detect OS and shell.
2. Verify CLI is available: `op --version`.
3. Confirm 1Password desktop app integration is enabled and app is unlocked.
4. Run all `op` commands inside a fresh tmux session.
5. Sign in in tmux: `op signin`.
6. Verify access in tmux: `op whoami`.
7. For multiple accounts, use `--account` or `OP_ACCOUNT`.

## Required tmux pattern

Otto shell actions are non-interactive and do not preserve a TTY between calls. To avoid repeated auth prompts and session failures, always run `op` in a dedicated tmux session.

```bash
SOCKET_DIR="${TMPDIR:-/tmp}/otto-tmux-sockets"
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/onepassword.sock"
SESSION="op-auth-$(date +%Y%m%d-%H%M%S)"

tmux -S "$SOCKET" new -d -s "$SESSION" -n shell
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- "op signin" Enter
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- "op whoami" Enter
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- "op vault list" Enter
tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION":0.0 -S -200
tmux -S "$SOCKET" kill-session -t "$SESSION"
```

## Guardrails

- Never print or paste secret values into logs, chat, or code.
- Prefer `op run` or `op inject` over writing secrets to disk.
- If you see `account is not signed in`, re-run `op signin` inside tmux and approve in app.
- If tmux is unavailable, stop and ask before running `op` directly.

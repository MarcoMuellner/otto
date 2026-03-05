# Obsidian Skills Extension

This extension adds Obsidian CLI vault operation skills to Otto/OpenCode.

## Included skills

- `obsidian-cli`

## Install

```bash
ottoctl extension install obsidian
```

Install activates immediately in the runtime footprint.

If Otto is already running, restart the service to refresh skill discovery:

```bash
ottoctl stop
ottoctl start
```

## Verify

Check skill file exists at:

- `~/.otto/.opencode/skills/obsidian-cli/SKILL.md`

Reference docs are bundled at:

- `~/.otto/.opencode/skills/obsidian-cli/references/command-reference.md`

## Upstream source and license

This extension vendors skill content from:

- Internal Otto Obsidian CLI skill and bundled command reference

License details are defined by this repository.

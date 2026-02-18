# Obsidian Skills Extension

This extension adds Obsidian-focused skills to Otto/OpenCode.

## Included skills

- `obsidian-markdown`

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

- `~/.otto/.opencode/skills/obsidian-markdown/SKILL.md`

## Upstream source and license

This extension vendors the upstream skill content from:

- `https://github.com/kepano/obsidian-skills/blob/main/skills/obsidian-markdown/SKILL.md`

The upstream project is licensed under MIT:

- `https://github.com/kepano/obsidian-skills/blob/main/LICENSE`

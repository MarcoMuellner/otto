# Otto Frontend Design Language (Paper Void)

This document is the product-specific frontend language for Otto.

Base standard: @packages/ui-design/design-language-general.md

This spec adapts the universal language to Otto's runtime model and UX goals, based on:
- `packages/otto/src/index.ts` (single predictable runtime entry and command orchestration)
- `packages/ui-design/epic_web_ui/variant_15_paper_power.html` (Paper Void visual direction)

## 1) Product Intent

Otto is an operational companion, not a noisy admin panel.

The UI should feel:
- calm at idle
- precise during action
- deep when needed

Default posture: "quiet control".

## 2) Runtime-Informed Interaction Model

Because Otto routes execution through explicit commands (`setup`, `serve`, `telegram-worker`), the UI mirrors that mental model:

- command first: a central command bar/palette is always available
- explicit lanes: actions are intentional, with clear scope and effect
- deterministic feedback: each action shows state, logs, and outcome

Design implication:
- no hidden side effects
- no ambiguous status language
- no decorative controls without operational meaning

## 3) Visual Identity: Paper Void

Palette:
- paper background: `#f8f8f8`
- ink foreground: `#1a1a1a`
- secondary text: `#888888`
- accent pulse: `#eb3b3b`

Signature elements:
- side-by-side ambient rings for presence and depth
- central status marker (pulse dot)
- large time/state anchor in the center
- command bar as primary interaction surface

Texture:
- subtle grain to avoid sterile flatness

## 4) Navigation Model

Top-level operational surfaces:
- Home (status + command)
- Jobs (active + scheduled)
- Job Detail (live logs + payload + control)
- Audit Trail (paginated execution history)
- Run Detail (result payload + summary)
- Chat (operator conversation)
- System Status (services + resource health)
- Settings (feature flags + environment config)

Rules:
- command palette can reach every surface
- `Esc` consistently closes current overlay or returns to Home
- deep views are slide-over or modal layers to preserve context

## 5) Data Visibility Standard

For every job/run, the UI must support:
- identity: id, type, schedule, lane
- lifecycle: queued, running, succeeded, failed, cancelled
- timing: started/ended/duration/next run
- evidence: logs and payloads
- interpretation: human summary of what happened

For system health, the UI must support:
- service status matrix
- resource metrics (cpu, memory, disk)
- runtime metadata (version, uptime, environment)
- drift and failure indicators with recovery actions

## 6) Command Experience

Command bar behavior:
- focused by click or shortcut
- live-filtered command list while typing
- first filtered entry auto-highlighted
- Enter executes highlighted-first behavior

Command taxonomy:
- jump commands (go to jobs/chat/audit/system/settings)
- operation commands (restart service, run backup, re-run job)
- diagnostic commands (tail logs, inspect failed run, show env)

## 7) Accessibility and Responsiveness

Desktop:
- keyboard-first operation across palette and views
- visible focus styles and predictable tab order

Mobile:
- command palette as bottom sheet
- touch targets >= 44x44
- preserve core identity (rings, center anchor, command-first)

## 8) Non-Negotiables

- Operational truth over visual polish.
- Calm by default, depth on demand.
- One clear path to every critical action.
- Logs, payloads, and summaries are first-class, not hidden.
- Style consistency across all new Otto UI features.

## 9) Implementation Guidance

When adding a new screen/component:
1. Start from command discoverability (how users open it).
2. Define state model (idle/loading/success/error/degraded).
3. Add operational evidence (status, logs, payload, summary).
4. Validate keyboard and mobile before visual refinement.
5. Keep Paper Void primitives (palette, spacing, motion, rings) consistent.

# Ticket 010 - Heartbeat Pipeline (Morning/Midday/Evening)

## Objective

Implement scheduled heartbeat outputs that provide concise situational summaries and proactive prompts three times daily.

## Why

Heartbeats establish consistent assistant presence and help you stay aligned without manually asking for status.

## Scope

- Implement heartbeat content builder using OpenCode prompt templates.
- Schedule heartbeat windows using timezone profile.
- Produce outbound DM messages via queue.
- Include digest components (priorities, open tasks, suggested next action).

## Non-Goals

- Advanced personalization optimization (later iteration).

## Dependencies

- `ticket_006`, `ticket_009`.

## Acceptance Criteria

- Three daily heartbeats are sent at configured windows.
- Heartbeats are concise and high-signal.
- Duplicate heartbeat send is prevented for a window.

## Verification

- Time-window tests.
- Snapshot-style tests for heartbeat payload structure.

## Deployability

- Deployable with visible user value and low risk.

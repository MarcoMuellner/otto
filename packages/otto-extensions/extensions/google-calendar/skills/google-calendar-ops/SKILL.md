---
name: google-calendar-ops
description: Use Google Calendar MCP tools to manage calendars, inspect availability, and update events safely.
---

## When to use

- Use this skill for calendar planning, availability checks, and event lifecycle actions.
- Prefer this over manual date/time reasoning when calendar data can answer directly.

## Workflow

1. Start with `list-calendars` to confirm the target calendar.
2. Use `get-freebusy` before proposing or committing time slots.
3. Use `search-events` or `get-event` to confirm existing bookings.
4. Create or update events only after timezone and attendee details are explicit.

## Safety

- Confirm destructive actions (`delete-event`) before execution.
- Prefer updates over delete/recreate to preserve event history and links.
- Always include timezone-aware timestamps in user-facing confirmations.

## Common tasks

- Find next free slot: `get-freebusy` on the target window.
- Create meeting: `create-event` with title, start/end, attendees, and location/meeting link.
- Reschedule: `update-event` with new time and notify attendees in description or notes.

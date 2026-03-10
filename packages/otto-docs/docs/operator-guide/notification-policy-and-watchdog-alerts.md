---
id: notification-policy-and-watchdog-alerts
title: Notification Policy and Watchdog Alerts
description: Manage quiet-hours policy, global mute, and watchdog alert controls.
---

## Scope

Otto now supports two watchdog alert control modes in addition to existing
notification policy fields:

- Persistent watchdog toggle (`watchdogAlertsEnabled`)
- Temporary watchdog mute window (`watchdogMuteUntil`)

These controls are non-secret profile settings and are available through both
control-plane settings and interactive assistant lanes.

## Where to Change It

### Control Plane

Open `/settings` and use the **Watchdog Alerts** section to:

- Enable or disable watchdog alerts persistently.
- Apply a temporary mute in minutes.
- Clear an active watchdog mute window.

### Interactive Lanes (Telegram/Web/CLI Assistant)

The assistant uses internal notification-policy tools, so the same settings are
available from any interactive lane.

Examples:

- "Disable watchdog alerts"
- "Mute watchdog alerts for 8 hours"
- "Unmute watchdog alerts"

If a request is ambiguous (for example, "mute watchdog alerts"), the assistant
should ask whether you want:

- Temporary mute (duration-based), or
- Persistent disable

## Behavior Notes

- Watchdog checks still run even when alerts are muted or disabled.
- Muted or disabled watchdog alerts are skipped cleanly and do not require
  chat-id configuration.
- Existing global quiet-hours and global mute behavior remains unchanged.

## Verification

1. Disable watchdog alerts in `/settings`.
2. Trigger/observe a watchdog cycle with recent failures.
3. Confirm watchdog run success and no new watchdog outbound message.
4. Re-enable alerts and set a temporary mute window; confirm skip behavior
   until mute expiration.

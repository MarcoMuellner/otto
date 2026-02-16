# Ticket 011 - Voice Message Intake and Transcription

## Objective

Add Telegram voice message support and transcription so voice input becomes first-class inbound communication.

## Why

You explicitly require voice message support in Telegram. Without transcription, inbound communication remains incomplete.

## Scope

- Add Telegram voice update handler.
- Download voice/audio payload safely (size/time limits).
- Add transcription adapter interface and initial provider implementation.
- Forward transcript to the same single-chain inbound prompt/session pipeline.
- Persist original media metadata + transcript for audit.

## Non-Goals

- Multi-language intent classification refinement.

## Dependencies

- `ticket_004`, `ticket_005`.

## Acceptance Criteria

- Voice message is transcribed and handled like text input.
- Failure cases return actionable user feedback.
- Audio processing limits prevent abuse and runaway costs.

## Verification

- Unit tests for adapter and handler logic.
- Integration tests with fixture audio payloads.

## Deployability

- Deployable; extends capability with controlled operational cost.

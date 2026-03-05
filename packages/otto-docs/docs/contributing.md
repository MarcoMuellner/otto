---
id: contributing
title: Contributing
description: Documentation contribution conventions for consistent operator-facing quality.
---

Use these conventions to keep docs consistent and release-safe.

## Scope and Structure

- Place content in the matching IA section: Concepts, Contracts, Operator
  Guide, CLI Reference, API Reference.
- Keep one page focused on one operator task or one contract topic.
- Prefer adding pages over overloading long mixed-purpose documents.

## Writing Style

- Lead with operator intent and expected outcome.
- Use direct language and concrete terms.
- Separate facts from recommendations.
- Avoid hidden assumptions and implied preconditions.

## Required Elements per Page

Every substantive page should include:

1. Purpose and context.
2. Preconditions and required inputs.
3. Procedure or behavior description.
4. Verification signals (commands, logs, expected state).
5. Failure mode notes or escalation path where relevant.

## Frontmatter and Metadata

- Define `id`, `title`, and `description` in frontmatter.
- Keep `id` stable once published to avoid broken links.
- Keep titles concise and operator-readable.

## Command and API Examples

- Use fenced code blocks with language tags.
- Keep examples runnable and version-aligned.
- Document side effects and safety impact of commands.

## Links and Cross-References

- Use relative links for local docs pages.
- Link from guide pages to relevant contract and reference pages.
- Add backlink context when a page depends on another contract.

## Review Checklist

Before merging docs changes:

- Run `pnpm -C packages/otto-docs run check`.
- Confirm desktop and mobile nav remain readable.
- Verify new pages appear in sidebar and top-level navigation when needed.
- Ensure terminology and behavior match current release code.

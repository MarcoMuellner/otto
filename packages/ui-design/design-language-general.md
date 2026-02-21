# Universal UI Design Language

This document defines a reusable design language for building high-quality software interfaces in any domain (consumer apps, admin tools, operations consoles, mobile apps, and embedded dashboards).

## 1) Core Principles

1. Purpose over decoration
- Every visual element must support understanding, action, trust, or delight.
- If an element has no job, remove it.

2. Cognitive calm
- Surfaces should reduce mental overhead.
- Prefer progressive disclosure: show what is needed now, reveal depth on demand.

3. Predictable interaction
- One intent should produce one expected result.
- Keep command, navigation, and feedback models stable across the product.

4. Information hierarchy first
- Typography, spacing, and contrast establish priority before color or motion.
- Users should identify "what matters now" in less than 2 seconds.

5. Accessibility as baseline quality
- Meet WCAG 2.1 AA minimum contrast and keyboard operability.
- Design for screen readers, reduced motion, and touch targets from day one.

6. Performance as UX
- Fast systems feel trustworthy.
- Optimize perceived speed with immediate local feedback and progressive loading.

## 2) Structure and Layout

- Use a clear layering model:
  - Layer 0: ambient context (background, mood, depth)
  - Layer 1: primary information (state, core content)
  - Layer 2: actions and controls
  - Layer 3: transient overlays (dialogs, palettes, toasts)
- Keep a consistent grid rhythm (spacing scale and alignment rules).
- Use whitespace intentionally to separate concerns, not just fill space.

## 3) Typography and Color

- Typography should carry hierarchy, not visual effects.
- Limit font families (typically one sans + one mono).
- Choose one semantic accent color and define clear state colors (success, warning, error, info).
- Maintain high readability in all modes and contexts.

## 4) Interaction Model

- Prefer command-driven entry points for power users (palette, shortcuts, quick actions).
- Support direct manipulation for casual users (click, tap, visible controls).
- Ensure every important action has:
  - pre-action clarity (what happens)
  - in-action status (loading/progress)
  - post-action result (success/error + next step)

## 5) Motion and Feedback

- Motion should communicate state change, not distract.
- Use calm, short transitions (200-400ms) with meaningful easing.
- Reserve stronger motion for meaningful events (critical status change, context shift).
- Provide reduced-motion alternatives.

## 6) States and Resilience

Every significant screen must define:
- initial/loading state
- empty state
- success state
- error state with recovery path
- degraded/offline state when applicable

## 7) Platform-Agnostic UI Checklist

- Can users find the primary action quickly?
- Can users recover from failure without docs?
- Is keyboard-only flow fully usable?
- Is mobile flow one-thumb friendly?
- Does the UI still make sense with 3x data volume?
- Is the visual identity distinct but restrained?

## 8) Definition of Done for Design

A screen is complete when it is:
- understandable in under 10 seconds
- actionable in under 3 interactions for the core task
- accessible and responsive by default
- consistent with shared language and component patterns
- measurable (telemetry-ready for key interactions)

# 0001: A tablet layout in the same app

- Status: proposed
- Date: 2026-10-24

## Context

OpenMarch was unusable on touchscreens: a one-finger drag on the field moved
marchers and panned the view at the same time, the line tool ignored fingers,
right-click, hover and modifier keys gated many features, and most targets were
16–26 px. Tablets (iPad through the web editor, Android tablets, Windows tablets)
are a target for directors and drill writers.

The options were a separate tablet app, one responsive design with no named mode,
or a second layout of the same app.

## Decision

- One app, one file format, one editing engine, with two layouts: **desktop** and
  **tablet**. `InputModeStore` resolves the layout (Automatic follows the device's
  primary pointer; Settings can pin Tablet or Desktop) and writes
  `<html data-input="touch|pointer">`.
- The shared stylesheet in `@openmarch/ui` gains a `touch:` Tailwind variant keyed on
  that attribute; components declare their tablet sizes with it.
- `@openmarch/ui` exports `useLongPress`, `LongPressBubble` and `LONG_PRESS_MS`
  (public package API), used for "long press explains a control".
- Per-press behavior (gestures, hit radius, palm rejection) follows each press's
  `pointerType`, independent of the layout.
- Every feature stays reachable in both layouts (parity rule in
  [docs/tablet-layout.md](../tablet-layout.md)).

## Consequences

- Two layouts to design and test; the parity rule and browser scenarios that run
  touch flows guard against drift.
- A few behaviors changed for the desktop layout too (a marcher dot beats a
  selection handle; readouts; command palette button).
- The canvas gesture code targets Fabric and is expected to be replaced along with
  Fabric by the three.js field; the gesture rules and scenarios carry over.
- Adding `touch:` and the long-press exports to `@openmarch/ui` widens its API;
  consumers that don't set `data-input` are unaffected.

## Verification

- Unit tests for the gesture state machine, hit testing, input mode and layout rules.
- Browser scenarios with CDP multi-touch: `e2e/browser/tests/touch-canvas.spec.mts`,
  `touch-timeline.spec.mts`.
- Four rounds of scripted persona runs on emulated tablets, and hands-on testing on
  an iPad (7th gen, iPadOS 17) with Apple Pencil.

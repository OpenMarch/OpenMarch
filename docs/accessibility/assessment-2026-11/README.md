# Accessibility assessment, November 2026

An assessment of how to make OpenMarch more accessible and accommodating, and how to keep it
that way. Five reviewers each took one area and read the fork's `main` at `e1792b9b0`
(2026-11-16). Nobody ran the app, used a screen reader or tested with disabled users, so every
finding comes from the code. The earlier VPAT of upstream v0.1.7 was the starting list of
problems, re-checked against this code.

| Report                                                                 | Area                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| [01-current-state.md](01-current-state.md)                             | What the code does today, and the 23 VPAT findings re-checked |
| [02-vision.md](02-vision.md)                                           | Low vision, color blindness, contrast, light sensitivity      |
| [03-motor-input.md](03-motor-input.md)                                 | Keyboard only, switch and voice control, limited precision    |
| [04-nonvisual-hearing-cognitive.md](04-nonvisual-hearing-cognitive.md) | Screen readers, Deaf and hard of hearing, cognitive load      |
| [05-system.md](05-system.md)                                           | Architecture, automated checks, process and roadmap           |

[`scripts/`](scripts/) holds the color-blindness simulation used in the vision report
(Machado 2009 matrices, CIEDE2000 color distance). Run it with `python3 -I scripts/cvd.py`.

## Direction: settings and presets, not a separate mode

All five reviewers reached the same answer on their own: don't build a separate "accessible
editing mode". A second editor gets tested less and falls behind, and it would break the rule
that every feature is a command. Instead:

- Build the missing abilities into the normal app (typed positions, selecting a marcher by
  name, a text version of the field).
- Add one Accessibility settings section. Each setting follows the operating system's
  preference by default and can be overridden.
- Offer presets that only switch settings on, such as "Larger and clearer", "Keyboard only",
  "Screen reader" and "Calm". Each setting still works on its own. Touch mode already works
  this way (one store writing an attribute on `<html>`).
- Display preferences (color-blind palette, high contrast, dimmed field) apply per viewer and
  are never written into the show file.

## What's broken today

- **Color:**
  - The collision ring is the same red as a default marcher, so collisions don't stand out for anyone.
  - Red marchers and green next-paths look the same to red-green color-blind users.
  - All 8 timeline move colors fail for color-blind users, and color is the only link between
    a clip and its paths on the field.
- **Keyboard:**
  - One marcher can't be selected without a pointer.
  - Exact positions can't be typed: the Inspector X/Y fields are disabled.
  - Space on a focused button still plays the show.
  - Focus outlines are turned off app-wide.
- **Screen readers:** the field has no role, name, focus or text alternative.
- **Guardrails:** nothing accessibility-related can fail a build. The jsx-a11y rules only warn,
  and there are no axe checks.
- **VPAT findings (v0.1.7) on fork main:** 3 fixed, 9 partly fixed, 8 still present, 3 can't be
  judged from code.

## Roadmap

**Now** (small; each has an objective check, so agents can do them on their own):

1. Give collisions a dashed ring with a "!", and switch the timeline move colors to a
   color-blind-safe set (Okabe-Ito).
2. Stop Space from playing the show when a button has focus, and restore focus outlines.
3. Find marchers by name in the ⌘K palette (`T3`, `T1-T6`), make the X/Y fields editable, and
   let users type a page's counts.
4. Add a setting to turn off single-letter shortcuts (WCAG 2.1.4; voice dictation sets them off).
5. Add checks that can only get stricter: token contrast and color-blind distinctness tests,
   axe scans of key screens in `desktop-browser-e2e`, and a test that every registered action
   can be reached from the keyboard.

**Next:**

- An Accessibility settings section: interface size, text size, reduce motion, thicker focus ring.
- A per-viewer display layer for the field (`DisplayTheme`), then high-contrast themes.
- Accessible dot sheets: a tagged PDF plus HTML and CSV exports. A blind student reading their
  own dots is the most valuable first case.
- A visual metronome; the metronome is the only sound-only information in the app.

**Later:**

- A marcher table as a text version of the field, modelled on Logic's Event List.
- Commands that answer questions ("who is near T3?", "describe this page").
- Every command saying what it did, for screen readers and a history list.
- Full screen-reader authoring, built only with blind testers.

## Keeping it true

See [05-system.md](05-system.md) for the details. In short:

- An ADR for the preferences store and theme tokens (proposed as ADR 0016).
- Semantic theme tokens as the only color source, enforced by lint.
- Baselines that can only shrink for jsx-a11y and axe.
- A short accessibility section in `AGENTS.md` pointing to a convention doc with a definition of done.
- An accessibility line in the PR template, next to the `Tablet:` line, and an `a11y` label.
- A per-release VPAT refresh.
- Paid testers with disabilities.

## Open decisions for the owner

1. Accept "settings and presets, not a separate mode" and ADR 0016.
2. Accept the "baselines only go down" rule and its waiver process.
3. Whether to file the VPAT findings upstream.
4. The look of the contrast fixes and new palettes.
5. Public accessibility statement wording.
6. Tester budget and outreach.
7. How far to go on non-visual field access.
8. Whether exports follow the viewer's palette or the file's.

# 3D View MVP Validation Plan

- Status: active
- Owner: human (the project owner signs off)
- Scope: the MVP in [README.md](README.md)

## Purpose

These are the checks that decide whether the MVP is done. They don't change the
design or phase statuses. Evidence goes in the log below.

## Fixture

Two shows built with `~/om-capture/make-fixture` (or by hand): a football show
with at least 76 marchers and 6 pages, including one pathway, and an indoor
show on a 50 × 80 grid with a field background image.

## Checks

### V1: The window opens and follows

- **Steps:** open the football show, then Open 3D View; play, pause, scrub and
  select pages in the editor.
- **Confirm:** the window opens on the press box view. Performers move with the
  editor at the same counts, hold the selected page when paused, and show
  selection rings.

### V2: Every venue and camera

- **Steps:** switch through every kit, and select every camera in each.
- **Confirm:** every view is unobstructed and looks like the reference demo. Pick-a-seat
  works in every kit with stands.

### V3: Saved with the show

- **Steps:** change the venue, lighting and crowd; undo and redo in the editor;
  close and reopen the show; open an old show that has no venue.
- **Confirm:** the settings persist and undo correctly. The old show gets the
  default venue for its field.

### V4: Live edits

- **Steps:** with the window open, move marchers, change field properties and
  colors in the editor.
- **Confirm:** the window updates within a second, without errors or lasting
  flicker.

### V5: Offline

- **Steps:** use the window with networking blocked.
- **Confirm:** everything works, and the window makes no network requests.

### V6: Performance

- **Steps:** run the pro dome with crowd and 300 performers on the reference
  machines.
- **Confirm:** budgets in design.md §9 are met, or the gaps are recorded in
  findings.md.

## Validation log

Append-only. Entry template:

```markdown
### <date> · <owner> · V1

- Status: claimed | pass | fail | blocked
- Build/commit:
- Fixture:
- Steps:
- Expected:
- Actual:
- Evidence/check commands:
- Next/blocker:
```

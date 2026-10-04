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

### 2026-10-04 · lead · V1, V2 (partial)

- Status: pass (V1); pass with one issue (V2, partial)
- Build/commit: `3d-async` at `3e9ab13c`
- Fixture: the P5.1 300-marcher, 7-page football show
- Steps: one recorded scenario (`scratchpad/p52/v-mvp.mjs`) through the capture toolkit with SwiftShader. Claude Code stopped it partway because the box ran critically low on memory (other services; about 580 MB free), so it ended in the gym.
- Expected: V1 and V2 as written.
- Actual:
  - V1 pass. The window opens on the press box. Performers move during play, hold when paused and follow seek. Selection rings appear under all 300 performers after select-all.
  - V2 pass for hs (6 cameras), bighs and college (4 each), pro (7) and gym (GE judge, front row, corner).
  - Not reached: gym "On the floor" and "Top down", blank, the pro lighting cycle, and pick-a-seat. Those were covered earlier in the P3.1–P3.3 reviews.
  - **Issue:** in the pro dome's `lowerBowl`, `upperDeck` and `endZone` seats, the nearest crowd blocks fill the bottom fifth of the frame. The 4.9 m clear radius is too small for bowl rows. Fix: a larger clear radius for seat cameras, or the press-box aim lift applied to every `seat` camera.
- Evidence/check commands: `~/om-capture/runs/20261004-130737-p52-validation/` (28 PNGs, `contact.png`).
- Next/blocker:
  - V3 (persistence and undo) and V5 (offline) are covered by `e2e/tests/view3d.spec.mts`, which passed in the lead's run on 2026-10-04.
  - V4 (live edits) still needs a run.
  - V6 needs the owner's hardware: this box has no GPU, so frame rates here aren't representative.
  - Re-running the full scenario waits for the owner, because of the memory pressure.

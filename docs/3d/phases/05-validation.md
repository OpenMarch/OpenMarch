---
phase: 5
title: MVP validation
status: in-progress
owner: 3d-worker (3d/p5-perf)
branch: none
pr: none
depends_on: [3, 4]
updated: 2026-10-04
---

# Phase 5: MVP validation

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Measure against the budgets, run the validation plan, and get the owner's verdict.

## Read first

- [../validation-plan.md](../validation-plan.md), [../findings.md](../findings.md), [../design.md](../design.md) §9

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P5.1: Performance pass

- Owner: 3d-worker (3d/p5-perf)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/72
- Parallel: yes
- Depends on: P4.2

Measure frame time, draw calls and build time per kit with 300 performers; add the `low` quality tier and the automatic fallback (design §9); record results in `findings.md`.

### P5.2: Validation run

- Owner: lead
- Status: open
- PR: none
- Parallel: no
- Depends on: P4.3, P5.1

Run V1–V6 from the validation plan, record evidence in its log, and send the recordings to the project owner.

### P5.3: Owner verdict

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: P5.2

The project owner accepts the MVP or lists what must change.

## Exit gate

- [ ] Budgets met or exceptions recorded in `findings.md`.
- [ ] V1–V6 pass.
- [ ] The project owner accepts the MVP.

## Handoff notes

Nothing yet.

## Progress log

### 2026-10-04 · 3d-worker (3d/p5-perf) · P5.1

- **Done:** first step pushed to `3d/p5-perf` (`9abb259f`): `positionAtInto` (out-parameter, allocation-free for straight moves) in `src/view3d/positions.ts`, used by `performers/performerData.ts`; `src/view3d/window/qualityFallback.ts` (pure, 3 s below 30 fps switches to `low` once and logs) wired into `Scene.tsx`.
- **Checks:** `vitest run src/view3d/window/__test__/qualityFallback.test.ts src/view3d/__test__/positions.test.tsx src/view3d/window/performers` (3 files, 28 passed).
- **Next:** measure every kit with a 300-marcher fixture in the real app (draw calls, triangles, build times, frame time), then cheap wins.
- **Blockers:** none.
- **Resume from:** branch `3d/p5-perf`; 300-marcher fixture generator in `scratchpad/p51/gen300.py`; build the app and run a measurement scenario based on `scratchpad/p42-capture/p42-performers.mjs`.

### 2026-10-04 · 3d-worker (3d/p5-perf) · P5.1

- **Done:** opened [#72](https://github.com/AlexDumo/OpenMarch-timeline/pull/72), one commit on `3d/p5-perf`.
  - `positionAtInto` (allocation-free, exactly equal to `positionAt`) is used by the performers.
  - `window/qualityFallback.ts` switches to `low` once after 3 s below 30 fps and logs it with `console.info`. It never switches back.
  - The ring buffer upload is skipped while nothing is selected.
  - The P5.1 measurements are in `findings.md`. Draw calls are at most 32 per kit. Kit build is at most 48 ms; pro with crowd and field is about 150 ms on its first build. CPU per frame while playing 300 performers is under 2 ms. fps on SwiftShader (1–11) is not representative.
  - The `low` tier was already complete in kits, crowd, rig and performers.
- **Checks:**
  - Desktop `tsc --noEmit`: pass.
  - `vitest run src/view3d`: 19 files, 321 passed.
  - `eslint src/view3d`: 0 errors.
  - `format:check`: pass.
  - cspell on the changed files: 0 issues.
  - e2e `view3d.spec.mts`: 1 passed, with the fallback active on SwiftShader.
  - Real-app captures of every kit (high), hs, bighs and pro (low), and a fallback and selection run: the paths are in the PR.
  - Not run: `test:history`, the full e2e suite, root `lint:check`.
- **Next:** lead review. V6 still needs a real integrated GPU to check 60 fps for `pro`. The PR recommends capping `dpr` at 1 in `low`, which needs a design §9 decision.
- **Blockers:** none.
- **Resume from:** address review comments on #72 (branch `3d/p5-perf`). The measurement scenario `scratchpad/p51/capture/p51-perf.mjs` needs the temporary `__view3dDebug` hook described in the PR.

### 2026-10-04 · lead · P5.1 (review)

- **Done:** squash-merged PR #72.
  - `positionAtInto` makes straight moves allocation-free and gives exactly the same results as `positionAt`.
  - The quality fallback switches to `low` after 3 s below 30 fps, once, and logs it.
  - Selection rings no longer re-upload every frame.
  - Findings are recorded: at most 32 draw calls, pro builds in about 150 ms with crowd and field, under 0.5 ms of `useFrame` per frame and about 1.4 ms of render CPU, with 300 performers.
  - Lead decision: `low` also renders at 1× pixel density (design §9 updated). The change is in `Scene.tsx`.
- **Checks:** on merged `3d-async`, desktop `tsc --noEmit` passed and `vitest run src/view3d` passed (19 files, 321 tests).
- **Next:** P5.2 validation run (lead). 60 fps on an integrated GPU (V6) needs the owner's hardware; this box has no GPU.
- **Blockers:** none.

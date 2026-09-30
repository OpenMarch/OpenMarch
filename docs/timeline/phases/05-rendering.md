---
phase: 5
title: Resolver host, time mapping, rendering
status: not-started
owner: unassigned
branch: none
pr: none
depends_on: [4]
updated: 2026-09-29
---

# Phase 5: Resolver host, time mapping, rendering

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Behind a per-file dev flag, drive the canvas (playback and static) from the resolver instead of `marcher_pages`, fed by Phase 4's batches, and measure the QA-PF budgets.

## Read first

- Spec §7, §9.4 (idle warming), §9.5, §12.8, §12.9
- `apps/desktop/src/hooks/useAnimation.ts`, `apps/desktop/src/utilities/Keyframes.ts`, `apps/desktop/src/components/canvas/Canvas.tsx`, `OpenMarchCanvas.ts` (`renderMarchers`)
- `timing_objects` view, `apps/desktop/src/hooks/useTimingObjects.ts`, `apps/desktop/src/settings/workspaceSettings.ts`
- `docs/conventions/multi-query-hooks.md`, `docs/conventions/testing.md`

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P5.1: Dev flag

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

Per-file dev flag in `workspace_settings` (optional zod field, default off), hidden from normal users.

### P5.2: Time and beat mapping

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

`beatAtTime(seconds)` and `timeAtBeat(beat)` by binary search over `timing_objects` timestamps (Q-9), with unit tests at beat boundaries and uneven tempo.

### P5.3: Resolver store and hooks

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

`apps/desktop/src/timeline/`: a resolver store per open file. It cold-builds from the tables on open and applies batches from the P4.3 listener. Hooks: `usePositionAt`, `useExplain`, `useDiagnostics`.

### P5.4: Playback

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P5.2, P5.3

Playback: in timeline mode, `useAnimation` converts the playback time to a beat and fills a reused `Float64Array` with `positionsAt` each frame.

### P5.5: Static render

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P5.3

Static render: in timeline mode, draw positions at the selected page's end beat instead of `marcher_pages`.

### P5.6: Idle warming

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P5.4

Idle warming outward from the playback position.

### P5.7: Fixture loader

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P5.3

Dev fixture loader that builds G1 to G13 and the QA-SC scenarios into a show.

### P5.8: Tests and performance numbers

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P5.5, P5.7

Tests: store and hook tests on a real DB; a QA-SC-11 scale fixture with QA-PF-01 to -04 recorded in `findings.md`; one Playwright spec checking rendered positions at several beats.

### P5.9: Frame clock from 0.2

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

Bring 0.2's frame-clock store (`origin/0.2:apps/desktop/src/services/clock/frame-clock.ts` and the commits that introduced it) onto `timeline-try-2`. It already tracks `currentBeatIndex`, so it can serve P5.2 and P5.4, and the 0.2 timeline (P8.1) depends on it. Check what else those commits changed before porting; take only what the clock needs.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] P5.8 tests pass, and QA-PF numbers are in `findings.md`
- [ ] `pnpm --dir apps/desktop run build:electron` and the new e2e spec pass
- [ ] With the flag off, behavior is unchanged (existing suites pass)

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- Missing a QA-PF budget is a finding, not a blocker. Move the resolver to a worker only if the budgets are badly missed.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

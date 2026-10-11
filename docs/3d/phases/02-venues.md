---
phase: 2
title: Field surface, environment and venue kits
status: in-progress
owner: p2-2-worker
branch: none
pr: none
depends_on: [0]
updated: 2026-10-04
---

# Phase 2: Field surface, environment and venue kits

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Framework-free builders for the field surface, the shared environment and every MVP kit, ported from the approved reference demo into meters and the module layout.

## Read first

- [../design.md](../design.md) §1, §4–6 and §9
- [../ref/README.md](../ref/README.md) and [../ref/venue-demo.html](../ref/venue-demo.html): open it in a browser and try every kit and camera
- `apps/desktop/src/view3d/core/types.ts`

Everything in this phase lives under `src/view3d/core/` and must not import React, React Three Fiber, drei, Electron or the database. Tests run the builders in Vitest and check structure (bounds, counts, camera seats inside the venue, no NaN positions), not pixels. Attach screenshots to the PR: render the builder in a scratch page or wait for P3.1 and use the window.

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P2.1: Field surface

- Owner: 3d-worker (3d/p2-field)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/64
- Parallel: yes
- Depends on: P1.1, P1.2

`src/view3d/core/field/`: `buildFieldSurface` with the `turf`, `theme` and `tarp` styles (design §4), painting from `FieldProperties` and `FieldTheme` with the same semantics as `OpenMarchCanvas.createFieldGrid`. Tests cover a football template, an indoor grid and a field image.

### P2.2: Shared environment and crowd

- Owner: p2-2-worker (3d/p2-environment)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/58
- Parallel: yes
- Depends on: —

`src/view3d/core/environment/`: sky dome, the lighting rig with every preset's values (from the demo's `SKY` table, plus the gym and roof presets), `lightPole`, `videoBoard`, shared materials, and `buildCrowd` with `clearAround` (design §5). Land this early: P2.3 to P2.5 use it.

### P2.3: Stand kits: hs, bighs, college and blank

- Owner: p2-3-worker (3d/p2-stand-kits)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/60
- Parallel: yes
- Depends on: P2.2

`src/view3d/core/kits/stands.ts` (rectangular stand builder with press box, stories and seat rows), `hs.ts`, `bighs.ts`, `college.ts` and `blank.ts` (design §6). Port proportions and cameras from the demo.

### P2.4: Pro dome kit

- Owner: p2-4-worker (3d/p2-pro-dome)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/63
- Parallel: yes
- Depends on: P2.2

`src/view3d/core/kits/bowl.ts` (rounded-rectangle outline, ring bands, seat rows along the outline) and `pro.ts`: two tiers, suite ring, LED fascia, clerestory, sliding roof with its animation in `onFrame`, roof-edge lights and end-zone boards (design §6).

### P2.5: Indoor gym kit

- Owner: p2-5-worker (3d/p2-gym)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/59
- Parallel: yes
- Depends on: P2.2

`src/view3d/core/kits/gym.ts`: the room sized to the footprint, maple floor with court lines and safety tape, bleachers, folded bleachers, banners, ceiling panels hidden from above, and house and show lighting (design §6). The tarp itself comes from P2.1's `tarp` style; the kit leaves room for it.

## Exit gate

- [ ] Every kit builds for a football field and, where it applies, an indoor grid, with tests passing.
- [ ] No kit exceeds 300 draw calls (count meshes and instanced meshes in a test).
- [ ] Screenshots of every kit from every named camera are attached to the PRs.
- [ ] Type-check, lint, format and spellcheck pass on `3d-async`.

## Handoff notes

Nothing yet.

## Progress log

### 2026-10-04 · p2-2-worker · P2.2

- **Done:** shared environment and crowd under `apps/desktop/src/view3d/core/environment/` (PR https://github.com/AlexDumo/OpenMarch-timeline/pull/58). API summary is the module comment in `environment/index.ts`. `lightPole` and `videoBoard` take a `SharedMaterials` last argument. Kits drive their own lights from `lightingValues(preset).kit`. Tests call `setTexturePainting(false)` because jsdom has no 2D canvas.
- **Checks:** vitest `src/view3d` 21 passed; `tsc --noEmit` clean; prettier check clean; eslint 0 errors (1 max-lines warning); cspell 0 issues. Not run: `check:agent-guidance`, test:history, e2e.
- **Next:** lead review; P2.3 to P2.5 can start from the PR branch `3d/p2-environment`.
- **Blockers:** none.
- **Resume from:** nothing pending; address review comments on the PR.

### 2026-10-04 · lead · P2.2 (review)

- **Done:** reviewed and squash-merged PR #58 (`57a4824f`). The API summary is the module comment in `src/view3d/core/environment/index.ts`; kit builders read it first. Accepted the deviations: `lightPole` and `videoBoard` take `SharedMaterials` last, the rig's light is `hemisphere`, the pro fascia passes `params.endZoneText || "OPENMARCH"` to `ribbonTexture`, and the camera far plane must exceed `SKY_RADIUS` (1524 m).
- **Checks:** on the PR branch, `vitest run src/view3d` (21 passed), desktop `tsc --noEmit` passed, `eslint src/view3d` 0 errors and 1 warning (`buildCrowd` length).
- **Next:** P2.3, P2.4 and P2.5 are unblocked.
- **Blockers:** none.

### 2026-10-04 · p2-5-worker · P2.5

- **Done:** indoor gym kit in `apps/desktop/src/view3d/core/kits/gym.ts` (+ `kits/gym/textures.ts`, tests in `kits/__test__/gym.test.ts`), PR https://github.com/AlexDumo/OpenMarch-timeline/pull/59. The room's front extends past 9 m so the front wall clears the bleachers; the floor is at y = 0 under P2.1's tarp at y = 0.02. Screenshots from every camera in house and show lighting (indoor and football footprints) are in `/tmp/claude-1000/-home-alex-GitHub-OpenMarch-main-feature/1be98704-8f34-44f4-bf9a-c0cb4bb2fc1d/scratchpad/gym/out/`.
- **Checks:** vitest `src/view3d` 65 passed; `tsc --noEmit` clean; eslint 0 errors (1 max-lines warning); prettier and cspell clean. Not run: test:history, e2e, check:agent-guidance.
- **Next:** lead review. The gym's bleacher code duplicates the stand's instanced rows; the lead may consolidate with P2.3's `stands.ts`.
- **Blockers:** none.
- **Resume from:** nothing pending; address review comments on the PR.

### 2026-10-04 · lead · P2.5 (review)

- **Done:** reviewed and squash-merged PR #59. Checked the headless screenshots (judge, front row, corner in show lights, floor, top-down, football footprint) against the reference gym: they match. Accepted the deeper front margin (about 12.4 m) so the wall clears the bleachers. The bleacher code duplicates P2.3's stand rows; consolidate after P2.3 merges if it's cheap.
- **Checks:** on the PR branch, `vitest run src/view3d` passed and desktop `tsc --noEmit` passed.
- **Next:** P3.1 must clear the crowd within 4.9 m of the camera (ui.md UI-3); the judge view needs it.
- **Blockers:** none.

### 2026-10-04 · p2-3-worker · P2.3

- **Done:** stand kits `hs`, `bighs`, `college`, `blank` and `stands.ts` under `apps/desktop/src/view3d/core/kits/` (PR https://github.com/AlexDumo/OpenMarch-timeline/pull/60). Shared builder `buildStandsKit` in `stands.ts`; no `kits/index.ts`. Screenshots of every kit from every camera (placeholder field plane, P2.1 not merged): `/tmp/claude-1000/p23-shots/out/<kit>-<camera>.png`.
- **Checks:** vitest `src/view3d` 91 passed (44 new); `tsc --noEmit` clean; prettier check clean; cspell 0 issues; eslint 0 errors, 3 max-lines warnings. Draw calls hs 22, bighs 34, college 26, blank 1. Not run: test:history, e2e, check:agent-guidance.
- **Next:** lead review.
- **Blockers:** none.
- **Cross-phase note for P3.1, P3.2, P2.4 and P2.5:** `KitResult` has no crowd field, so each kit that builds a crowd sets `kit.root.userData.crowd` to the `buildCrowd` handle (`clearAround(point, radius)`, `reset()`); the scene calls it when a seat camera is active. Kits also set `castShadow = false` on everything at `quality: "low"`.
- **Resume from:** nothing pending; address review comments on PR 60.

### 2026-10-04 · p2-4-worker · P2.4

- **Done:** first pass of `apps/desktop/src/view3d/core/kits/bowl.ts` (outline, ring bands, tiers, seat rows) and `pro.ts` (`buildProKit`), with tests in `kits/__test__/`. Pushed to `3d/p2-pro-dome` (`be560b7a`).
- **Checks:** `vitest run src/view3d` 61 passed; desktop `tsc --noEmit` clean; `eslint src/view3d/core/kits` clean; cspell clean via the pre-commit hook.
- **Next:** render screenshots from every camera and lighting preset, compare with the demo, then open the PR.
- **Blockers:** none.
- **Resume from:** branch `3d/p2-pro-dome`; build the scratch capture page for `buildProKit` (see the PR body recipe) and take screenshots.

### 2026-10-04 · p2-4-worker · P2.4

- **Done:** `apps/desktop/src/view3d/core/kits/bowl.ts` and `pro.ts` (`buildProKit`) with tests, PR https://github.com/AlexDumo/OpenMarch-timeline/pull/63. Has every camera from design §6, presets day, night and roofClosed (default roofClosed, starts closed), and the roof animation and hide-from-above in `onFrame`. Deviations for review: end-zone boards moved inward so they clear the upper-deck crowd, a suite ledge under the `pressBox` camera, and the fascia texture mirrored so the text reads from inside the bowl.
- **Checks:** from `apps/desktop`: `vitest run src/view3d` 79 passed; `tsc --noEmit` pass; `eslint src/view3d` 0 errors (warnings only in `crowd.ts` and `gym.ts`); `prettier --check src/view3d` pass; `cspell "src/view3d/**"` 0 issues. Screenshots of every camera and preset (24 PNGs) are in `/home/alex/om-capture/runs/20261004-p24-pro-dome/out/`, with the capture scripts one level up. Not run: test:history, e2e, `check:full`.
- **Next:** lead review.
- **Blockers:** none.
- **Resume from:** address review comments on PR #63 (branch `3d/p2-pro-dome`).

### 2026-10-04 · lead · P2.3, P2.4 (review)

- **Done:** reviewed and squash-merged PR #60 (P2.3, `3c87145b`; the squash kept a `wip:` title, so fix it when preparing the upstream PR) and PR #63 (P2.4, `a2e048b0`).
  - I checked the P2.3 renders (hs press box and front row, bighs press box and blimp, college press box and end zone) against the reference; they match.
  - Accepted P2.4's changes from the demo: boards moved in to clear the upper-deck crowd, a suite ledge under the press-box camera, and the mirrored fascia text.
  - **Contract change (lead, `ca18bec7`):** kits never build the crowd. They return `seatRows` and an optional `crowdDensity` (new in `types.ts`), and the scene calls `buildCrowd` once. I removed the crowd from `stands.ts`, set densities on every kit (hs 0.5, bighs 0.56, college 0.65, pro 0.72, gym 0.75), and noted the rule in design.md §6.
  - Reduced motion for the pro roof: P3.1 snaps it by passing a large `dt`.
- **Checks:** after the contract change, desktop `tsc --noEmit` passed; `vitest run src/view3d`: 8 files, 165 tests passed; `eslint src/view3d`: 0 errors.
- **Next:** P2.1 (field surface) is unblocked; then P3.1.
- **Blockers:** none.

### 2026-10-04 · lead · P2.1 (review)

- **Done:** reviewed and squash-merged PR #64 (field surface: `buildFieldSurface`, `planField`, `paintPlan`; turf, theme and tarp).
  - Renders checked against the reference: HS press box (stripes, hashes, arrowed numbers, end zones), HS top-down (front at the bottom, side 1 on the left), pro press box, gym with the show image and with the generated tarp, and blank.
  - Accepted: the tarp always uses the show image when there is one (ignoring `showFieldImage`, drawn opaque), and no midfield logo.
  - The worker's session refused `coord.sh` edits, so this entry records its owner, PR and status.
- **Checks:** on merged `3d-async`, desktop `tsc --noEmit` passed; `vitest run src/view3d` passed.
- **Next:** P3.1 passes `renderer.capabilities.maxTextureSize` and `getMaxAnisotropy()`, picks the style per kit (turf for hs, bighs, college and pro; tarp for gym; theme for blank), and passes the show's field image. P3.1 is waiting on P1.4.
- **Blockers:** none.

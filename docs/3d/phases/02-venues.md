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

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P1.1, P1.2

`src/view3d/core/field/`: `buildFieldSurface` with the `turf`, `theme` and `tarp` styles (design §4), painting from `FieldProperties` and `FieldTheme` with the same semantics as `OpenMarchCanvas.createFieldGrid`. Tests cover a football template, an indoor grid and a field image.

### P2.2: Shared environment and crowd

- Owner: p2-2-worker (3d/p2-environment)
- Status: in-review
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/58
- Parallel: yes
- Depends on: —

`src/view3d/core/environment/`: sky dome, the lighting rig with every preset's values (from the demo's `SKY` table, plus the gym and roof presets), `lightPole`, `videoBoard`, shared materials, and `buildCrowd` with `clearAround` (design §5). Land this early: P2.3 to P2.5 use it.

### P2.3: Stand kits: hs, bighs, college and blank

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P2.2

`src/view3d/core/kits/stands.ts` (rectangular stand builder with press box, stories and seat rows), `hs.ts`, `bighs.ts`, `college.ts` and `blank.ts` (design §6). Port proportions and cameras from the demo.

### P2.4: Pro dome kit

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P2.2

`src/view3d/core/kits/bowl.ts` (rounded-rectangle outline, ring bands, seat rows along the outline) and `pro.ts`: two tiers, suite ring, LED fascia, clerestory, sliding roof with its animation in `onFrame`, roof-edge lights and end-zone boards (design §6).

### P2.5: Indoor gym kit

- Owner: none
- Status: open
- PR: none
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

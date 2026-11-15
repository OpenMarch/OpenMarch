---
phase: C4
title: Customization, items, silks and props in the 3D View
status: not-started
owner: none
branch: none
pr: none
depends_on: [C2, C3]
updated: 2026-10-11
---

# C4: Customization, items, silks and props in the 3D View

<!-- cspell:words ompose ultralite Headwear -->

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

> Draft for the owner's approval (2026-10-11). One integrated-GPU run (C4.7) serves this effort and ADR 0004 section 8.5. ADR 0004 step 6 waits to merge until the per-look texture (C4.3) and the silk wave (C4.4) are built on it and measured together. C4.7 is the gate for step 6's merge (C4.8) and for C5.
>
> Changed by the owner 2026-10-16: step 6 (#120) merged ahead of C4.7, since it already measured faster than main on the M1 Pro and kept conflicting with main while held. C4.7 now gates C4.3, C4.4 and C5; if it shows step 6 too slow on integrated GPUs, step 6 is tuned or reverted then.

## Goal

The 3D View draws what C2 and C3 store: props on and under performers, held and placed items, Library models, and silks with the new wave. It lands the per-look uniform texture that C5 needs, then measures it all on integrated GPUs.

## Read first

- [../props-spec.md](../props-spec.md): the design spec, sections on silks, uniforms, budgets, geometry and platforms. Ticket numbers on each package are the ones it cites.
- [ADR 0010](../../adr/0010-3d-view.md) D-15, D-17, D-18, D-19 and D-20 (amendment of 2026-10-11); [../design.md](../design.md) section 9 (budgets)
- `docs/3d/performer-behavior.md` section 8 (cue branches): window positions, layered animation, prop bones, om-pose
- Findings: `research/silk-motion`, `task/gpu-benchmark` (harness in `apps/desktop/view3d-web/bench/`), `research/ompose-uniform-limits`; the silk prototype on `prototype/silk-look` (`a7c7974f`)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### C4.1: ADR 0004 step 4 merged (window positions and sync)

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker. The lead marks it done when the window's timeline-mode positions and the `["timeline"]` invalidation key are in `main`.

**Tickets:** 24.

**Done when:** the 3D window follows a converted show's timeline edits.

**Checks:** the lead records the merge in the progress log.

### C4.2: ADR 0004 step 6 built (renderer in the repo, layering, prop bones)

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker for the in-repo renderer with per-channel bakes, the compose pass and prop bones, built on its branch and held back from merging until the combined run (C4.7).

**Tickets:** 07, 26.23.

**Done when:** step 6's branch is complete and its PR is open against `main`, waiting on C4.7.

**Checks:** the lead records the merge in the progress log.

### C4.3: Per-look uniform texture

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.1, C4.2, C4.10

**Goal:** color and artwork uniforms cost no extra draws or bake rows.

**Scope:** palette, pattern and part visibility in a per-look `DataTexture` indexed by a per-instance `aLook`; parts hidden per instance instead of per-look index filtering; Band default and Guard default (C4.10) as the first two looks. Built in the repo's own renderer from ADR 0004 step 6, not upstream in om-pose: branch off step 6's branch, and merge after it (C4.8).

**Tickets:** 04, 09, 18, 26.3, 26.23.

**Done when:** 16 uniform looks draw with the same call count as one, and the cost of skinning hidden-part triangles is measured on the M1 Pro and recorded in `docs/3d/findings.md`.

**Checks:** pixel parity against today's looks; the benchmark harness; focused `src/view3d` tests; type-check, lint, format, spellcheck.

### C4.4: Silk mesh and wave

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.1, C4.2, C4.11

**Goal:** silks that read as fabric and seek exactly.

**Scope:** branch off ADR 0004 step 6's branch, and merge after it (C4.8). Silks leave the instruments' metal material for their own instanced mesh with a cloth material (metalness 0, double-sided) and UVs; the stateless vertex wave driven by the show clock, a phase seed, ground speed and turn rate, with analytic normals, inserted before skinning; the prototype's motion variant B, hang and billow (the silk hangs at rest and billows when the performer moves; `prototype/silk-look`, `?variant=B`); the fixed defaults (amplitude 0.055 m, wavelength 0.9 m, wave speed 0.2 m/s, speed coupling 0.25, turn coupling 0.05, droop 0.5, sheen 0, full mirrored back print); grids 24 × 16 at `high` and 12 × 8 at `low`; no shadows; swing silks at 44 × 66 in (from C4.11). The default silk only (a built-in plain silk in the section's 2D color); Artwork and swaps come in C5.4.

**Tickets:** 02, 03, 10, 15, 18, 26.11, 26.23.

**Done when:** 40 silks add at most one draw per tier, and scrubbing back and forth gives identical frames.

**Checks:** determinism test (same count, same vertices); the benchmark harness; screenshots beside the prototype; type-check, lint, format, spellcheck.

### C4.5: Props, platforms and obstacles in 3D

- Owner: Trevor (3d/c4-props)
- Status: in-review
- PR: AlexDumo/OpenMarch-timeline#755 (branch `3d/c4-props`, opened 2026-11-07)
- Parallel: yes
- Depends on: C4.1, C2.1, C2.3, C2.6

**Goal:** props stand in the venue at their real size, and performers stand on platforms.

**Scope:** Outline boxes (or a prop's Library model) from the geometry table at each count; floor = flat, platform = stood on, obstacle = not stood on; a performer at the height of the tallest platform under their dot, stepping over about half a count at an edge; stacking makes steps; props and placed items on the tallest platform under their footprint center; Floor props stay on the Base floor. Notes for steps over 16 in, performers inside obstacles, and dots leaving a moving platform wait for show checks to return (parked 2026-11-03; kept on branch `3d/c4-props-notes`).

**Tickets:** 05, 21, 24, 25.

**Done when:** a performer crossing onto a 24 in platform steps up in about half a count (the note naming the count comes back with show checks).

**Checks:** unit tests for the height rule; screenshots; focused `src/view3d` tests; type-check, lint, format, spellcheck.

### C4.6: Held items, placed items and Library models

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C4.8, C3.5, C2.3, C1.11

**Goal:** what the Carry channel and Placement say is what the 3D View draws.

**Scope:** Carry from compiled segments instead of `carryForSection` directly; held items as prop bones (hand × `OM_grip_*` offset); placed items at their position; during a hand conflict the newest is drawn and the displaced item isn't; normalized Library GLBs loaded with bare `GLTFLoader` from embedded blobs, read lazily; no CSP change.

**Tickets:** 01, 07, 21.

**Done when:** a rifle line switched to sabres by one Carry cue draws sabres from that count, and a prop handed between performers stays in the right hands.

**Checks:** unit tests; screenshots; a check that the window makes no network requests and logs no CSP violations; type-check, lint, format, spellcheck.

### C4.7: Integrated-GPU run

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: C4.2, C4.3, C4.4, C4.9

**Goal:** the one integrated-GPU run that C4.3, C4.4 and C5 wait on (step 6 merged ahead of it, 2026-10-16).

**Scope:** with the `task/gpu-benchmark` harness, on an Intel Iris Xe (Windows) and a base M1, with step 6, C4.3 and C4.4 together: `hs` and `pro`; press box and a field-level camera; 24 Silk layers, Garments (the test Garment from C4.9; Garment import and rendering ship in C5, after this run) and the hidden-part skinning cost from C4.3; and ADR 0004 section 8.5's items (60 fps at 1080p with 300 performers in `pro`, the compose pass's own GPU time).

**Tickets:** 15, 18, 26.23.

**Done when:** the numbers are in `docs/3d/findings.md`; the owner confirms or changes ADR 0010 D-19's thresholds, the texture sizes and whether BC7 KTX2 is needed; and section 8.5's integrated-GPU line is answered, confirming step 6 (merged 2026-10-16) or calling for tuning.

**Checks:** the harness's JSON output committed beside the findings.

### C4.9: Test Garment for the GPU run

- Owner: Trevor (3d/c4-test-garment)
- Status: in-progress
- PR: none (`3d/c4-test-garment` is not pushed yet)
- Parallel: yes
- Depends on: C4.2

**Goal:** a Garment the integrated-GPU run (C4.7) can measure before C5 builds Garments for real.

**Scope:** measurement only, not a shipped path. A Garment fixture on the exact v4 rig with `_PART` paint and fits for every body type (C1.7's Garment fixture if it exists, else one made for the run), skinned from the shared bake through step 6's renderer, one draw per fitted body type × primitives, no shadows; drawn on a configurable number of performers in the `task/gpu-benchmark` harness. Built on step 6's branch like C4.3 and C4.4, or in the harness only; nothing in the editor or the import pipeline.

**Tickets:** 01, 04, 09, 18, 26.23.

**Done when:** the harness can turn the test Garment on for a set number of performers and report its draws and frame time.

**Checks:** the harness runs on the M1 Pro; focused `src/view3d` tests if renderer code changes; type-check, lint, format, spellcheck.

### C4.8: ADR 0004 step 6 merged

- Owner: human
- Status: done 2026-10-16 (#120, merged ahead of C4.7 by the owner's decision)
- PR: #120
- Parallel: no
- Depends on: C4.2

**Goal:** a tracker. Step 6 merged into `main` before C4.7 (owner, 2026-10-16). C4.3 and C4.4 branch off `main` and merge once C4.7 clears them.

**Tickets:** 07, 26.23.

**Done when:** prop bones, the per-look texture and the silk wave are in `main`.

**Checks:** the lead records the merges in the progress log.

### C4.10: Band and Guard default uniforms

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P4.2

**Goal:** uniforms stop following the 2D fill color. Folded in from the early Phase 6 draft (its P6.1); like C4.11 it rests only on closed tickets and keeps the map's early exception (owner, 2026-10-11), so it doesn't wait for C1.1.

**Scope:** `src/view3d/core/marchers/looks.ts` and `window/performers/Performers.tsx`. `sectionUniform` loses its `fill` parameter, and every section wears one of two built-in looks, chosen by `isGuard`: **Band default**, today's default look (navy `#2d4f9e`, `DEFAULT_PRIMARY`, jacket and shako, white and gold trim, navy pants), and **Guard default**, all black and plain (black top and bottoms with no pattern, trim or seam stripe, black shoes, no headwear, no gloves, bare hands, no cape). Nothing is stored in the show; changing a section's 2D fill changes nothing in 3D. Update the `looks.test.ts` cases that key uniforms by fill (looks now group by band vs guard). Add one line to ADR 0010 D-7: "Amended 2026-10-11 (owner): uniforms no longer take the 2D fill color; sections wear a built-in Band or Guard default until uniforms can be assigned."

**Tickets:** 09.

**Done when:** band and guard sections render in their defaults, and changing a 2D fill changes nothing in 3D.

**Checks:** focused `src/view3d` tests; screenshots of a band section and a guard section; type-check, lint, format, spellcheck.

### C4.11: Real-size swing flags

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** the swing silk at real size. Folded in from the early Phase 6 draft (its P6.2); keeps the map's early exception, so it doesn't wait for C1.1.

**Scope:** `src/view3d/core/instruments/guard.ts`: the swing silk is about half real size (1.2 × 0.9 m). Make it the vendor default swing cut, 44 × 66 in (1.118 m along the pole × 1.676 m fly), and give the swing pole a length that carries that header. The sourced ultralite pole lengths are 24, 30, 36, 42, 48 and 52 in (default 36), and the sourced curved swing has a sleeve of about 40 to 44 in, so a 36 in pole looks short for a 44 in header; pick from the findings (`research/size-standards` branch, `research/size-standards.md`) and say which in the PR. The double swing follows, since it reuses the swing flag; check that the left-hand flag (`LEFT_FLAG`) still clears the body. The 6 ft flag (36 × 54 in on 1.83 m), the 36 in rifle and the 0.8 m sabre (32 in) are already right. Update the swing flag's numbers in `docs/3d/instruments.md`.

**Tickets:** 03, 10.

**Done when:** swing and double swing flags match the 44 × 66 in cut, with no clipping in the flag holds.

**Checks:** focused `src/view3d` tests; screenshots of a single and a double swing flag next to a 6 ft flag; type-check, lint, format, spellcheck.

## Exit gate

- [ ] Props, platforms, held and placed items and the new silks render in a converted show.
- [ ] Band and Guard defaults (C4.10) and real-size swing flags (C4.11) recorded with screenshots.
- [ ] C4.7 recorded, the owner's verdict on D-19 logged, and step 6 merged (C4.8) with C4.3 and C4.4 after it.
- [ ] Type-check, lint, format and spellcheck pass on `main`.

## Handoff notes

Nothing yet.

## Progress log

- 2026-10-12, Cross-phase note from C1.12 (branch `3d/c1-artwork-templates`):
  the silk Cut outlines now live in `view3d/core/sizes/silkCuts.ts` (lines
  and cubic Bezier curves in inches at the catalog size, `silkCutPath` for meters
  at any header × fly, `sampleCutPath` for a polygon), and catalog silks gain
  a `depth` (overall height; omitted, it equals the header) and a per-silk
  `sag` (default 0). The oversized swing is now header 42 × fly 56, depth 84;
  the super swing 44 × 68, depth 84; the regular arc 45 × 78⅝, depth 96. C1.12
  did not change the silk renderer's mesh. C4.4 (silk mesh) must build its
  mesh from these outlines and the depth field, not a header × fly
  rectangle, so the 3D silk clips where the Artwork template's mask does.
  C4.11's 44 × 66 in swing size is unchanged; its outline is the flat-bottom
  swing (owner Q41), with a sagging-bottom alternative kept in the data.
- 2026-10-17, C4.9 measured, not done (branch `3d/c4-test-garment`, on
  Trevor's machine only): the test Garment was built and measured on
  2026-10-13 in the `task/gpu-benchmark` harness with `3d/c4-silk` (step 6)
  merged in, in commits `4e908a766` (harness: `view3d-web/bench/garment.ts`,
  `garmentMesh.ts` and their test) and `849294254` (results). Those commits,
  the `task/gpu-benchmark` harness (`view3d-web/bench/`) and
  `research/gpu-benchmark.md` are on Trevor's local branch, not on any
  remote, so the hashes don't resolve yet. Nothing in `src/` changes. The
  Garment is made in the browser from each body type's jacket, sleeves and
  pants (`_PART` 1–3), subdivided to 3,152 triangles a fit and skinned
  through step 6's composer, one `InstancedMesh` a fitted body type, no
  shadows. Run it with `garment=N|all` (N wearers), `performers=N` (cut the
  show) and `garmentSubdiv=0` (788 triangles a fit); the `run-bench.mjs`
  commands are in that branch's `research/gpu-benchmark.md`, "C4.9: the test
  Garment". Headline on the M1 Pro (385 marchers, `hs`, 1080p, 1×): +7 draws
  in every case (baseline 131); frame time 4.99 ms off, +0.29 ms for 40
  wearers, +0.94 for 150, +2.07 for 300, +2.63 for all; +3.73 ms for all at
  2×. The full reading is in that branch's `docs/3d/findings.md`,
  "2026-10-13 · trevor (3d/c4-test-garment) · C4.9, test Garment in the GPU
  harness". These numbers were taken on the pre-merge step 6.
  - **Next:** push `3d/c4-test-garment` and `task/gpu-benchmark` to the
    fork; port the harness (harness-only, under `view3d-web/bench/`, with
    `research/gpu-benchmark.md`) and the test Garment onto `main`, where
    step 6 merged as #120, not onto the C4.3 or C4.4 branches; then re-run
    the M1 Pro numbers on `main` before C4.7.
  - **Blockers:** the commits exist only on Trevor's local branch.
  - **Resume from:** push both branches, then port `view3d-web/bench/` and
  `research/gpu-benchmark.md` onto a branch from `main` and re-run
  `run-bench.mjs` with `garment=all`.
  <!-- cspell:ignore Subdiv -->
- 2026-11-01, C4.5 part 1 (branch `3d/c4-props`): props stand in the
  venue. `view3d/core/props/propLayout.ts` (`propsAt`, `platformTopAt`)
  places each prop's Outline at real size where the timeline has it, from
  the count it was made on, not while Off field, and not while held (C4.6
  draws held items). Platforms and obstacles sit on the tallest platform
  under their footprint center; of two platforms over each other's centers
  the smaller stands on the larger (the same size: the later made on the
  earlier), so stacking makes steps and there are no loops. Floor props lie
  flat on the field. `window/props/Props.tsx` draws each prop as its own
  extruded mesh (an open freehand path as a 10 cm wall), rebuilt only when
  its shape changes, from `useShowProps` (`src/hooks/`). Plain materials per
  surface type until props carry Artwork (C5.5). Checked in the web preview
  with a demo show given a stage, a riser on it, a turned wall, a tarp and a
  round obstacle.
- 2026-11-01, C4.5 part 2 (branch `3d/c4-props`): performers stand at the
  top of the tallest platform under their dot (`platformLift.ts`). The step
  is a ramp across the edge as wide as a dot goes in half a count at the
  show's step size, halfway up on the edge; each stacked platform lifts from
  what is under it toward its own top. The lift is worked out at the moment
  the performers are placed (a count ahead, `STEP_AHEAD`) and raises the
  body, instrument, silk, contact shadow and selection ring
  (`writeFrame`'s new `lift`, null for the ground). Obstacles and Floor
  props lift nothing. Checked in the web preview: the performers inside the
  stage stand on it, the one on the riser higher.
- 2026-11-01, C4.5 part 3 (branch `3d/c4-props`): the platform checks in
  "Show checks" (`notes/platformNotes.ts`), checked on every count as the
  3D View stands the props: a step of more than 16 in from one count to the
  next ("Alice steps up 24 in onto Stage, Page 5 count 7", in cm for a
  metric show), a performer inside an obstacle (one note over the counts
  they are in it), and a dot that leaves a platform while the platform
  moves. `useShowNotes` reads the items' Outline changes for it. Shows with
  no platforms or obstacles skip the check; 400 performers over 1,000 counts
  with three props took about 95 ms on an M1 Pro.
- 2026-11-01, C4.5 review fixes (branch `3d/c4-props`): a platform now
  stands on any platform under its center; only two platforms over each
  other's centers use the order (the smaller on the larger, then the later on
  the earlier), and a longer loop is broken where it is entered. The props
  and the performers share one layout a frame, and performers stand on the
  platforms as drawn at the clock, where their bodies are (after the motion
  step). The moving-platform note also fires when the platform turns or
  changes size; the obstacle note says its counts ("Page 3 count 3 to
  Page 4 count 2"); the step note's limit reads in the show's units.
  - **Open:** a prop's Library model is C4.6's (props draw as Outlines until
    then). "With nothing between" is read count to count: a step up 16 in and
    another 16 in within one count reads as one 32 in step, and a hop onto
    and off a narrow platform within one count isn't seen.
- 2026-11-07, C4.5 merged with `timeline/main` (branch `3d/c4-props`).
  Main had parked prop holding (Placement, holders, crew, put-down) and show
  notes and Show checks (commit eb87d04a0), and drew props as plain blocks
  (`PropBlocks.tsx`, a color per prop, hidden props hidden). Props now draw
  through main's `PropBlocks`; the branch's own `Props.tsx` and
  `propMeshes.ts` are gone, so an open freehand path is a filled block, not
  a 10 cm wall. `PropBlocks` stands each block on the platform under it from
  the same layout the performers stand on (`placePropBlocks`'s `liftOf`).
  With no Placement, a prop with an Outline always stands (no Off field, no
  held props); a prop hidden on the field isn't stood on. The layout reads
  the beat from `ShowPositions.beatAt`, as the blocks and the 2D field do.
  The platform checks (part 3) left with show notes; they are on branch
  `3d/c4-props-notes` for when show checks return. Checked in the Electron
  build (temporary Playwright spec): a stage with a riser on it, a round
  obstacle and a tarp; five performers step onto the stage, the middle one
  onto the riser, a sixth walks into the obstacle and through it, and all
  step back off. The view3d web preview could not be used (it fails on
  `timeline/main` with "table `timeline_assignments` already exists").

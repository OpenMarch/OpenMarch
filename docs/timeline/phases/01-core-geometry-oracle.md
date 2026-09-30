---
phase: 1
title: Geometry, oracle, validators (core)
status: in-progress
owner: timeline-worker (timeline/p1-geometry)
branch: timeline/p1-geometry
pr: none
depends_on: [0]
updated: 2026-09-29
---

<!-- cspell:ignore lerp -->

# Phase 1: Geometry, oracle, validators (core)

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Port the spec's stateless geometry and its uncached reference oracle to TypeScript in `packages/core/src/timeline/`, with the golden vectors and independent property checks as the contract. Everything later is checked against this oracle.

## Read first

- Spec §2, §5.2, §7, §8 (R-1 to R-13, §8.9 to §8.11), §10.1 types, §12.1, §12.3 to §12.5
- `ref/geom.mjs`, `ref/oracle.mjs`, `ref/golden.mjs`, `ref/regress.mjs` (the QA-DG half), `ref/props.mjs`, `ref/mutate.py`
- `packages/core/src/index.ts`, `packages/core/package.json` (Vitest, `fast-check`)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P1.1: Types

- Owner: timeline-worker (timeline/p1-geometry)
- Status: done
- PR: https://github.com/OpenMarch/OpenMarch/pull/1036
- Parallel: no
- Depends on: —

`timeline/types.ts`: the §10.1 types (`Beat`, `XY`, `SpanKind`, `SpanInfo`, `OrderSource`, `FtlEntryInfo`, `Explanation`, `Diagnostic`, `ChangeBatch`, `Counters`, `Resolver`) plus the input show shape used by `ref/` (`marchers`, `shapes`, `transitions`, `assignments`, destinations).

### P1.2: Geometry

- Owner: timeline-worker (timeline/p1-geometry)
- Status: done
- PR: https://github.com/OpenMarch/OpenMarch/pull/1036
- Parallel: no
- Depends on: P1.1

`timeline/geom.ts`: endpoint-exact `lerp`; `arcPoint` in chord form with `ε_geom` (R-8); `pointAtDistance` (§8.10); `sampleDestinations` for every kind plus individual destinations, and the exact `destPath` (R-13); `flatten` (R-2); span classification (R-3). Float64 throughout.

### P1.3: Oracle

- Owner: timeline-worker (timeline/p1-geometry)
- Status: done
- PR: https://github.com/OpenMarch/OpenMarch/pull/1036
- Parallel: no
- Depends on: P1.2

`timeline/oracle.ts`: the naive, recursive resolver (R-1 to R-13) with diagnostics (§8.9). A doc comment says it's for tests and small shows only.

### P1.4: Write-path validators

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P1.1

`timeline/validate.ts`: pure I-S1 and I-T2 checks returning `E-S1` or `E-P1` (finiteness; bounds on every point, including a block's whole grid, a box's far corner and a circle's whole perimeter), plus a start-angle normalization helper.

### P1.5: Golden, flattening and degenerate tests

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P1.3

Tests: QA-FL-01 to -06, G1 to G13 and G8b, QA-DG-1 to -7 and QA-REG-5 against the oracle, at the §12.1 tolerances. Validator cases behind QA-DB-25 and -31.

### P1.6: Property tests with independent geometry

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P1.3

Property tests: port `props.mjs` to `fast-check`, with its **own independent geometry**. P-1, P-2, P-5, P-6, P-7 (approximate and bit-exact), P-9, P-11, P-12 and P-13, on ordinary, boundary-valued and adversarial arc-chain shows.

### P1.7: Mutation script (optional)

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P1.6

Optional: port `mutate.py` as a script that applies the nine seeded bugs to a copy and requires a named property to catch each one.

### P1.8: Export from core

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P1.3

Export the module from `packages/core/src/index.ts` (the oracle behind a clearly named test export).

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] Every test in P1.5 and P1.6 passes
- [x] `pnpm --dir packages/core run build` passes
- [x] `pnpm --dir packages/core run test` passes
- [x] Desktop still builds against the new core (`pnpm --dir apps/desktop exec tsc --noEmit`)

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- Don't reuse `path-utility` for arcs; it isn't closed-form. P1.4 can start as soon as P1.1 lands.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

### 2026-09-29 · timeline-worker · P1.1

- **Done:** `packages/core/src/timeline/types.ts` on `timeline/p1-geometry` (commit "feat(core): timeline types (P1.1)"): spec 10.1 types, `TimelineSnapshot` and the show row shapes from `ref/README.md`.
- **Checks:** not run yet (type check and build come with P1.2).
- **Next:** P1.2 `geom.ts` (already drafted locally) and its tests.
- **Resume from:** on `timeline/p1-geometry`, write `packages/core/src/timeline/geom.ts` and `__test__/geom.test.ts`; then `pnpm --dir packages/core run build`.
- **Blockers:** none.

### 2026-09-29 · timeline-worker · P1.1, P1.2

- **Done:** P1.1 types and P1.2 `packages/core/src/timeline/geom.ts` (`lerp`, `arcPoint`, `pointAtDistance`, `destPath`, `sampleDestinations`, `destinationsOf`, `flatten`, `classifySpan`, `makeTrail`) with `__test__/geom.test.ts` (QA-FL-01..06 at the flatten level, arc, path, sampling cases). Branch `timeline/p1-geometry`, commit "feat(core): timeline geometry (P1.2)".
- **Checks:** `pnpm --dir packages/core exec vitest run src/timeline`: 23 passed. `tsc --noEmit -p packages/core`: no errors under `src/timeline` (the package has pre-existing errors in `path-utility`, untouched). Build and desktop tsc not yet run.
- **Next:** P1.3 `oracle.ts`, then golden tests G1-G13 + G8b and QA-FL against the oracle.
- **Resume from:** on `timeline/p1-geometry`, write `packages/core/src/timeline/oracle.ts` (port `docs/timeline/ref/oracle.mjs`, add `diagnostics()`), `__test__/oracle.test.ts` (golden vectors from `ref/golden.mjs`), then export from `index.ts` as `createTimelineOracleForTesting`.
- **Blockers:** none.

### 2026-09-29 · timeline-worker · P1.1, P1.2, P1.3

- **Done:** P1.3 `packages/core/src/timeline/oracle.ts` (naive recursive oracle, R-1 to R-13, 8.9 diagnostics), `__test__/oracle.test.ts` (G1-G13 and G8b at spec tolerances, QA-FL-01..06 through the oracle, diagnostics), `timeline/index.ts` and root export of the types and `createTimelineOracleForTesting`. PR: https://github.com/OpenMarch/OpenMarch/pull/1036 against `timeline-try-2`. P1.1-P1.3 are in review.
- **Checks:** `pnpm --dir packages/core run build`: pass. `pnpm --dir packages/core run test`: pass (14 files, 239 passed, 2 skipped; 46 of those are the new timeline tests). `pnpm --dir apps/desktop exec tsc --noEmit`: pass (no output). `pnpm format:check`: pass. The pre-commit cspell hook passed after adding file-level `cspell:ignore` comments.
- **Next:** after merge, P1.4, P1.5, P1.6 and P1.8 can proceed. The exit-gate boxes stay unticked: build, test and desktop tsc are only true on the base branch once this PR merges, and P1.5/P1.6 are not done. The root export in this PR is minimal (types and the oracle only); P1.8 still owns the final export review.
- **Resume from:** none for P1.1-P1.3; address review comments on PR 1036 on branch `timeline/p1-geometry`.
- **Blockers:** none.

### 2026-09-30 · lead session · P1.1, P1.2, P1.3 (review check)

- **Done:** independently re-ran PR #1036's checks at its head (606db11c), because CI (`pr-checks.yaml`) runs only on PRs into `main`, so PRs into `timeline-try-2` get no automated checks.
- **Checks:** `pnpm --dir packages/core run build` (pass); `pnpm --dir packages/core exec vitest run src/timeline` (2 files, 46 tests, pass). Spot-checked that the golden tests assert the spec's literal values (for example G3 `(7,6)` at beat 8, G8 `(1.1716, 2.8284)`, G7 end distances), not values captured from the oracle.
- **Next:** a person reviews and merges #1036. P1.4 (validators) can start now; P1.5 and P1.6 after the merge.
- **Blockers:** none.

### 2026-09-30 · lead session · P1.1, P1.2, P1.3

- **Done:** PR #1036 merged (948e8a0a); P1.1 to P1.3 set to done. Three exit-gate items ticked; they must still hold when the phase closes.
- **Checks:** on `timeline-try-2` at 8cb11475 after both merges: `pnpm install`; `pnpm --dir packages/core run build` (pass); `pnpm --dir packages/core run test` (14 files, 239 passed, 2 skipped); `pnpm exec turbo run build --filter=@openmarch/desktop^...` (pass); `pnpm --dir apps/desktop exec tsc --noEmit` (pass).
- **Next:** P1.4 (validators) is being started. P1.5 and P1.6 are open.
- **Blockers:** none.

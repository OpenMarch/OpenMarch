---
phase: 1
title: Geometry, oracle, validators (core)
status: done
owner: timeline-worker (timeline/p1-geometry)
branch: timeline/p1-geometry
pr: none
depends_on: [0]
updated: 2026-09-29
---

<!-- cspell:ignore lerp unticked -->

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

- Owner: timeline-worker (timeline/p1-validators)
- Status: done
- PR: https://github.com/OpenMarch/OpenMarch/pull/1038
- Parallel: yes
- Depends on: P1.1

`timeline/validate.ts`: pure I-S1 and I-T2 checks returning `E-S1` or `E-P1` (finiteness; bounds on every point, including a block's whole grid, a box's far corner and a circle's whole perimeter), plus a start-angle normalization helper.

### P1.5: Golden, flattening and degenerate tests

- Owner: timeline-worker (timeline/p1-golden-tests)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/2
- Parallel: yes
- Depends on: P1.3

Tests: QA-FL-01 to -06, G1 to G13 and G8b, QA-DG-1 to -7 and QA-REG-5 against the oracle, at the §12.1 tolerances. Validator cases behind QA-DB-25 and -31.

### P1.6: Property tests with independent geometry

- Owner: timeline-worker (timeline/p1-properties)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/3
- Parallel: yes
- Depends on: P1.3

Property tests: port `props.mjs` to `fast-check`, with its **own independent geometry**. P-1, P-2, P-5, P-6, P-7 (approximate and bit-exact), P-9, P-11, P-12 and P-13, on ordinary, boundary-valued and adversarial arc-chain shows.

### P1.7: Mutation script (optional)

- Owner: unassigned
- Status: deferred
- PR: none
- Parallel: yes
- Depends on: P1.6

Optional: port `mutate.py` as a script that applies the nine seeded bugs to a copy and requires a named property to catch each one.

### P1.8: Export from core

- Owner: lead session
- Status: done
- PR: none
- Parallel: no
- Depends on: P1.3

Export the module from `packages/core/src/index.ts` (the oracle behind a clearly named test export).

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [x] Every test in P1.5 and P1.6 passes
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

### 2026-09-30 · timeline-worker · P1.4

- **Done:** `packages/core/src/timeline/validate.ts` (`validateShapeGeometry`, `validatePathParams`, `validateDestinations`, plus `validateDestination`, `validateHome`, `normalizeStartAngle`, `COORD_BOUND`, `MAX_ABS_BULGE`), exported from `timeline/index.ts`; `__test__/validate.test.ts` (50 tests: every rule, QA-DB-25, QA-DB-31, values at and just beyond each bound). PR: https://github.com/OpenMarch/OpenMarch/pull/1038 on `timeline/p1-validators` against `timeline-try-2`. P1.4 is in review.
- **Checks:** `pnpm --dir packages/core run build` (pass); `pnpm --dir packages/core run test` (15 files, 289 passed, 2 skipped); `pnpm exec turbo run build --filter=@openmarch/desktop^...` (pass); `pnpm --dir apps/desktop exec tsc --noEmit` (pass); `pnpm format:check` (pass); pre-commit hook (pass). Skipped per policy: full `test:history` and Playwright e2e.
- **Next:** a person reviews and merges #1038. Notes for other packages: `BlockGeometry` in `types.ts` lacks `rows` (spec 5.2 requires it); destination and home validators use codes `E-D2` and `E-N2`, which the spec's error table does not define. P1.8 owns the final export review. Exit-gate boxes are left unticked until the PR merges.
- **Resume from:** none; address review comments on PR 1038 on branch `timeline/p1-validators`.
- **Blockers:** none.

### 2026-09-30 · lead session · P1.4 (review check)

- **Done:** reviewed PR #1038. Confirmed the worker's finding that `BlockGeometry` in the merged `types.ts` lacked `rows` (spec §5.2 requires it; the DB capacity trigger uses rows × cols). Pushed 26b35d70 to the PR: `rows` added to `BlockGeometry`, the `geom.test.ts` block fixture updated, and a file-level `cspell:ignore NONFOUNDING` added to `types.ts` (the pre-commit hook rejected it).
- **Checks:** at the PR head with the fix: `pnpm --dir packages/core run build` (pass); `pnpm --dir packages/core run test` (15 files, 289 passed, 2 skipped); `pnpm --dir packages/core exec tsc --noEmit -p .` (no errors under `src/timeline`); `pnpm --dir packages/core exec vitest run src/timeline` (96 passed); `pnpm --dir apps/desktop exec tsc --noEmit` (pass); pre-commit hook (pass). Full history and e2e skipped per policy.
- **Next:** a person reviews and merges #1038, and decides whether `E-N2` (homes) and `E-D2` (individual destinations) are acceptable error codes; the spec lists those invariants without an `E-` code.
- **Blockers:** none.

### 2026-09-30 · lead session · P1.4

- **Done:** PR #1038 merged (f9599090); P1.4 set to done.
- **Checks:** on `timeline-try-2` at 84ea6191: `pnpm --dir packages/core run build` (pass); `pnpm --dir packages/core run test` (289 passed, 2 skipped); `pnpm --dir apps/desktop exec tsc --noEmit` (pass). `test:focused` on the migration, file-version and repair tests: `timelineTriggers.test.ts` failed to load, because P3.9's renderer hook imports `@om-electron/database/fileVersion` and `vitest.config.ts` lacked that alias. Fix: branch `timeline/fix-vitest-alias` (eb81e8a5); with it, 6 files and 126 tests pass.
- **Next:** P1.5 and P1.6 are being started.
- **Blockers:** none.

### 2026-09-30 · timeline-worker · P1.5

- **Done:** `packages/core/src/timeline/__test__/degenerate.test.ts`: QA-DG-1 to -7 (spec literal values, D-FTL-EMPTY on QA-DG-4), P-11 on every fixture, QA-REG-5 at 40 and 1,000 chained arcs (bound beta\*sqrt(1+a), max |P| <= 1e6, exact (1,1) arrival). The oracle handled 1,000 arcs without a stack overflow on Node 24. G1-G13, G8b, QA-FL-01..06 and QA-DB-25/-31 were already covered by P1.2-P1.4. PR: https://github.com/OpenMarch/OpenMarch/pull/1042 on `timeline/p1-golden-tests`. P1.5 is in review.
- **Checks:** `pnpm --dir packages/core run build` (pass); `pnpm --dir packages/core run test` (16 files, 298 passed, 2 skipped); prettier, eslint, cspell on the new file (pass). Skipped per policy: full test:history and Playwright e2e.
- **Next:** a person reviews and merges #1042. The exit-gate box "Every test in P1.5 and P1.6 passes" stays unticked until P1.6 lands.
- **Resume from:** none; address review comments on PR 1042.
- **Blockers:** none.

### 2026-09-30 · lead session · P1.5 (review check)

- **Done:** re-checked PR #1042 at 60499128 (one new file, `__test__/degenerate.test.ts`).
- **Checks:** `pnpm --dir packages/core exec vitest run src/timeline/__test__/degenerate.test.ts` (9 passed). Spot-checked QA-DG-4 against spec §12.4: beat 6 M1 (2,3), M2 (2,1); beat 8 M1 (4,6), M2 (4,0); one `D-FTL-EMPTY` on transition 1; no members. These are the spec's literal values, not oracle snapshots. Commit carries no attribution lines.
- **Next:** a person merges #1042. P1.6 (properties) is still running.
- **Blockers:** none.

### 2026-09-30 · timeline-worker · P1.6

- **Done:** on `timeline/p1-properties` (b6d23db9, pushed): `packages/core/src/timeline/__test__/properties.test.ts` ports `ref/props.mjs` to fast-check against `createTimelineOracleForTesting`: P-1, P-2, P-5, P-6, P-7 (approximate against independent geometry and bit-exact against `destinationsOf`), P-9, P-11, P-12 and P-13 on ordinary, boundary-valued and adversarial arc-chain shows, with D-16 individual destinations mixed in; plus the R-8 cross-check against the centre-and-radius form (moderate inputs, fast-check arbitraries) and the R-8 endpoint and extreme-input cases. Independent geometry is in `__test__/independentGeometry.ts` (imports nothing from `geom.ts`); the generators in `__test__/showGenerators.ts` reproduce props.mjs's draws, so a failing seed builds the same show there. Seeded and deterministic; `TIMELINE_PROPS_SHOWS` and `TIMELINE_PROPS_SEED` opt into larger or different runs (documented in the file header). A final test asserts every property was exercised, including at least one D-16 arrival.
- **Checks:** `pnpm install` (pass); `pnpm --dir packages/core run build` (pass); `pnpm --dir packages/core run test` (16 files, 295 passed, 2 skipped, 3.3 s); `pnpm --dir packages/core exec vitest run src/timeline/__test__/properties.test.ts` (6 passed, about 0.6 s; default run 300 ordinary + 300 boundary + 30 chain shows = 196,544 checks, against props.mjs's 253,917 at 300 seeds, whose extra ~57,000 are its resolver-vs-oracle checks, deferred to Phase 2); opt-in `TIMELINE_PROPS_SHOWS=5000 TIMELINE_PROPS_SEED=7` (3,083,896 checks, 0 failures, 5.2 s); `pnpm --dir packages/core exec tsc --noEmit -p .` (no errors under `src/timeline`); prettier, eslint and cspell on the three files (pass; the pre-commit hook also passed). Mutation smoke check, not committed: changing the R-5 denominator in `oracle.ts` to `sp.end - sp.start` (breaking D-7) made the ordinary and boundary suites fail with `P-12 causality`; reverted with `git checkout`. Full `test:history` and Playwright e2e not run (policy; core-only change).
- **Next:** no PR on OpenMarch/OpenMarch, per the lead: timeline work is moving to a fork. The lead opens the PR there.
- **Resume from:** open the PR on the fork once the lead sets it up (branch `timeline/p1-properties`, base the fork's coordination branch); then set P1.6 to `in-review` with the PR link. Nothing else outstanding.
- **Blockers:** none.

### 2026-09-30 · lead session · P1.5, P1.6 (moved to the fork)

- **Done:** timeline work moved to the fork `AlexDumo/OpenMarch-timeline` (see README "Coordination branch"). P1.5's PR moved from OpenMarch/OpenMarch#1042 (closed with a pointer) to AlexDumo/OpenMarch-timeline#2. P1.6's PR opened on the fork as #3 (branch `timeline/p1-properties`, b6d23db9); P1.6 set to in-review.
- **Checks:** from the P1.6 worker at b6d23db9: `pnpm --dir packages/core run build` (pass); `pnpm --dir packages/core run test` (16 files, 295 passed, 2 skipped); default property run 196,544 checks, opt-in 5,000-show run 3,083,896 checks, 0 failures; a local D-7 mutation made P-12 fail. Full history and e2e skipped per policy.
- **Next:** a person reviews and merges fork PRs #2 and #3.
- **Blockers:** none.

### 2026-09-30 · lead session · Phase 1 closed

- **Done:** fork PRs #2 (P1.5) and #3 (P1.6) merged; P1.5 and P1.6 set to done. P1.8: `packages/core/src/timeline/index.ts` exports the §10.1 types, `TimelineSnapshot`, the validators and `createTimelineOracleForTesting`, matching ADR 0001 §4; `createResolver` arrives with P2.9. P1.7 (mutation script) deferred as optional: P1.6's mutation smoke check showed a D-7 break is caught by P-12. Phase 1 set to done.
- **Checks:** on the fork's `timeline-try-2` at a42286d4: `pnpm --dir packages/core run build` (pass); `pnpm --dir packages/core run test` (17 files, 304 passed, 2 skipped); `pnpm --dir apps/desktop exec tsc --noEmit` (pass).
- **Next:** Phase 2.
- **Blockers:** none.

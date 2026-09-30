---
phase: 2
title: Cached incremental resolver (core)
status: done
owner: timeline-worker (timeline/p2-resolver)
branch: timeline/p2-resolver
pr: none
depends_on: [1]
updated: 2026-09-30
---

# Phase 2: Cached incremental resolver (core)

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Port `ref/resolver.mjs` to TypeScript behind the §10.1 `Resolver` interface: boundary caches, batch-driven invalidation and an iterative pull-compile. It must agree with the Phase 1 oracle under fuzzing.

## Read first

- Spec §9 (all), §10.1, §10.2, §12.6, §12.7
- `ref/resolver.mjs`, `ref/fuzz.mjs`, `ref/cx.mjs`, `ref/deep.mjs`, `ref/regress.mjs` (the QA-REG half)
- Phase 1 handoff notes

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P2.1: Row index and batch coalescing

- Owner: timeline-worker (timeline/p2-resolver)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/6
- Parallel: no
- Depends on: —

Row index built only from batch after-images (by id, marcher and transition), plus a host mirror interface for marchers, shapes and transitions. Batch coalescing: first `before`, last `after` (§10.2).

### P2.2: Caches and iterative pull-compile

- Owner: timeline-worker (timeline/p2-resolver)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/6
- Parallel: no
- Depends on: P2.1

Local caches (`spans`, `spansByTransition`, `destinations`, `ftlGeometry`) and cascading caches (`origin` keyed by `(marcher, span.start)`, `ftlEntry`). Pull-compile with an **explicit work stack**, which throws on a detected cycle (§9.3).

### P2.3: Invalidation (notify)

- Owner: timeline-worker (timeline/p2-resolver)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/6
- Parallel: no
- Depends on: P2.2

`notify(batch)`: §9.4 steps 1 to 4 exactly, and walk rules W-1 to W-4 with an explicit stack. Returns an `InvalidationReport`.

### P2.4: Query and introspection API

- Owner: timeline-worker (timeline/p2-resolver)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/6
- Parallel: no
- Depends on: P2.2

`positionAt`, `positionsAt(beat, Float64Array)`, `marcherIds`, `explain`, `ftlEntry`, `diagnostics`, `warmAll`, `counters`, `resetCounters`, `checkCacheClosure` (I-C1, including stale keys). Leave out the ref's `rules: 'v0.1'` switch.

### P2.5: Golden, regression, invalidation and complexity tests

- Owner: timeline-worker (timeline/p2-resolver-tests)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/8
- Parallel: yes
- Depends on: P2.4

Tests: G1 to G13 on the resolver; QA-REG-1 to -4; QA-INV-02 to -07; QA-CX-01 to -05 (CX-04 hasn't been run in `ref/` yet).

### P2.6: Differential fuzz

- Owner: timeline-worker (timeline/p2-fuzz-deep)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/7
- Parallel: yes
- Depends on: P2.4

QA-INV-08: port `fuzz.mjs` as a seeded Vitest suite (a small seed count in CI) plus a `pnpm` script for the 1,000-seed run. Assert P-3 and P-4 after every batch.

### P2.7: Deep chains on a small stack

- Owner: timeline-worker (timeline/p2-fuzz-deep)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/7
- Parallel: yes
- Depends on: P2.4

QA-REG-6: a deep-chain script run with `node --stack-size=300` (20,000 direct, the same chain after a first-shape edit, and 5,000 FTL).

### P2.8: P-8 and P-10 assertions

- Owner: timeline-worker (timeline/p2-resolver-tests)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/8
- Parallel: yes
- Depends on: P2.4

New dedicated assertions for P-8 (a shape edit leaves other transitions' caches bit-identical) and P-10 (timeline edits never change positions).

### P2.9: Export the resolver

- Owner: timeline-worker (timeline/p2-resolver)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/6
- Parallel: no
- Depends on: P2.4

Export the resolver from `@openmarch/core`, and confirm the public API matches the ADR.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [x] P2.5 to P2.8 pass
- [x] The 1,000-seed fuzz run passes locally (log its command and output)
- [x] `pnpm --dir packages/core run build` and `run test` pass

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- None yet.
- Review follow-ups for P2.5 to P2.8 (from the PR #6 review): add a guard that throws if a cache miss happens during a compute (so the no-recursion guarantee can't drift if `depsOfOrigin`/`depsOfEntry` stop matching what the compute functions read); negative closure tests (an injected stale origin key, an entry cached without its founders); a `slot_destinations` change whose rowId differs from its image's `transition`; `warmAll`/`notify` on an FTL with no founding spans; delete-then-reinsert of one id in a batch and a marcher inserted and deleted in a batch; a range change that turns a founding span into a join. Optional: a marcher change that leaves `home` unchanged needn't evict from −∞.
- Fuzz follow-ups (optional, from the PR #7 review): the harness never inserts or deletes shapes (only updates); its oracle comparison uses the reference's 1e-6 absolute tolerance, which is looser than the property tolerance `1e-9·S + 1e-12`; it has 18 edit kinds, a superset of the spec's 15.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

### 2026-09-30 · lead session · P2.1 to P2.4 (checkpoint after a usage-limit stop)

- **Done:** the worker hit the account usage limit after drafting `packages/core/src/timeline/resolver.ts` (878 lines: row index, coalescing, `createCachedResolver`, `createResolver`) and an `index.ts` export change, without committing. The lead committed the draft as-is as eae47f91 (`wip:`, untested; plus one word added to its cspell ignore line) and pushed it to `timeline/p2-resolver` on the fork.
- **Checks:** pre-commit hook (cspell, eslint, prettier) passed on the draft. Build and tests not yet run.
- **Next:** the resumed worker reviews the draft against spec §9 and `ref/resolver.mjs`, completes it, and adds the tests.
- **Blockers:** none.
- **Resume from:** check out `timeline/timeline/p2-resolver` (eae47f91); run `pnpm --dir packages/core run build` and `exec tsc --noEmit -p .` to see the draft's state; then finish P2.1 to P2.4 and P2.9 as the phase file describes.

### 2026-09-30 · timeline-worker (timeline/p2-resolver) · P2.1, P2.2, P2.3, P2.4, P2.9

- **Done:** resumed from wip commit `eae47f91` on `timeline/p2-resolver` (a previous worker stopped on a usage limit before logging). Reviewing `packages/core/src/timeline/resolver.ts` against spec §9, §10.1, §10.2 and `ref/resolver.mjs`.
- **Checks:** none yet.
- **Next:** fix review findings, then add resolver golden/QA-FL tests (fixtures shared with `oracle.test.ts`) and notify() cases.
- **Blockers:** none.
- **Resume from:** check out `timeline/p2-resolver`, review `packages/core/src/timeline/resolver.ts`, then write `packages/core/src/timeline/__test__/resolver.test.ts`.

### 2026-09-30 · timeline-worker (timeline/p2-resolver) · P2.1, P2.2, P2.3, P2.4, P2.9

- **Done:** reviewed the draft against §9, §10.1, §10.2 and `ref/resolver.mjs`; it follows the reference. Fixes: `byDest` now follows the host's transition row (not the image), `slot_destinations` images also mark the image's `transition`, and `warmAll` compiles every FTL entry. Golden fixtures moved to `__test__/fixtures.ts` and `__test__/goldenSuite.ts`, run against the oracle and the resolver; `__test__/resolver.test.ts` adds 33 notify() cases, compared with a fresh build (exactly) and the oracle, with `checkCacheClosure()` after each. Commit `d601d3e1`.
- **Checks:** `pnpm exec vitest run src/timeline/__test__/resolver.test.ts` (in `packages/core`): 64 passed. Mutation spot checks (removing W-1, W-2, W-3 origins, step 3.1, step 3.4, or the row-image transitions) each fail tests.
- **Next:** full package checks, desktop typecheck, squash, PR.
- **Blockers:** none.
- **Resume from:** branch `timeline/p2-resolver` at `d601d3e1`; run `pnpm --dir packages/core run build`, `run test`, `tsc --noEmit -p .`, then the desktop build and typecheck; squash the two wip commits and open the PR.

### 2026-09-30 · timeline-worker (timeline/p2-resolver) · P2.1, P2.2, P2.3, P2.4, P2.9

- **Done:** opened [PR #6](https://github.com/AlexDumo/OpenMarch-timeline/pull/6) (commits `51bedf4e` resolver + export, `5e4d98b2` tests; the wip commits were squashed and the branch rebased on `timeline-try-2`). `createResolver` is exported from `@openmarch/core` and matches ADR 0001 §4 with no renames. The golden/QA-FL/diagnostics fixtures are now shared (`__test__/fixtures.ts`, `__test__/goldenSuite.ts`) between the oracle and the resolver. `resolver.test.ts` holds 33 notify() cases, an inverse-edit case, a 27-batch sequence, W-4 early stop, counters and the cycle error.
- **Checks:** `pnpm --dir packages/core run build` pass; `pnpm --dir packages/core run test` pass (18 files, 369 passed, 2 skipped); `pnpm --dir packages/core exec tsc --noEmit -p .` has no errors under `src/timeline` (the 54 errors it reports are all in `src/path-utility`); `pnpm exec turbo run build --filter=@openmarch/desktop^...` pass; `pnpm --dir apps/desktop exec tsc --noEmit` pass; prettier, eslint and cspell on `packages/core/src/timeline` are clean. Full `test:history` and e2e were not run (policy; no desktop code changed).
- **Next:** review and merge PR #6. P2.5 to P2.8 are open and can reuse `__test__/fixtures.ts`, the `Editor` helper and `richShow()` in `resolver.test.ts`. Exit-gate item 3 (core build and test pass) becomes true on the base only when the PR merges, so it is not ticked yet.
- **Blockers:** none.

### 2026-09-30 · lead session · P2.1 to P2.4, P2.9 (reviewed and merged)

- **Done:** fork PR #6 reviewed by a sub-agent against spec §9.2 to §9.5 and §10.2 (APPROVE WITH NITS, no correctness bug) and merged (2ce8c3fe). The reviewer confirmed: notify() handles every row of the §9.4 table; pull-compile and the dirty walk use explicit stacks with a sound cycle check; W-4 is correct under I-C1; the three deliberate changes (shape map from the host mirror, slot_destinations image transition, warmAll compiling empty FTL entries) are correct; golden expectations are the spec's literals. The lead confirmed the change-log image field is `transition` (triggers.ts), matching the resolver. Nits folded into P2.5 to P2.8 (handoff notes). Packages set to done.
- **Checks:** at the PR head: `pnpm --dir packages/core run build` (pass); `vitest run` in packages/core (18 files, 369 passed, 2 skipped); `tsc --noEmit -p packages/core` (no errors under `src/timeline`). After merge on `timeline-try-2`: build and tests pass again.
- **Next:** P2.5 to P2.8.
- **Blockers:** none.

### 2026-09-30 · timeline-worker (timeline/p2-resolver-tests) · P2.5, P2.8

- **Done:** claimed P2.5 and P2.8 (plus the PR #6 review follow-ups in the handoff notes). Branch `timeline/p2-resolver-tests` from `timeline-try-2` (dd51b8af).
- **Checks:** none yet.
- **Next:** read spec §9, §12.5 to §12.7, `ref/cx.mjs`, `ref/regress.mjs` and the resolver tests; add the QA-REG, QA-INV, QA-CX, P-8 and P-10 tests.
- **Blockers:** none.
- **Resume from:** check out `timeline/p2-resolver-tests` on the fork (or create it from `timeline/timeline-try-2`), run `pnpm install`, then start on `packages/core/src/timeline/__test__/`.

### 2026-09-30 · timeline-worker (timeline/p2-fuzz-deep) · P2.6, P2.7

- **Done:** opened [PR #7](https://github.com/AlexDumo/OpenMarch-timeline/pull/7). P2.6: `__test__/fuzzHarness.ts` + `fuzz.test.ts` (seeded port of `ref/fuzz.mjs`; 18 edit kinds incl. individual destinations, shape/individual switches, slot_destinations-only edits, range rewrites, marcher insert/delete; after every batch: closure, bit-equal to a fresh build, oracle within 1e-6); default 60 seeds x 40 steps (~1 s); `test:fuzz` runs 1,000 x 80. P2.7: `scripts/deep-chains.mjs` (`test:deep`, `node --stack-size=300` against the built dist) plus a CI-sized `deepChains.test.ts`. `resolver.ts` untouched; no resolver bug found.
- **Checks:** `pnpm --dir packages/core run test:fuzz`: 1,000 seeds, 72,349 batches, 0 divergent, 0 closure violations, 0 exceptions (26 s). `test:deep -- --oracle-overflow`: 20,000 direct cold, same after editing the first shape (39,999 nodes walked), 5,000 FTL all pass at `--stack-size=300`; the recursive oracle overflows there (RangeError), as designed, and is not used by the checks. Mutation check: dropping slot_destinations handling in `notify` gave 62 divergences in 100 x 40 (reverted). `run build` pass; `run test` 20 files, 372 passed, 2 skipped; tsc clean for the new files and outside `src/path-utility`; prettier, eslint (TS) and cspell clean. `test:history` and e2e not run (policy).
- **Next:** review and merge PR #7. The exit-gate fuzz item is true once it merges (the command is in this entry).
- **Blockers:** none.

### 2026-09-30 · timeline-worker (timeline/p2-resolver-tests) · P2.5, P2.8

- **Done:** commit `7bf1aaeb` (wip) on `timeline/p2-resolver-tests`. `resolver.ts`: pull-compile now throws an internal error if a cache miss starts a compile while another compute runs (review follow-up a); a transition update recomputes local caches only when `dest`, `slots`, `style` or `params` change (spec 9.4 table: range and `order_mode` recompute nothing local); a marcher change that leaves `home` unchanged no longer evicts from −∞ (optional follow-up); clearly marked `testOnly` hooks (`localCaches`, `cachedNodeCount`, `putOrigin`, `dropOrigin`, `hideDependencies`). The shared helpers (`Editor`, `richShow`, `expectAgrees`, `NOTIFY_CASES`) moved from `resolver.test.ts` to `__test__/resolverHarness.ts`.
- **Checks:** `pnpm exec vitest run src/timeline` in `packages/core`: 6 files, 176 passed.
- **Next:** write `__test__/resolverInvalidation.test.ts` (QA-REG-1..4, QA-INV-02..07, QA-CX-01..05, P-8, P-10, follow-ups b to f).
- **Blockers:** none.
- **Resume from:** branch `timeline/p2-resolver-tests` at `7bf1aaeb`; run `pnpm install`, then add `packages/core/src/timeline/__test__/resolverInvalidation.test.ts`.

### 2026-09-30 · lead session · P2.6, P2.7 (reviewed and merged)

- **Done:** fork PR #7 reviewed by a sub-agent (APPROVE WITH NITS, no correctness defect) and merged (5d2300a1). The reviewer checked the fuzz harness's change-log images field by field against the app's triggers (`triggers.ts`) and found them identical, and confirmed every edit keeps the show valid under §6. Before merging, the lead raised the CI deep-chain test to the full 20,000 direct / 5,000 FTL (at 3,000 on the default stack it wouldn't catch recursion returning; it now runs in about 1.4 s) and made the script's shape edit log the full before-image. P2.6 and P2.7 set to done; the 1,000-seed exit-gate item ticked.
- **Checks:** at the PR head: core build (pass); `vitest run` in packages/core (20 files, 372 passed, 2 skipped); `pnpm --dir packages/core run test:fuzz` (1,000 seeds, 72,349 batches, 0 divergent, 0 closure violations, 0 exceptions); `pnpm --dir packages/core run test:deep` on `node --stack-size=300` (all three pass; the dirty walk visited 39,999 nodes). After the nits: the CI deep-chain test (pass, 1.4 s) and `test:deep` (pass).
- **Next:** P2.5 and P2.8 are in progress; Phase 2 closes when they merge.
- **Blockers:** none.

### 2026-09-30 · timeline-worker (timeline/p2-resolver-tests) · P2.5, P2.8

- **Done:** squashed and rebased on `timeline-try-2` after PR #7 merged: `13fd3066` (resolver guard, local-input check, unchanged-home skip, test-only hooks) and `04535910` (new `__test__/resolverInvalidation.test.ts`, 83 tests; helpers moved to `__test__/resolverHarness.ts`). Pushed to `timeline/p2-resolver-tests`.
- **Checks:** `pnpm --dir packages/core run build` pass; `pnpm --dir packages/core run test` pass (21 files, 455 passed, 2 skipped); `tsc --noEmit -p packages/core` no errors under `src/timeline` (54 pre-existing in `src/path-utility`). Mutation spot checks each fail the new suite: ignoring the slot_destinations image transition, dropping step 3.4 row-image transitions, always recomputing locals, no unchanged-home skip, no compute guard, dropping W-2, dropping W-1's FTL entry.
- **Next:** 1,000-seed fuzz and deep-chain script on the rebased tree, then the PR.
- **Blockers:** none.
- **Resume from:** branch `timeline/p2-resolver-tests` at `04535910`; run `pnpm --dir packages/core run test:fuzz` and `run test:deep`, then open the PR (`gh pr create --repo AlexDumo/OpenMarch-timeline --base timeline-try-2`).

### 2026-09-30 · timeline-worker (timeline/p2-resolver-tests) · P2.5, P2.8

- **Done:** opened [PR #8](https://github.com/AlexDumo/OpenMarch-timeline/pull/8) from `timeline/p2-resolver-tests` (`13fd3066` resolver guard and test hooks, `04535910` tests), rebased on `timeline-try-2` after PR #7. Covers QA-REG-1 to -4, QA-INV-02 to -07, QA-CX-01 to -05 (CX-04 run for the first time: counters grow linearly with the number of chain copies, and doubling gives at most 2.1×), P-8, P-10 and review follow-ups (a) to (f) plus the optional unchanged-home skip. Two behavior changes in `resolver.ts`, for the reviewer: the compute guard (throws on a cache miss during a compute); and a transition update now recomputes local caches only when `dest`, `slots`, `style` or `params` change (spec 9.4 table: range and `order_mode` recompute nothing local).
- **Checks:** `pnpm --dir packages/core run build` pass; `run test` pass (21 files, 455 passed, 2 skipped); `run test:fuzz` 1,000 seeds × 80 steps: 72,349 batches, 0 divergent, 0 closure violations, 0 exceptions; `run test:deep` all three checks pass; `tsc --noEmit -p packages/core` no errors under `src/timeline`; eslint (0 errors), prettier and cspell clean on the changed files. Desktop `test:history`, e2e and the desktop build were not run (policy; no desktop code changed).
- **Next:** review and merge PR #8. Exit-gate items 1 (P2.5 to P2.8 pass) and 3 (core build and test pass on the base) become true only when it merges, so they are not ticked.
- **Blockers:** none.

### 2026-09-30 · lead session · P2.5, P2.8 (reviewed and merged); Phase 2 closed

- **Done:** fork PR #8 reviewed by a sub-agent (APPROVE WITH NITS; none of its three resolver behavior changes can break correctness on valid data: the compute guard can't fire on valid paths, transition updates still seed W-3 for every change and recompute local caches when §9.4 requires, and an unchanged home skips the −∞ eviction only when both coordinates are identical). Before merging, the lead: made `createResolver` return only the public `Resolver` methods (the test hooks and cache introspection were reachable at runtime), documented that style and params changes recompute both local caches (more than §9.4 requires, never wrong) and the key-order behavior of the params comparison, and added a test for a range-only update and a destination change on one transition in one batch. Merged as 4d646ce3. P2.5 and P2.8 set to done; all Phase 2 exit-gate items ticked; Phase 2 set to done.
- **Checks:** at the PR head: `pnpm --dir packages/core run build` (pass); `vitest run` in packages/core (21 files, 455 passed); `test:fuzz` (1,000 seeds, 72,349 batches, 0 divergent, 0 closure violations, 0 exceptions); `test:deep` (all pass); `tsc --noEmit -p packages/core` (no errors under `src/timeline`). After the lead's fixes: build (pass), 456 passed, `test:deep` (pass). After merge on `timeline-try-2`: build (pass), 456 passed.
- **Next:** Phase 4 (in progress: P4.1 to P4.3).
- **Blockers:** none.

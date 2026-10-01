# Timeline Findings

Measurements and human judgments the spec asks for. Append-only: add a dated
entry under the right heading and never rewrite an old one. Cite the phase and
work package that produced it.

## Performance (QA-PF)

Provisional budgets from spec §12.9, on the QA-SC-11 fixture. Missing one is a
finding, not a blocker.

- QA-PF-01: `positionsAt` for 250 marchers, warm, p99 ≤ 1 ms.
- QA-PF-02: cold `warmAll()` ≤ 16 ms (≤ 50 ms with idle warming).
- QA-PF-03: worst-case edit: walk ≤ 2 ms, then the first pull ≤ 16 ms.
- QA-PF-04: memory held by derived caches ≤ 5 MB.

Entry format:

```markdown
### YYYY-MM-DD · <owner> · P5.8 · QA-PF-01

- Result: 0.4 ms p99 (budget ≤ 1 ms)
- Machine and commit: <machine>, <sha>
- Fixture seed and command: <seed>, `<command>`
```

<!-- Append performance entries below. -->

### 2026-09-30 · timeline-worker (timeline/p5-warm-fixtures) · P5.8 · QA-PF-01

- Result: 0.047, 0.060 and 0.069 ms p99 over three runs (budget ≤ 1 ms); p50 0.027 to 0.028 ms; worst single frame 0.16 to 1.5 ms. 3,000 `positionsAt` calls for all 250 marchers at beats spread over the show, after `warmAll`, resolver only.
- Machine and commit: Apple M1 Pro (8 cores, 16 GB), macOS (Darwin 25.5.0, arm64), Node v24.14.1 under Vitest (jsdom environment), 818fa51b on `timeline/p5-warm-fixtures`.
- Fixture seed and command: seed 1, `env TIMELINE_PF_OUT=<file> pnpm exec vitest run src/timeline/__test__/timelineScale.test.ts` in `apps/desktop`. The show: 250 marchers, 200 transitions, 120 shapes, 10 timelines, 4,223 assignments (380 layer-1 steals), a 32-transition chain, 250 beats.

### 2026-09-30 · timeline-worker (timeline/p5-warm-fixtures) · P5.8 · QA-PF-02

- Result: cold `warmAll()` median 4.4 to 4.9 ms over three runs of seven fresh resolvers each (budget ≤ 16 ms); the first, unoptimized run of each process took 6.8 ms. Building the resolver from the tables first takes about 5 ms (`readTimelineTables`) plus about 6 ms (`createTimelineHost`). The P5.6 idle warming pass over the same show queries 130 transition boundaries in 3 or 4 slices of 4 ms, 8.5 to 9.3 ms in all, and its longest single query is 0.44 to 0.52 ms, so no slice blocks a frame.
- Machine and commit: as for QA-PF-01.
- Fixture seed and command: as for QA-PF-01.

### 2026-09-30 · timeline-worker (timeline/p5-warm-fixtures) · P5.8 · QA-PF-03

- Result: moving the first shape of the deepest chain by 4 steps, committed through `updateTimelineShapesInTransaction`, dirties 1,448 origins and 20 FTL entries. Walk (`resolver.notify`): 0.98, 1.22 and 3.51 ms over three runs (budget ≤ 2 ms; the 3.51 ms run is over budget). Updating the store's mirror before it: 0.11 to 0.16 ms. First pull at beat 249.5, the end of the chain: 1.23, 3.30 and 1.36 ms (budget ≤ 16 ms), recomputing 1,422 origins and 20 FTL entries; the next frame takes 0.03 ms.
- Machine and commit: as for QA-PF-01.
- Fixture seed and command: as for QA-PF-01. Each number is one sample, the first edit in its process, so it includes JIT warm-up. That probably explains the 3.51 ms walk: a finding to re-measure with repeated edits before anyone acts on it, not a blocker.

### 2026-09-30 · timeline-worker (timeline/p5-warm-fixtures) · P5.8 · QA-PF-04

- Result: 2.38 to 2.56 MB, median 2.51 to 2.53 MB over three runs (budget ≤ 5 MB). Measured as the heap growth from building one resolver over the SC-11 rows and calling `warmAll`, between forced garbage collections. The rows themselves are shared and not counted, so this is everything the resolver derives (spans, indexes, destinations, FTL geometry, origins, entries), a slight overestimate of the caches alone.
- Machine and commit: as for QA-PF-01.
- Fixture seed and command: as for QA-PF-01.

## Scenario verdicts (human)

Questions a person must answer, recorded here:

- QA-SC-07: is losing FTL order through an order-free transition acceptable?
  (Q-4)
- QA-SC-14: are minor arcs enough in practice? (D-15, Q-13)
- QA-SC-15: do individual moves feel like page editing, and does converting a
  shape to points lose nothing visible? (D-16, Q-14)

Entry format:

```markdown
### YYYY-MM-DD · <person> · QA-SC-14

- Verdict: acceptable / not acceptable
- Reasoning: …
- Follow-up: none, or a spec question to raise
```

<!-- Append verdict entries below. -->

## Other findings

<!-- Append entries below: ### YYYY-MM-DD · <owner> · P<n>.<m> -->

### 2026-09-29 · timeline-worker · P0.2

Baseline run of the reference suite (`run_all.sh`, exit 0, all 12 checks ok):

```text
storage (db_tests.py)              ok    50 of 50 pass
undo and redo (undo_tests.py)      ok    15 of 15 pass
golden vectors                     ok    14 of 14 golden fixtures pass (oracle and cached resolver)
regressions + degenerate           ok    13 pass, 3 expected v0.1 failures, 0 unexpected
properties (props.mjs)             ok    253917 property checks, 0 failures
mutation test of props.mjs         ok    9 of 9 mutations caught by a property check
differential fuzz, v0.2+ rules     ok    rules v0.2+: 71591 batches, 0 divergent, 0 closure violations, 0 exceptions
differential fuzz, v0.1 rules      ok    rules v0.1: 2550 batches, 276 divergent, 35 closure violations, 131 exceptions (failures e
end-to-end SQLite fuzz + undo      ok    28069 commits (11473 with individual-point changes), 10099 rejected by the database; 11239
end-to-end, v0.6 range trigger     ok    expected failure reproduced: undo broke in 83 of 300 seeds
complexity counters                ok    CX-06 warm FTL evaluation: 108 ns/member at m=50, 100 ns/member at m=5000 (ratio 0.93; inf
deep chains, small stack           ok    all deep-chain checks pass
```

Exit code 0. `run_all.sh` itself truncates each line to 90 characters. Environment: macOS (Darwin 25.5.0), Python 3.14.7 (its `sqlite3` module links SQLite 3.53.4), Node v24.14.1 (`node:sqlite` reports SQLite 3.51.2). Reference suite from `origin/timeline/p0-spec` at 7c144877 (PR #1034).

### 2026-09-30 · lead session · pre-existing test failures

- `pnpm --dir apps/desktop run test` has 21 failing tests in `src/components/marcher/__test__/MarcherForm.test.tsx` and `src/components/mobile/__test__/RevisionsList.test.tsx` ("Invalid Chai property: toBeInTheDocument", "toHaveTextContent", "toHaveClass"): the jest-dom matchers aren't registered.
- The same 21 fail the same way on `origin/main` (e731f3a2), so they predate the timeline work. Treat them as known when re-checking timeline PRs, and don't count them against a PR.
- Workers reported them earlier as a worktree problem; they also fail in a normal checkout, so that explanation was incomplete. Not investigated further.

### 2026-09-30 · lead session · jest-dom failures are environment-dependent

- The 21 `MarcherForm`/`RevisionsList` failures recorded above did not occur in a full `pnpm --dir apps/desktop run test` run on a scratch work tree (PR #9 review: 87 files, 1,387 passed). They reproduce in the main checkout and on `origin/main`, so they depend on the environment (likely which `vitest`/jest-dom copy resolves), not on the code.

### 2026-09-30 · lead session · `Canvas.test.tsx` is load-sensitive

- `src/components/canvas/__test__/Canvas.test.tsx` ("renders") can time out waiting for `fieldCanvas` while the canvas still shows its loading spinner, when another test run shares the machine. It passed alone twice on the same code. Treat a lone failure there as load, and re-run it alone before blaming a PR.

### 2026-09-30 · timeline-worker (timeline/p6-converter) · P6.5 · change-log images round REAL columns

- **What:** the timeline change-log triggers (`apps/desktop/electron/database/migrations/triggers.ts`) build their row images with `json_object`/`json_array`, and SQLite renders a REAL in JSON with 15 significant digits. Homes (`marchers.home_x/home_y`) and slot destinations (`timeline_slot_destinations.x/y`) therefore reach the running resolver store rounded: `81.30704416322351` arrives as `81.3070441632235`.
- **Effect:** after any edit, the live store's mirror (`timelineHost.ts`, updated from batch images) differs from the rows by up to about 4e-12 field units on the `marchersAndPages` mock show, until the next cold build. The rows are exact, a cold build is exact, and undo/redo replay (`quote()`) round-trips exactly. So spec P-7 (arrivals equal the model's points bit for bit) and the Phase 6 goal (page ends exactly equal to `marcher_pages`) hold for a cold build but not for the store that followed the edit, for example right after `window.openmarchTimeline.convertPages()`.
- **Evidence:** `apps/desktop/src/timeline/__test__/pageConversion.test.ts` ("is one undoable edit"): with the store running during the conversion, page ends match within 1e-9 but not bit for bit; after a restart they match bit for bit. Check: `node -e "…select json_array(81.30704416322351)"` gives `[81.3070441632235]`.
- **Possible fix (not made in P6):** emit the REAL columns as `json(printf('%!.17g', x))` in the image builders, or read homes and destinations back from the tables when a batch names them. Either touches the Phase 3/4 change-log contract, so it is for the lead to route.

### 2026-09-30 · lead session · every file open rewrites all triggers (pre-existing)

- Drizzle's migrator calls the migration callback in `DrizzleMigrationService.applyPendingMigrations` on every open, even with no pending migration, and that callback runs `dropAllTriggers` and `createAllTriggers`. So each open changes the schema (`schema_version` rose by about 100 on an up-to-date file in a test) and the file's modification time, which cloud sync or version control can see as an edit. This predates the timeline work. The change-log refresh added in PR #18 is itself a no-op on an up-to-date file. Worth fixing in the app generally: only drop and recreate triggers when the callback actually receives queries.

### 2026-10-01 · lead session · flaky Tolgee timer after test teardown

- One run of `pnpm --dir apps/desktop run test` (on PR #25's branch) passed every test but exited 1 with an unhandled "ReferenceError: window is not defined" from a Tolgee web timer (`@tolgee/web` `removeEventListener` in a timeout) firing after a jsdom environment was torn down, reported while `src/components/mobile/__test__/RevisionsList.test.tsx` was running. An immediate re-run was clean (exit 0). It's load- or timing-dependent and predates the timeline work's i18n changes; treat a lone occurrence as flaky, and re-run before blaming a PR. A real fix would stop Tolgee's timer in test teardown.

### 2026-10-01 · timeline-worker (timeline/p6-equality-corpus) · P6.6 · conversion equality

- **What:** converted shows were compared with page-mode playback (the app's keyframe code) at every page end, and at 4 or 5 beats inside each page at the same beat position (C-7). The millisecond difference on uneven-tempo pages is reported, not failed. Real shows are anonymized; only aggregates are recorded.
- **Generated show** (`conversionShow.ts`, 14 marchers, 10 pages):
  - Page ends: 151 of 151 exact.
  - Straight moves inside pages: within 1e-9.
  - The pathway and the damaged-file gap differ as expected (C-8; P6.7).
- **Show A:** 44 marchers, 69 pages.
  - Page ends: 3,080 of 3,080 exact (max 0, mean 0).
  - Inside pages: 11,968 samples, max 0, mean 0.
  - 14 pages with uneven tempo, where millisecond playback differs by up to 5.0 px (1.5e-10 on even pages).
  - Loss report: 1 curved shape; 0 pathways, midsets, dropped fields, missing rows, skipped pages or homes from a later page.
- **Show B:** 95 marchers, 23 pages.
  - Page ends: 2,280 of 2,280 exact.
  - Inside pages: 8,360 samples, max 0, mean 0.
  - 4 pages with uneven tempo, up to 35.1 px in milliseconds (3.7e-12 on even pages).
  - Loss report: 8 curved shapes and nothing else.
- **Jev** (`scripts/timeline/jev-equality`, 6 moments and up to 48 marchers per show, coordinates only): 12 of 12 real samples judged "same" (P ≥ 0.99), agreeing with the numeric verdict. 10 of 10 controls agree: the identical control got P 0.99; one marcher moved, two swapped, shifted and mirrored got P 0.02 to 0.15.
- **Reading:** on these two shows the converter is exact at page ends and identical between them at the same beat. The only visible change is timing inside uneven-tempo pages, where timeline motion follows beats (C-7). Curved shapes are kept only as their marchers' points (C-8).

### 2026-10-01 · lead · flaky: `timelineHistory.test.ts` "trigger already exists"

- **Seen once:** in a full desktop suite run on PR #40's head f905edda (`pnpm --dir apps/desktop run test`).
- **Failing test:** "C-1: RESTRICT with child-first deletes > deleting children, then the transition, then the timeline, undoes and redoes as one edit".
- **Error:** `malformed database schema (timelines_it) - trigger 'timelines_it' already exists` (`ERR_SQLITE_ERROR`, SQLite result code 11).
- **Not reproduced:** the file passed 3 times alone, and the full suite passed on the next run.
- **Likely cause:** a test database collision, either another vitest process in the same work tree or the history-trigger refresh racing within the file.
- **Next time:** if it recurs, check for concurrent vitest processes first, then look at `createTriggers`/`recreateChangeLogTriggers` in the test setup.

### 2026-10-01 · lead · flaky under load: `backup.test.ts` hook timeout

- **What failed:** in a full desktop suite run on PR #43's head, `backup.test.ts > a folder whose name looks like an error > still backs up` failed with "Hook timed out in 10000ms" in `beforeEach`. A follow-on `afterEach` error came from `oddDir` being undefined.
- **Conditions:** the run took 1,047 s against the usual ~130 s, while another worker's tests ran on the machine.
- **Rerun:** the file alone passed 21 of 21 twice.
- **Fix:** hardening the hook timeout and the `afterEach` guard was handed to the P9.3 worker, which is working in `electron/database`.

### 2026-10-01 · timeline-worker (timeline/p9-8-convert-worker) · P9.8 · convert-on-open timing and the bulk-insert path

- **Setup:** `electron/database/__test__/convertOnOpenPerf.test.ts` (opt-in: `OPENMARCH_PERF=1 pnpm exec vitest run electron/database/__test__/convertOnOpenPerf.test.ts`). It seeds a version-7 show with 400 marchers on 100 pages, every marcher on every page and the undo triggers (4.7 MB), then times `backupBeforeConversion` and `convertFileOnOpen` on the test's thread. Apple Silicon Mac, Node 24.14, vitest 4, one vitest process.
- **Before (base `timeline-try-2` 5644fe10, one INSERT … RETURNING per assignment):** backup 52 ms, conversion 3,791 ms. That matches P9.3's 3.9 s.
- **After (chunked multi-row inserts, 500 rows a statement; the row triggers still run per row):** backup 49–62 ms, conversion 1,430–1,486 ms (2.6 times faster).
  - Steps after: convert 1,327 ms, drain the change log 87 ms, the others under 5 ms each.
  - The rest of the convert step is the per-row change-log trigger work and the planner.
- **Off the main thread:** since P9.8 both run in a worker thread. In `convertWorkerHost.test.ts`, a 10 ms timer on the main thread kept firing through a conversion slowed to more than 1.2 s, and its longest gap stayed under 500 ms.
- **Not measured:** a 50 MB file. P9.2 measured 1–2 s for its backup, which now also runs in the worker.

### 2026-10-01 · timeline-worker (timeline/p9-8-convert-worker) · P9.8 · `vite.config.mjs` is the config Vite uses

`apps/desktop/vite.config.mjs` is checked in. It is tsc's output of `vite.config.mts`, and Vite loads `.mjs` before `.mts`. An edit to `vite.config.mts` alone doesn't change the app build: the P9.8 worker entry was missing from `dist-electron` until the `.mjs` was regenerated (`pnpm exec tsc -p tsconfig.node.json`, which also prints existing type errors and leaves a `tsconfig.node.tsbuildinfo` to delete; then prettier). `mainBundle.test.ts` now checks that both files build the worker.

### 2026-10-01 · timeline-worker (timeline/p9-8-convert-worker) · P9.8 · `vite.config.mjs` removed

Follow-up to the `vite.config.mjs` entry above. PR #44 removes the checked-in `vite.config.mjs` and `vite.config.d.mts`, so `vite.config.mts` is the config Vite uses again. `tsconfig.node.json` emits under `node_modules/.tmp`, `apps/desktop/.gitignore` lists the generated names, and `mainBundle.test.ts` fails if another Vite config shadows the `.mts`.

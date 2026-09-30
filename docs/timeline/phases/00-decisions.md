---
phase: 0
title: Decisions, ADR, spec in repo
status: in-progress
owner: timeline-worker (timeline/p0-adr)
branch: none
pr: none
depends_on: []
updated: 2026-09-29
---

# Phase 0: Decisions, ADR, spec in repo

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Put the spec and its evidence in the repo, and record the durable decisions (C-1 to C-8, replacing pages, the new `@openmarch/core` API, the file-format bump) in an ADR before any schema or API work starts.

## Read first

- [implementation-plan.md](../implementation-plan.md) §1 and §2
- `docs/conventions/architecture-decisions.md`, `docs/adr/README.md`
- Spec §4 (decision record), §6.1 (undo), §13 (open questions)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P0.1: Move the spec and ref/ into the repo

- Owner: timeline-worker (timeline/p0-spec)
- Status: in-review
- PR: https://github.com/OpenMarch/OpenMarch/pull/1034
- Parallel: yes
- Depends on: —

Move `openmarch-timeline-spec.md` to `docs/timeline/spec.md` and unzip `ref/` unchanged to `docs/timeline/ref/`; delete the root copies. The cspell and prettier ignore lists already cover `docs/timeline/spec.md` and `docs/timeline/ref/`; remove the entries for the root copy. Don't wire `ref/` into CI.

### P0.2: Baseline run of the reference suite

- Owner: timeline-worker (detached at origin/timeline/p0-spec)
- Status: done
- PR: none
- Parallel: yes
- Depends on: P0.1

Run `docs/timeline/ref/run_all.sh` once (Python 3 and Node 24) and log the result, as the baseline the TypeScript ports must match.

### P0.3: Draft ADR 0001

- Owner: timeline-worker (timeline/p0-adr)
- Status: claimed
- PR: none
- Parallel: yes
- Depends on: —

Draft `docs/adr/0001-timeline-motion-model.md`: replacing pages, C-1 to C-8, table names, where the resolver lives (`packages/core`), its public API, the change-log listener contract, the file-format bump, and verification.

### P0.4: Accept the ADR

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: P0.3

Accept the ADR (status `accepted`).

### P0.5: Send amendments to the spec's authors

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

Send C-1, C-2, C-3 and C-8 to the spec's authors as proposed amendments. Log each reply here, and update `implementation-plan.md` if a decision changes.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [x] The spec and `ref/` are under `docs/timeline/`, and the root copies are gone. The cspell and prettier ignore entries for them already exist
- [x] `run_all.sh` baseline result logged (P0.2)
- [ ] ADR 0001 has status `accepted`
- [ ] `pnpm check:agent-guidance`, plus prettier and cspell on the changed Markdown, pass

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- C-8 can stay open after this phase; it only blocks Phase 9. Track the reply in P0.5.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

- **2026-09-29 P0.1** (timeline-worker, timeline/p0-spec): Moved spec to docs/timeline/spec.md, unzipped ref/ to docs/timeline/ref/, deleted the zip, removed root spec ignore entries, updated WORKER.md and implementation-plan.md paths. Ran `pnpm format:check`, `pnpm spellcheck` (0 issues), `pnpm check:agent-guidance`: all pass. PR: https://github.com/OpenMarch/OpenMarch/pull/1034. Status in-review.

### 2026-09-29 · timeline-worker · P0.2

- **Done:** ran `docs/timeline/ref/run_all.sh` once as the baseline the TypeScript ports must match. Per-check output is in the block below (also recorded in `findings.md`).
- **Checks:** all 12 checks passed, including the two expected-failure runs (v0.1 fuzz and v0.6 range trigger), which reproduced their expected failures.
- **Next:** none for P0.2.
- **Blockers:** none.

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

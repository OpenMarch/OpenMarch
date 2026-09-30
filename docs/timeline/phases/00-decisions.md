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

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

Move `openmarch-timeline-spec.md` to `docs/timeline/spec.md` and unzip `ref/` unchanged to `docs/timeline/ref/`; delete the root copies. The cspell and prettier ignore lists already cover `docs/timeline/spec.md` and `docs/timeline/ref/`; remove the entries for the root copy. Don't wire `ref/` into CI.

### P0.2: Baseline run of the reference suite

- Owner: unassigned
- Status: open
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

- [ ] The spec and `ref/` are under `docs/timeline/`, and the root copies are gone. The cspell and prettier ignore entries for them already exist
- [ ] `run_all.sh` baseline result logged (P0.2)
- [ ] ADR 0001 has status `accepted`
- [ ] `pnpm check:agent-guidance`, plus prettier and cspell on the changed Markdown, pass

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- C-8 can stay open after this phase; it only blocks Phase 9. Track the reply in P0.5.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

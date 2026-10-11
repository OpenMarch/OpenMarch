---
phase: 0
title: Decisions and shared contracts
status: in-progress
owner: lead (3d-async)
branch: 3d-async
pr: none
depends_on: []
updated: 2026-10-04
---

# Phase 0: Decisions and shared contracts

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Record the durable decisions before any code, and land the dependencies and shared types so later phases can work in parallel.

## Read first

- [ADR 0002](../../adr/0002-3d-view.md)
- [../plan.md](../plan.md), [../design.md](../design.md)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P0.1: Draft ADR 0002

- Owner: lead (3d-async)
- Status: done
- PR: none
- Parallel: yes
- Depends on: —

Write `docs/adr/0002-3d-view.md` from the owner's decisions of 2026-10-03 and 2026-10-04.

### P0.2: Accept ADR 0002

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: P0.1

The project owner reads the ADR and sets its status to `accepted`, or asks for changes. Phase 1 and 2 packages may start while this is open, but anything that contradicts a change the owner asks for gets reworked.

### P0.3: Dependencies, shared types and the reference demo

- Owner: lead (3d-async)
- Status: done
- PR: none
- Parallel: yes
- Depends on: —

Add `three`, `@react-three/fiber`, `@react-three/drei` and `@types/three` to `apps/desktop`. Add `apps/desktop/src/view3d/core/types.ts`. Add the approved demo as `docs/3d/ref/venue-demo.html`. Add the worker tooling: `scripts/3d/`, `.claude/skills/3d-work/` and `.claude/agents/3d-worker.md`.

## Exit gate

- [x] ADR 0002 drafted.
- [ ] ADR 0002 accepted by the project owner.
- [x] Dependencies installed and `types.ts` type-checks (`pnpm --dir apps/desktop exec tsc --noEmit`).

## Handoff notes

The coordination branch is `3d-async` on the fork. Phase 0 landed directly on it, as the bootstrap commit. From Phase 1 on, code goes through PRs.

## Progress log

### 2026-10-04 · lead · P0.1, P0.3

- **Done:** drafted `docs/adr/0002-3d-view.md` (status proposed). Added `three` 0.186, `@react-three/fiber` 9.8, `@react-three/drei` 10.7 and `@types/three` to `apps/desktop`; `apps/desktop/src/view3d/core/types.ts`; the docs in `docs/3d/`; the reference demo in `docs/3d/ref/`; `scripts/3d/coord.sh` and `run-worker.sh`; the `3d-work` skill and `3d-worker` agent. Excluded `docs/3d/ref/` from Prettier and cspell, and added the new words to the dictionary.
- **Checks:** `pnpm --filter "@openmarch/desktop^..." build` passed; `pnpm --dir apps/desktop exec tsc --noEmit` passed; `eslint src/view3d` passed; `prettier --check` on the new files passed; `cspell` on the new files found 0 issues; `pnpm check:agent-guidance` passed.
- **Next:** the project owner accepts ADR 0002 (P0.2). Wave 1 workers start P1.1, P1.2, P1.3 and P2.2.
- **Blockers:** none.

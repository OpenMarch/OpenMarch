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
- Status: claimed
- PR: none
- Parallel: no
- Depends on: —

`timeline/types.ts`: the §10.1 types (`Beat`, `XY`, `SpanKind`, `SpanInfo`, `OrderSource`, `FtlEntryInfo`, `Explanation`, `Diagnostic`, `ChangeBatch`, `Counters`, `Resolver`) plus the input show shape used by `ref/` (`marchers`, `shapes`, `transitions`, `assignments`, destinations).

### P1.2: Geometry

- Owner: timeline-worker (timeline/p1-geometry)
- Status: claimed
- PR: none
- Parallel: no
- Depends on: P1.1

`timeline/geom.ts`: endpoint-exact `lerp`; `arcPoint` in chord form with `ε_geom` (R-8); `pointAtDistance` (§8.10); `sampleDestinations` for every kind plus individual destinations, and the exact `destPath` (R-13); `flatten` (R-2); span classification (R-3). Float64 throughout.

### P1.3: Oracle

- Owner: timeline-worker (timeline/p1-geometry)
- Status: claimed
- PR: none
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
- [ ] `pnpm --dir packages/core run build` passes
- [ ] `pnpm --dir packages/core run test` passes
- [ ] Desktop still builds against the new core (`pnpm --dir apps/desktop exec tsc --noEmit`)

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- Don't reuse `path-utility` for arcs; it isn't closed-form. P1.4 can start as soon as P1.1 lands.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

---
phase: 5
title: MVP validation
status: not-started
owner: none
branch: none
pr: none
depends_on: [3, 4]
updated: 2026-10-04
---

# Phase 5: MVP validation

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Measure against the budgets, run the validation plan, and get the owner's verdict.

## Read first

- [../validation-plan.md](../validation-plan.md), [../findings.md](../findings.md), [../design.md](../design.md) §9

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P5.1: Performance pass

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P4.2

Measure frame time, draw calls and build time per kit with 300 performers; add the `low` quality tier and the automatic fallback (design §9); record results in `findings.md`.

### P5.2: Validation run

- Owner: lead
- Status: open
- PR: none
- Parallel: no
- Depends on: P4.3, P5.1

Run V1–V6 from the validation plan, record evidence in its log, and send the recordings to the project owner.

### P5.3: Owner verdict

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: P5.2

The project owner accepts the MVP or lists what must change.

## Exit gate

- [ ] Budgets met or exceptions recorded in `findings.md`.
- [ ] V1–V6 pass.
- [ ] The project owner accepts the MVP.

## Handoff notes

Nothing yet.

## Progress log

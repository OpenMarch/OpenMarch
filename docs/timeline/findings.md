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

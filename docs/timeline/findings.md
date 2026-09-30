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

# Reference implementation: OpenMarch timeline resolution model, spec v0.7

This folder backs the claims in `openmarch-timeline-spec.md` (§12.10). It is a test instrument, not production code.

| File | Contents | Spec |
|---|---|---|
| `schema.sql` | DDL: `STRICT` tables, individual destinations, invariant triggers (checks only, no row rewrites), commit-time checks, change log | §5.1, §6, §10.2 |
| `history.py`, `history.mjs` | The app's undo model on `history_undo` / `history_redo` / `history_stats`: inverse-SQL triggers, undo, redo, group-limit pruning, all inside the write wrapper. Also the R-E1 range procedure. | §6.1 |
| `undo_tests.py` | Undo and redo tests, including the negative control that reproduces the v0.6 trigger bug | QA-UNDO |
| `db_tests.py` | Storage tests, run against real SQLite | QA-DB |
| `geom.mjs` | Shared, stateless geometry: flattening, arcs, sampling, degenerate cases | R-2, R-8, R-13, §8.10 |
| `oracle.mjs` | Uncached reference oracle | §8 |
| `resolver.mjs` | Cached, incremental resolver with its own row index. `makeResolver(db, { rules: 'v0.1' })` reproduces the original invalidation rules. | §9, §10.2 |
| `golden.mjs` | Golden vectors, checked against both the oracle and the resolver | G1–G12 |
| `regress.mjs` | Review regressions and degenerate-geometry goldens. Known v0.1 failures are marked as expected. | QA-REG, QA-DG |
| `props.mjs` | Direct property checks with independent geometry and boundary-valued shows | §12.5 |
| `mutate.py` | Mutation test: re-introduces nine known bugs; a named property must catch each | §12.10 |
| `fuzz.mjs` | Differential fuzzer: resolver vs oracle under random edit batches | QA-INV-08 |
| `e2e.mjs` | End-to-end fuzzer: random SQL edits, undos and redos, then SQLite, then the change log, then the resolver. `--v06-anchor` restores the v0.6 range trigger as a negative control. | QA-INV-09, QA-UNDO-9 |
| `cx.mjs` | Counter-based complexity checks, plus the informational timing CX-06 | QA-CX |
| `deep.mjs` | Deep chains (20,000 direct, 5,000 FTL) queried cold on a deliberately small stack | QA-REG-6 |
| `run_all.sh` | Runs everything. Exits non-zero on any unexpected result. | §12.10 |

## Run

You need Python 3 with its built-in `sqlite3` (SQLite 3.37 or later) and Node 22 or later. Nothing needs installing.

```sh
./run_all.sh                      # the gate: runs everything below; exit status 0 = all as expected

python3 db_tests.py
python3 undo_tests.py
node golden.mjs
node regress.mjs
node props.mjs 300                # ordinary, boundary-valued and adversarial arc-chain shows
python3 mutate.py                 # a named property must catch each of nine seeded bugs
node fuzz.mjs v0.2+ 1000 80       # rules, seeds, steps per seed
node fuzz.mjs v0.1 300 60 --expect-fail   # reproduces the first review's findings
node --no-warnings e2e.mjs 600 80
node --no-warnings e2e.mjs 300 80 --v06-anchor --expect-fail   # reproduces the undo review finding
node cx.mjs
node --stack-size=300 deep.mjs    # deep chains must not depend on stack size
```

Every script exits non-zero on an unexpected failure.

All randomness is seeded (mulberry32), so every run reproduces exactly.

## Data shape used by the oracle and the resolver

```js
{
  marchers:    [{ id, home: [x, y] }],
  shapes:      { [id]: { kind, geometry } },
  transitions: { [id]: { id, start, end, dest, slots, style, order, params } },
  assignments: [{ id, marcher, transition, slot, start, end, layer }]
}
```

`e2e.mjs` shows how to load this from the database (`load`) and how to turn a committed change log into a batch (`toBatch`).

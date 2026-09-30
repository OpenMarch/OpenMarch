#!/usr/bin/env bash
# Runs every check behind the spec (§12.10). Exits non-zero if any check fails unexpectedly.
# The v0.1 fuzz run and the v0.6-trigger e2e run are EXPECTED to find failures; each fails the gate only if it finds none.
set -u
cd "$(dirname "$0")"
status=0
run() { local name="$1"; shift; printf '%-34s ' "$name"; if out=$("$@" 2>&1); then echo "ok    $(echo "$out" | tail -1 | cut -c1-90)"; else echo "FAIL"; echo "$out" | tail -15; status=1; fi; }
run "storage (db_tests.py)"          python3 db_tests.py
run "undo and redo (undo_tests.py)"  python3 undo_tests.py
run "golden vectors"                 node golden.mjs
run "regressions + degenerate"       node regress.mjs
run "properties (props.mjs)"         node props.mjs 300
run "mutation test of props.mjs"     python3 mutate.py
run "differential fuzz, v0.2+ rules" node fuzz.mjs v0.2+ 1000 80
run "differential fuzz, v0.1 rules"  node fuzz.mjs v0.1 300 60 --expect-fail
run "end-to-end SQLite fuzz + undo"  node --no-warnings e2e.mjs 600 80
run "end-to-end, v0.6 range trigger" node --no-warnings e2e.mjs 300 80 --v06-anchor --expect-fail
run "complexity counters"            node cx.mjs
run "deep chains, small stack"       node --stack-size=300 deep.mjs
exit $status

// QA-REG-6 (fourth review): deep chains must work cold, without warming, on a deliberately small stack.
// run_all.sh runs this with `node --stack-size=300`. usage: node deep.mjs [N=20000]
import { makeResolver } from './resolver.mjs';

const N = +(process.argv[2] ?? 20000);
let fails = 0;
const report = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const dest = (i) => [(i * 37) % 101 - 50, (i * 53) % 89 - 44];

// (a) direct chain, each transition half-completed, so the end position depends on every upstream span
const db = { marchers: [{ id: 1, home: [0, 0] }], shapes: {}, transitions: {}, assignments: [] };
for (let i = 0; i < N; i++) {
  const [x, y] = dest(i);
  db.shapes[i + 1] = { kind: 'line', geometry: { points: [[x, y], [x + 1, y]] } };
  db.transitions[i + 1] = { id: i + 1, start: 2 * i, end: 2 * i + 2, dest: i + 1, slots: 1, style: 'direct', order: 'inherit', params: null };
  db.assignments.push({ id: i + 1, marcher: 1, transition: i + 1, slot: 0, start: 2 * i, end: 2 * i + 1, layer: 0 });
}
const reference = () => { let p = [0, 0]; for (let i = 0; i < N; i++) { const [x, y] = db.shapes[i + 1].geometry.points[0]; p = [p[0] + (x - p[0]) * 0.5, p[1] + (y - p[1]) * 0.5]; } return p; };
const close = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

const res = makeResolver(db);
let got, err = null;
try { got = res.positionAt(1, 2 * N + 5); } catch (e) { err = e.message; }
report(!err && close(got, reference()), `cold query at the end of ${N} half-completed direct transitions ${err ? '-> ' + err : 'matches an independent loop'}`);

db.shapes[1].geometry.points = [[40, 40], [41, 40]];            // edit the FIRST shape: the whole chain must be dirtied
try { res.applyBatch({ shapes: [1] }); got = res.positionAt(1, 2 * N + 5); err = null; } catch (e) { err = e.message; }
const c = res.counters();
report(!err && close(got, reference()), `editing the first shape re-resolves the end correctly ${err ? '-> ' + err : `(dirty walk visited ${c.dirtyVisits} nodes)`}`);

// (b) follow-the-leader chain: 2 marchers through N/4 consecutive 2-slot FTL transitions (inherit order)
const K = Math.floor(N / 4);
const f = { marchers: [{ id: 1, home: [0, 0] }, { id: 2, home: [1, 0] }], shapes: {}, transitions: {}, assignments: [] };
for (let i = 1; i <= K; i++) {
  f.shapes[i] = { kind: 'line', geometry: { points: [[i % 9, i % 4], [i % 9 + 1, i % 4 + 1]] } };
  f.transitions[i] = { id: i, start: 2 * (i - 1), end: 2 * i, dest: i, slots: 2, style: 'follow_the_leader', order: 'inherit', params: { waypoints: [] } };
  f.assignments.push({ id: 2 * i - 1, marcher: 1, transition: i, slot: 0, start: 2 * (i - 1), end: 2 * i, layer: 0 },
                     { id: 2 * i, marcher: 2, transition: i, slot: 1, start: 2 * (i - 1), end: 2 * i, layer: 0 });
}
try {
  const r = makeResolver(f), a = r.positionAt(1, 2 * K), b = r.positionAt(2, 2 * K);
  const last = f.shapes[K].geometry.points, ends = [a, b].map((p) => JSON.stringify(p)).sort(), want = last.map((p) => JSON.stringify(p)).sort();
  report(JSON.stringify(ends) === JSON.stringify(want), `cold query at the end of ${K} chained FTL transitions lands on the last shape's two points`);
} catch (e) { report(false, `FTL chain of ${K}: ${e.message}`); }

console.log(`${fails ? fails + ' failed' : 'all deep-chain checks pass'}`);
if (fails) process.exitCode = 1;

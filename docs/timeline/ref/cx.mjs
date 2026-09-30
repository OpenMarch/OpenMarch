// Counter-based complexity checks (QA-CX-01, -02, -03, -05).
import { makeResolver } from './resolver.mjs';
let cxFail = 0; const verdict = (ok) => { if (!ok) cxFail++; return ok ? 'PASS' : 'FAIL'; };
let RID = 1;
const row = (marcher, transition, slot, start, end, layer = 0) => ({ id: RID++, marcher, transition, slot, start, end, layer });

// Ladder: 2 marchers through K consecutive 2-slot FTL transitions (2^K dependency paths)
function ladder(K) {
  const db = { marchers: [{ id: 1, home: [0, 0] }, { id: 2, home: [1, 0] }], shapes: {}, transitions: {}, assignments: [] };
  for (let i = 1; i <= K; i++) {
    db.shapes[i] = { kind: 'line', geometry: { points: [[i * 3, 0], [i * 3 + 1, 1]] } };
    db.transitions[i] = { id: i, start: (i - 1) * 4, end: i * 4, dest: i, slots: 2, style: 'follow_the_leader', order: 'inherit', params: { waypoints: [] } };
    db.assignments.push(row(1, i, 0, (i - 1) * 4, i * 4), row(2, i, 1, (i - 1) * 4, i * 4));
  }
  return db;
}
const K = 20, db = ladder(K), res = makeResolver(db);
const spansTotal = db.marchers.reduce((a, m) => a + res.spans(m.id).length, 0);
res.resetCounters(); res.warmAll(); for (let t = 1; t <= K; t++) res.entry(t);
let c = res.counters();
console.log(`CX-01 ladder cold: originsComputed=${c.originsComputed} (spans=${spansTotal}), ftlEntriesComputed=${c.ftlEntriesComputed} (FTL=${K})`,
  verdict(c.originsComputed === spansTotal && c.ftlEntriesComputed === K)) ;
res.resetCounters(); for (const m of db.marchers) res.positionAt(m.id, 37); c = res.counters();
console.log(`CX-02 warm query: originsComputed=${c.originsComputed} ftlEntriesComputed=${c.ftlEntriesComputed} spanLookups=${c.spanLookups}`,
  verdict(c.originsComputed === 0 && c.ftlEntriesComputed === 0 && c.spanLookups === 2)) ;
res.resetCounters();
db.shapes[1].geometry.points = [[3, 5], [4, 6]]; res.applyBatch({ rows: [], transitions: [], shapes: [1], marchers: [] });
c = res.counters();
const nodes = spansTotal + K;
console.log(`CX-03/05 ladder edit: dirtyVisits=${c.dirtyVisits} = originsDirtied ${c.originsDirtied} + entriesDirtied ${c.ftlEntriesDirtied}; nodes=${nodes}; paths≈2^${K}`,
  verdict(c.dirtyVisits === c.originsDirtied + c.ftlEntriesDirtied && c.dirtyVisits <= nodes)) ;
// the same walk without W-4 would visit once per path: count paths in the dependency DAG from the seeds

// CX-06 (informational, wall clock): warm per-member evaluation cost must not grow with FTL member count
function bigFtl(m) {
  const db = { marchers: [], shapes: { 1: { kind: 'circle', geometry: { center: [0, 0], radius: 50, start_angle: 0, clockwise: false } } },
    transitions: { 1: { id: 1, start: 0, end: 8, dest: 1, slots: m, style: 'follow_the_leader', order: 'slot', params: { waypoints: [] } } }, assignments: [] };
  for (let i = 1; i <= m; i++) { db.marchers.push({ id: i, home: [-i, 0] }); db.assignments.push(row(i, 1, i - 1, 0, 8)); }
  const r = makeResolver(db); r.warmAll(); for (const x of db.marchers) r.positionAt(x.id, 4);
  const t0 = performance.now(); let n = 0;
  for (let rep = 0; rep < Math.ceil(200000 / m); rep++) for (const x of db.marchers) { r.positionAt(x.id, 4 + (rep % 7) * 0.5); n++; }
  return (performance.now() - t0) * 1e6 / n;   // ns per evaluation
}
const small = bigFtl(50), large = bigFtl(5000);
console.log(`CX-06 warm FTL evaluation: ${small.toFixed(0)} ns/member at m=50, ${large.toFixed(0)} ns/member at m=5000 (ratio ${(large / small).toFixed(2)}; informational)`);
if (cxFail) process.exitCode = 1;

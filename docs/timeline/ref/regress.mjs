// Directed regression tests for the v0.1 review findings, plus degenerate-geometry goldens (§8.10).
// usage: node regress.mjs
import { makeOracle } from './oracle.mjs';
import { makeResolver } from './resolver.mjs';

let RID = 100;
const P = (x, y) => ({ kind: 'line', geometry: { points: [[x, y], [x + 1, y]] } });
const row = (marcher, transition, slot, start, end, layer = 0) => ({ id: RID++, marcher, transition, slot, start, end, layer });
const fmt = (p) => `(${+p[0].toFixed(4)}, ${+p[1].toFixed(4)})`;
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const results = [];
const record = (id, desc, ok, detail = '') => results.push({ id, desc, ok, detail });

function warm(res, db) { for (const m of db.marchers) for (let b = -1; b <= 20; b += 0.5) res.positionAt(m.id, b); }
function agrees(res, db) {
  const o = makeOracle(db);
  for (const m of db.marchers) for (let b = -1; b <= 20; b += 0.5) {
    let x; try { x = res.positionAt(m.id, b); } catch (e) { return `exception: ${e.message}`; }
    const y = o.positionAt(m.id, b);
    if (!same(x, y)) return `M${m.id}@${b}: resolver ${fmt(x)} vs oracle ${fmt(y)}`;
  }
  return true;
}

// ---- REG-1 (review finding 1): inserting a lower-slot FTL joiner must re-target an existing joiner
function reg1(rules) {
  const db = {
    marchers: [{ id: 1, home: [0, 0] }, { id: 2, home: [2, 0] }, { id: 3, home: [4, 0] }, { id: 4, home: [-2, 0] }],
    shapes: { 1: { kind: 'line', geometry: { points: [[6, 2], [6, 8]] } } },
    transitions: { 1: { id: 1, start: 4, end: 12, dest: 1, slots: 4, style: 'follow_the_leader', order: 'slot', params: { waypoints: [] } } },
    assignments: [row(2, 1, 0, 4, 12), row(3, 1, 1, 4, 12), row(1, 1, 3, 8, 12)],   // founders M2, M3; joiner M1 in slot 3
  };
  const res = makeResolver(db, { rules }); warm(res, db);
  const before = res.positionAt(1, 12);                  // M1 alone as joiner -> p1 = (6,4)
  const r = row(4, 1, 2, 8, 12); db.assignments.push(r); // joiner M4 in slot 2 (lower than M1's slot 3)
  res.applyBatch({ rows: [{ before: null, after: r }] });
  const after = res.positionAt(1, 12);                   // M1 must move to p0 = (6,2)
  return { before, after, agree: agrees(res, db) };
}

// ---- REG-2 (review finding 2): a higher-layer row that turns an FTL founder into a joiner must update T's index
function reg2(rules) {
  const db = {
    marchers: [{ id: 1, home: [0, 0] }, { id: 2, home: [2, 0] }, { id: 3, home: [4, 0] }],
    shapes: { 1: { kind: 'line', geometry: { points: [[6, 2], [6, 8]] } }, 2: P(20, 20) },
    transitions: {
      1: { id: 1, start: 0, end: 8, dest: 1, slots: 3, style: 'follow_the_leader', order: 'slot', params: { waypoints: [] } },
      2: { id: 2, start: 0, end: 4, dest: 2, slots: 1, style: 'direct', order: 'inherit', params: null },
    },
    assignments: [row(1, 1, 0, 0, 8), row(2, 1, 1, 0, 8), row(3, 1, 2, 0, 8)],
  };
  const res = makeResolver(db, { rules }); warm(res, db);
  const r = row(1, 2, 0, 0, 4, 1); db.assignments.push(r);   // steal M1 at T1's start: its T1 span becomes a join
  res.applyBatch({ rows: [{ before: null, after: r }] });
  return { agree: agrees(res, db), members: (() => { try { return res.entry(1).members; } catch (e) { return e.message; } })() };
}

// ---- REG-3 (found by e2e fuzz): deleting a marcher whose FTL row is fully overridden must re-target joiners
function reg3(rules) {
  const db = {
    marchers: [1, 2, 3, 5].map((id) => ({ id, home: [id, 0] })),
    shapes: { 1: { kind: 'line', geometry: { points: [[6, 2], [6, 8]] } }, 2: P(20, 20) },
    transitions: {
      1: { id: 1, start: 4, end: 12, dest: 1, slots: 4, style: 'follow_the_leader', order: 'slot', params: { waypoints: [] } },
      2: { id: 2, start: 8, end: 12, dest: 2, slots: 1, style: 'direct', order: 'inherit', params: null },
    },
    assignments: [row(2, 1, 0, 4, 12), row(3, 1, 1, 4, 12), row(5, 1, 2, 8, 12), row(1, 1, 3, 8, 12), row(5, 2, 0, 8, 12, 1)],
  };
  const res = makeResolver(db, { rules }); warm(res, db);
  const before = res.positionAt(1, 12);                          // M5 (slot 2, fully overridden) still reserves p1 -> M1 gets p0
  const gone = db.assignments.filter((r) => r.marcher === 5);
  db.marchers = db.marchers.filter((m) => m.id !== 5); db.assignments = db.assignments.filter((r) => r.marcher !== 5);
  res.applyBatch({ rows: gone.map((r) => ({ before: r, after: null })), marchers: [{ id: 5 }] });
  return { before, after: res.positionAt(1, 12), agree: agrees(res, db) };
}


// ---- REG-4 (second review): layering elsewhere changes FTL targets although T's rows are unchanged
function reg4(rules) {
  const db = {
    marchers: [{ id: 1, home: [0, 0] }, { id: 2, home: [2, 0] }],
    shapes: { 1: { kind: 'line', geometry: { points: [[6, 2], [6, 8]] } }, 2: P(20, 20) },
    transitions: {
      1: { id: 1, start: 0, end: 8, dest: 1, slots: 2, style: 'follow_the_leader', order: 'slot', params: { waypoints: [] } },
      2: { id: 2, start: 0, end: 4, dest: 2, slots: 1, style: 'direct', order: 'inherit', params: null },
    },
    assignments: [row(1, 1, 0, 0, 8), row(2, 1, 1, 0, 8)],
  };
  const res = makeResolver(db, { rules }); warm(res, db);
  const before = res.positionAt(1, 8);                       // founders M1, M2: M1 -> p0 = (6,2)
  const r = row(2, 2, 0, 0, 4, 1); db.assignments.push(r);   // override M2 at T1's start: M1 sole founder -> p1
  res.applyBatch({ rows: [{ before: null, after: r }] });
  return { before, after: res.positionAt(1, 8), agree: agrees(res, db) };
}

// ---- REG-5 (third review): 40 and 1,000 chained partial arcs from (1e6, 0) toward (0, 0), then a direct move to (1, 1)
function reg5(N, bulge) {
  const db = { marchers: [{ id: 1, home: [1e6, 0] }], shapes: { 1: P(0, 0), 2: P(1, 1) }, transitions: {}, assignments: [] };
  for (let i = 0; i < N; i++) {
    db.transitions[i + 1] = { id: i + 1, start: i, end: i + 2, dest: 1, slots: 1, style: 'arc', order: 'inherit', params: { bulge } };
    db.assignments.push(row(1, i + 1, 0, i, i + 1));
  }
  db.transitions[N + 1] = { id: N + 1, start: N, end: N + 4, dest: 2, slots: 1, style: 'direct', order: 'inherit', params: null };
  db.assignments.push(row(1, N + 1, 0, N, N + 4));
  const res = makeResolver(db); let maxNorm = 0;
  for (let b = 0; b <= N; b += 0.5) { const p = res.positionAt(1, b); maxNorm = Math.max(maxNorm, Math.hypot(p[0], p[1])); }
  const beta = Math.hypot(1e6, 0) + 1;       // largest authored point
  return { maxNorm, bound: beta * Math.sqrt(1 + N), arrive: res.positionAt(1, N + 4) };
}

for (const rules of ['v0.1', 'v0.2+']) {
  const a = reg1(rules);
  record(`REG-1 ${rules}`, 'FTL joiner re-targeted after lower-slot joiner inserted',
    same(a.after, [6, 2]) && a.agree === true, `M1@12 before ${fmt(a.before)}, after ${fmt(a.after)} (expect (6,2)); oracle agreement: ${a.agree}`);
  const b = reg2(rules);
  record(`REG-2 ${rules}`, 'FTL founder turned joiner by a higher layer leaves the founding set',
    b.agree === true && JSON.stringify(b.members) === '[2,3]', `members ${JSON.stringify(b.members)} (expect [2,3]); oracle agreement: ${b.agree}`);
  const d = reg4(rules);
  record(`REG-4 ${rules}`, 'layering elsewhere re-allocates FTL targets (T1 rows unchanged)',
    same(d.before, [6, 2]) && same(d.after, [6, 8]) && d.agree === true, `M1@8 before ${fmt(d.before)} (expect (6,2)), after ${fmt(d.after)} (expect (6,8)); oracle agreement: ${d.agree}`);
  if (rules === 'v0.1') continue;
  const c = reg3(rules);
  record(`REG-3 ${rules}`, 'deleting a marcher with a fully overridden FTL row re-targets the remaining joiner',
    same(c.before, [6, 2]) && same(c.after, [6, 4]) && c.agree === true, `M1@12 before ${fmt(c.before)} (expect (6,2)), after ${fmt(c.after)} (expect (6,4)); oracle agreement: ${c.agree}`);
}

for (const N of [40, 1000]) {
  const r = reg5(N, 0.5);
  record(`REG-5 N=${N}`, `${N} chained partial minor arcs stay within β√(1+a); the next direct move arrives exactly`,
    r.maxNorm <= r.bound && r.arrive[0] === 1 && r.arrive[1] === 1,
    `max |P| ${r.maxNorm.toExponential(3)} ≤ bound ${r.bound.toExponential(3)}; arrives at ${fmt(r.arrive)}`);
}
{ const r = reg5(40, 2);   // informational: what the v0.3 limit (|bulge| <= 2) allowed; the schema now rejects it
  console.log(`info  REG-5 with bulge 2 (now rejected by the schema): max |P| ${r.maxNorm.toExponential(3)}, direct move arrives at ${fmt(r.arrive)}`); }

// ---- degenerate geometry goldens (§8.10): computed by the oracle, resolver must agree, nothing may be NaN
function golden(id, desc, db, probes) {
  const o = makeOracle(db), res = makeResolver(db);
  const vals = probes.map(([m, b]) => o.positionAt(m, b));
  const finite = vals.every((v) => Number.isFinite(v[0]) && Number.isFinite(v[1]));
  const agree = agrees(res, db);
  record(id, desc, finite && agree === true, probes.map(([m, b], i) => `M${m}@${b}=${fmt(vals[i])}`).join('  ') + (agree === true ? '' : `  ${agree}`));
}
const ftl = (extra = {}) => ({ id: 1, start: 0, end: 8, dest: 1, slots: 1, style: 'follow_the_leader', order: 'slot', params: { waypoints: [] }, ...extra });

golden('DG-1', 'one-slot FTL: leader lands on the entrance point (t0 = 0)', {
  marchers: [{ id: 1, home: [0, 0] }], shapes: { 1: { kind: 'line', geometry: { points: [[4, 0], [4, 6]] } } },
  transitions: { 1: ftl() }, assignments: [row(1, 1, 0, 0, 8)] }, [[1, 4], [1, 8]]);

golden('DG-2', 'coincident founders (zero-length trail segment between them)', {
  marchers: [{ id: 1, home: [0, 0] }, { id: 2, home: [0, 0] }], shapes: { 1: { kind: 'line', geometry: { points: [[2, 0], [2, 4]] } } },
  transitions: { 1: ftl({ slots: 2 }) }, assignments: [row(1, 1, 0, 0, 8), row(2, 1, 1, 0, 8)] }, [[1, 0], [2, 0], [1, 4], [2, 4], [1, 8], [2, 8]]);

golden('DG-3', 'repeated waypoints and a leader already standing on the entrance', {
  marchers: [{ id: 1, home: [0, 0] }, { id: 2, home: [2, 2] }], shapes: { 1: { kind: 'line', geometry: { points: [[2, 2], [2, 6]] } } },
  transitions: { 1: ftl({ slots: 2, params: { waypoints: [[2, 2], [2, 2]] } }) }, assignments: [row(1, 1, 0, 0, 8), row(2, 1, 1, 0, 8)] }, [[1, 4], [2, 4], [1, 8], [2, 8]]);

golden('DG-4', 'FTL with no founding members (all joiners): D-FTL-EMPTY, joiners fill from the far end', {
  marchers: [{ id: 1, home: [0, 0] }, { id: 2, home: [0, 2] }], shapes: { 1: { kind: 'line', geometry: { points: [[4, 0], [4, 6]] } } },
  transitions: { 1: ftl({ slots: 2 }) }, assignments: [row(1, 1, 0, 4, 8), row(2, 1, 1, 4, 8)] }, [[1, 6], [2, 6], [1, 8], [2, 8]]);

golden('DG-5', 'freehand destination with zero-length segments and a return to its start', {
  marchers: [{ id: 1, home: [0, 0] }, { id: 2, home: [-2, 0] }, { id: 3, home: [-4, 0] }],
  shapes: { 1: { kind: 'freehand', geometry: { points: [[0, 2], [0, 2], [4, 2], [4, 2], [0, 2]] } } },
  transitions: { 1: ftl({ slots: 3 }) }, assignments: [row(3, 1, 0, 0, 8), row(2, 1, 1, 0, 8), row(1, 1, 2, 0, 8)] }, [[1, 4], [2, 4], [3, 4], [1, 8], [2, 8], [3, 8]]);

golden('DG-6', 'arc where origin equals destination (degenerate chord)', {
  marchers: [{ id: 1, home: [3, 3] }], shapes: { 1: P(3, 3) },
  transitions: { 1: { id: 1, start: 0, end: 8, dest: 1, slots: 1, style: 'arc', order: 'inherit', params: { bulge: 0.5 } } },
  assignments: [row(1, 1, 0, 0, 8)] }, [[1, 4]]);

golden('DG-7', 'inherit ignores FTL slot numbering for founders but NOT for joiners', {
  marchers: [1, 2, 3, 4].map((id, i) => ({ id, home: [2 * i, 0] })),
  shapes: { 1: { kind: 'line', geometry: { points: [[0, 0], [4, 0]] } }, 2: { kind: 'line', geometry: { points: [[6, 2], [6, 8]] } } },
  transitions: {
    1: { id: 1, start: 0, end: 4, dest: 1, slots: 3, style: 'direct', order: 'inherit', params: null },
    2: { id: 2, start: 4, end: 12, dest: 2, slots: 4, style: 'follow_the_leader', order: 'inherit', params: { waypoints: [] } },
  },
  assignments: [row(1, 1, 0, 0, 4), row(2, 1, 1, 0, 4), row(3, 1, 2, 0, 4),
                row(1, 2, 3, 4, 12), row(2, 2, 1, 4, 12), row(3, 2, 2, 4, 12), row(4, 2, 0, 8, 12)] },
  [[1, 12], [2, 12], [3, 12], [4, 12]]);

const XFAIL = new Set(['REG-1 v0.1', 'REG-2 v0.1', 'REG-4 v0.1']);             // the v0.1 rules are expected to fail these
let unexpected = 0;
for (const r of results) {
  const expectedFail = XFAIL.has(r.id);
  const tag = r.ok ? (expectedFail ? 'XPASS' : 'PASS') : (expectedFail ? 'XFAIL' : 'FAIL');
  if (tag === 'FAIL' || tag === 'XPASS') unexpected++;
  console.log(`${tag.padEnd(5)} ${r.id.padEnd(12)} ${r.desc}\n        ${r.detail}`);
}
console.log(`${results.filter((r) => r.ok && !XFAIL.has(r.id)).length} pass, ${results.filter((r) => !r.ok && XFAIL.has(r.id)).length} expected v0.1 failures, ${unexpected} unexpected`);
if (unexpected) process.exitCode = 1;

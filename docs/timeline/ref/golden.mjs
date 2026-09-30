// Golden vectors G1–G12 (spec §12.4). Asserts the oracle AND the cached resolver against the spec's tables.
// usage: node golden.mjs
import { makeOracle } from './oracle.mjs';
import { makeResolver } from './resolver.mjs';

let RID = 1;
const P = (x, y) => ({ kind: 'line', geometry: { points: [[x, y], [x + 1, y]] } });   // slot_count 1 -> (x,y)
const tr = (id, start, end, dest, extra = {}) => ({ id, start, end, dest, slots: 1, style: 'direct', order: 'inherit', params: null, ...extra });
const row = (marcher, transition, slot, start, end, layer = 0) => ({ id: RID++, marcher, transition, slot, start, end, layer });
const tol = { G8: 1e-4 };
let pass = 0, fail = 0;

function check(name, db, expected, extra) {
  const o = makeOracle(db), r = makeResolver(db), eps = tol[name] ?? 1e-6;
  const bad = [];
  for (const [m, b, x, y] of expected) for (const [who, impl] of [['oracle', o], ['resolver', r]]) {
    const p = impl.positionAt(m, b);
    if (!(Math.abs(p[0] - x) < eps && Math.abs(p[1] - y) < eps)) bad.push(`${who} M${m}@${b}=(${p[0].toFixed(4)},${p[1].toFixed(4)}) expected (${x},${y})`);
  }
  if (extra) bad.push(...extra(o, r));
  bad.length ? fail++ : pass++;
  console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${name}${bad.length ? '\n   ' + bad.join('\n   ') : ''}`);
}
const entryIs = (tid, members, source, endDist) => (o, r) => [o, r].flatMap((impl) => {
  const e = impl.ftlEntry ? impl.ftlEntry(tid) : impl.entry(tid);
  const out = [];
  if (JSON.stringify(e.members) !== JSON.stringify(members)) out.push(`members ${JSON.stringify(e.members)} expected ${JSON.stringify(members)}`);
  if (e.source.kind !== source) out.push(`order source ${e.source.kind} expected ${source}`);
  if (endDist && e.endDist.some((d, i) => Math.abs(d - endDist[i]) > 1e-4)) out.push(`endDist ${e.endDist.map((d) => d.toFixed(4))} expected ${endDist}`);
  return out;
});

check('G1', { marchers: [{ id: 1, home: [0, 0] }], shapes: { 1: P(16, 0) }, transitions: { 1: tr(1, 0, 16, 1) }, assignments: [row(1, 1, 0, 0, 16)] },
  [[1, -1, 0, 0], [1, 0, 0, 0], [1, 4, 4, 0], [1, 15.999, 15.999, 0], [1, 16, 16, 0], [1, 100, 16, 0]]);

check('G2', { marchers: [{ id: 1, home: [0, 0] }], shapes: { 1: P(16, 0), 2: P(8, 8) }, transitions: { 1: tr(1, 0, 16, 1), 2: tr(2, 8, 16, 2) },
  assignments: [row(1, 1, 0, 0, 16, 0), row(1, 2, 0, 8, 16, 1)] },
  [[1, 4, 4, 0], [1, 7.999, 7.999, 0], [1, 8, 8, 0], [1, 12, 8, 4], [1, 16, 8, 8]]);

check('G3', { marchers: [{ id: 1, home: [0, 0] }], shapes: { 1: P(16, 0), 2: P(4, 8), 3: P(10, 10) },
  transitions: { 1: tr(1, 0, 16, 1), 2: tr(2, 4, 12, 2), 3: tr(3, 6, 10, 3) },
  assignments: [row(1, 1, 0, 0, 16, 0), row(1, 2, 0, 4, 12, 1), row(1, 3, 0, 6, 10, 2)] },
  [[1, 2, 2, 0], [1, 4, 4, 0], [1, 6, 4, 2], [1, 8, 7, 6], [1, 10, 10, 10], [1, 11, 7, 9], [1, 12, 4, 8], [1, 14, 10, 4], [1, 16, 16, 0]]);

check('G4', { marchers: [{ id: 1, home: [0, 0] }], shapes: { 1: P(8, 0), 2: P(8, 8) }, transitions: { 1: tr(1, 0, 8, 1), 2: tr(2, 12, 20, 2) },
  assignments: [row(1, 1, 0, 0, 8), row(1, 2, 0, 12, 20)] },
  [[1, 4, 4, 0], [1, 8, 8, 0], [1, 10, 8, 0], [1, 12, 8, 0], [1, 16, 8, 4], [1, 20, 8, 8]]);

check('G5', { marchers: [{ id: 2, home: [0, 0] }], shapes: { 1: P(0, 16) }, transitions: { 1: tr(1, 0, 16, 1) }, assignments: [row(2, 1, 0, 8, 16)] },
  [[2, 4, 0, 0], [2, 8, 0, 0], [2, 12, 0, 8], [2, 16, 0, 16]]);

const g6 = (up) => ({
  marchers: [1, 2, 3, 4].map((id, i) => ({ id, home: [2 * i, 0] })),
  shapes: { 1: { kind: 'line', geometry: { points: up } }, 2: { kind: 'line', geometry: { points: [[6, 2], [6, 8]] } } },
  transitions: { 1: { id: 1, start: 0, end: 4, dest: 1, slots: 4, style: 'direct', order: 'inherit', params: null },
                 2: { id: 2, start: 4, end: 12, dest: 2, slots: 4, style: 'follow_the_leader', order: 'inherit', params: { waypoints: [] } } },
  assignments: [1, 2, 3, 4].flatMap((m, i) => [row(m, 1, i, 0, 4), row(m, 2, 3 - i, 4, 12)]),
});
check('G6', g6([[0, 0], [6, 0]]),
  [[1, 8, 4, 0], [2, 8, 6, 0], [3, 8, 6, 2], [4, 8, 6, 4], [1, 12, 6, 2], [2, 12, 6, 4], [3, 12, 6, 6], [4, 12, 6, 8]],
  entryIs(2, [1, 2, 3, 4], 'inherit', [8, 10, 12, 14]));
check('G7', g6([[0, -4], [6, -4]]),
  [[1, 8, 6, -4], [2, 8, 6, -2], [3, 8, 6, 0], [4, 8, 6, 2], [1, 12, 6, 2], [2, 12, 6, 4], [3, 12, 6, 6], [4, 12, 6, 8]],
  entryIs(2, [1, 2, 3, 4], 'inherit', [12, 14, 16, 18]));

const arc = (bulge) => ({ marchers: [{ id: 1, home: [0, 0] }], shapes: { 1: P(8, 0) },
  transitions: { 1: tr(1, 0, 8, 1, { style: 'arc', params: { bulge } }) }, assignments: [row(1, 1, 0, 0, 8)] });
check('G8', arc(0.5), [[1, 2, 1.1716, 2.8284], [1, 4, 4, 4], [1, 6, 6.8284, 2.8284], [1, 8, 8, 0]]);
check('G8b', arc(-0.125), [[1, 4, 4, -1], [1, 8, 8, 0]]);

{ const db = g6([[0, 0], [6, 0]]); db.marchers = db.marchers.slice(1); db.assignments = db.assignments.filter((r) => r.marcher !== 1);
  check('G9', db, [[2, 12, 6, 4], [3, 12, 6, 6], [4, 12, 6, 8]], entryIs(2, [2, 3, 4], 'inherit', [8, 10, 12])); }

{ const db = g6([[0, 0], [6, 0]]); db.transitions[3] = tr(3, 0, 4, 3); db.shapes[3] = P(0, 0);
  db.assignments = db.assignments.filter((r) => !(r.marcher === 1 && r.transition === 1)); db.assignments.push(row(1, 3, 0, 0, 4));
  check('G10', db, [[4, 12, 6, 2], [3, 12, 6, 4], [2, 12, 6, 6], [1, 12, 6, 8]],
    entryIs(2, [4, 3, 2, 1], 'slot', [12.3246, 14.3246, 16.3246, 18.3246])); }

{ const db = g6([[0, 0], [6, 0]]); db.assignments = db.assignments.map((r) => (r.marcher === 1 && r.transition === 2 ? { ...r, start: 8 } : r));
  check('G11', db, [[1, 8, 0, 0], [1, 10, 3, 1], [1, 12, 6, 2], [4, 12, 6, 8]], entryIs(2, [2, 3, 4], 'inherit', [8, 10, 12])); }

{ const db = g6([[0, 0], [6, 0]]); db.shapes[5] = P(10, 10); db.transitions[5] = tr(5, 6, 8, 5); db.assignments.push(row(4, 5, 0, 6, 8, 1));
  check('G12', db, [[4, 6, 6, 2], [4, 8, 10, 10], [4, 10, 8, 9], [4, 12, 6, 8], [3, 8, 6, 2], [3, 12, 6, 6]]); }


// G13 (D-16): individual moves mixed with a shape. T1 places each marcher individually; T2 moves the group as a
// line shape; halfway through T2, M2 is pulled out by a one-slot individual move (layer 1); T3 is an individual arc.
check('G13', {
  marchers: [1, 2, 3].map((id) => ({ id, home: [0, 0] })),
  shapes: { 1: { kind: 'line', geometry: { points: [[0, 10], [8, 10]] } } },
  transitions: {
    1: { id: 1, start: 0, end: 8, dest: null, points: [[4, 4], [-2, 6], [10, 0]], slots: 3, style: 'direct', order: 'inherit', params: null },
    2: { id: 2, start: 8, end: 16, dest: 1, slots: 3, style: 'direct', order: 'inherit', params: null },
    3: { id: 3, start: 16, end: 24, dest: null, points: [[8, 18]], slots: 1, style: 'arc', order: 'inherit', params: { bulge: 0.5 } },
    4: { id: 4, start: 12, end: 16, dest: null, points: [[20, 20]], slots: 1, style: 'direct', order: 'inherit', params: null },
  },
  assignments: [row(1, 1, 0, 0, 8), row(2, 1, 1, 0, 8), row(3, 1, 2, 0, 8),
                row(1, 2, 0, 8, 16), row(2, 2, 1, 8, 16), row(3, 2, 2, 8, 16),
                row(3, 3, 0, 16, 24), row(2, 4, 0, 12, 16, 1)],
}, [[1, 4, 2, 2], [1, 8, 4, 4], [1, 12, 2, 7], [1, 16, 0, 10],
    [2, 8, -2, 6], [2, 12, 1, 8], [2, 14, 10.5, 14], [2, 16, 20, 20],
    [3, 16, 8, 10], [3, 20, 4, 14], [3, 24, 8, 18]]);

console.log(`${pass} of ${pass + fail} golden fixtures pass (oracle and cached resolver)`);
if (fail) process.exitCode = 1;

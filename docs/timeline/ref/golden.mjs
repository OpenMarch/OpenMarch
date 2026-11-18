// Golden vectors G1–G12 (spec §12.4). Asserts the oracle AND the cached resolver against the spec's tables.
// usage: node golden.mjs
import { makeOracle } from './oracle.mjs';
import { makeResolver } from './resolver.mjs';
import { routeWalk, groupWalk } from './geom.mjs';

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


// QA-RT-1 (v0.9 step 1, R-14): one marcher walks a route with two corners over an 8-beat move. Legs 5, 6 and 6,
// so L = 17 and the marcher covers 17/8 every beat, passing the corners without stopping. Stored as an own lane
// on slot 0 since v0.10 (D-20), so these goldens are also QA-RT-L1's bit-identity with step 15.
const rt = (points, extra = {}) => ({
  marchers: [{ id: 1, home: [0, 0] }], shapes: {},
  transitions: { 1: { id: 1, start: 0, end: 8, dest: null, points: [[9, 10]], slots: 1, style: 'direct', order: 'inherit', params: null, ...extra } },
  lanes: { 1: { transition: 1, slot: 0, route: 1, offset: null } },
  routes: { 1: { geometry: { v: 1, from: [0, 0], to: [9, 10], points: points.map((at, i) => ({ id: `p${i}`, at })) } } },
  assignments: [row(1, 1, 0, 0, 8)],
});
check('QA-RT-1', rt([[3, 4], [3, 10]]), [[1, 0, 0, 0], [1, 1, 1.275, 1.7], [1, 2, 2.55, 3.4], [1, 3, 3, 5.375], [1, 4, 3, 7.5],
  [1, 5, 3, 9.625], [1, 6, 4.75, 10], [1, 7, 6.875, 10], [1, 8, 9, 10], [1, 9, 9, 10]]);

// QA-RT-2: a route with no points is bit-identical to the same move as direct. QA-RT-6: an inner point within
// EPS_GEOM of A, of B, or of the corner before it changes nothing, bit for bit.
{ const probes = Array.from({ length: 81 }, (_, i) => -1 + i * 0.125);
  const same = (name, a, b) => {
    const [oa, ob, ra, rb] = [makeOracle(a), makeOracle(b), makeResolver(a), makeResolver(b)];
    const bad = probes.filter((t) => [[oa, ob], [ra, rb], [oa, ra]].some(([x, y]) => { const p = x.positionAt(1, t), q = y.positionAt(1, t); return p[0] !== q[0] || p[1] !== q[1]; }));
    bad.length ? fail++ : pass++;
    console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${name}${bad.length ? ` differs at beats ${bad.slice(0, 5)}` : ''}`);
  };
  const direct = rt([]); delete direct.lanes; delete direct.routes;
  same('QA-RT-2', rt([]), direct);
  same('QA-RT-6 near A', rt([[4e-10, 0], [3, 4], [3, 10]]), rt([[3, 4], [3, 10]]));
  same('QA-RT-6 near B', rt([[3, 4], [3, 10], [9, 10 - 5e-10], [9 + 3e-10, 10]]), rt([[3, 4], [3, 10]]));
  same('QA-RT-6 repeated', rt([[3, 4], [3, 4], [3 + 1e-10, 4], [3, 10]]), rt([[3, 4], [3, 10]]));
  same('QA-RT-6 all close', rt([[1e-10, 0], [9, 10 - 1e-10]]), direct); }

// QA-RT-10 (v0.9 step 2): one smooth point at τ = 1 between A = (0, 0) and B = (8, 0), F = A, G = B. By symmetry the
// marcher is on the point at beat 4; it walks the curve at one speed; the oracle and the cached resolver agree.
{ const db = rt([[4, 4]]);
  db.transitions[1] = { ...db.transitions[1], points: [[8, 0]] };
  db.routes[1].geometry = { v: 1, from: [0, 0], to: [8, 0], points: [{ id: 'p0', at: [4, 4], tension: 1 }] };
  const o = makeOracle(db), r = makeResolver(db);
  const mid = o.positionAt(1, 4);
  const okMid = Math.hypot(mid[0] - 4, mid[1] - 4) < 1e-9;
  const ends = [[0, [0, 0]], [8, [8, 0]]].every(([b, q]) => { const p = o.positionAt(1, b); return p[0] === q[0] && p[1] === q[1]; });
  const agree = Array.from({ length: 65 }, (_, i) => i / 8).every((b) => { const p = o.positionAt(1, b), q = r.positionAt(1, b); return p[0] === q[0] && p[1] === q[1]; });
  const steps = Array.from({ length: 8 }, (_, i) => { const a = o.positionAt(1, i), b = o.positionAt(1, i + 1); return Math.hypot(b[0] - a[0], b[1] - a[1]); });
  const curved = Math.hypot(o.positionAt(1, 2)[0] - 2, o.positionAt(1, 2)[1] - 2) > 1e-3;   // not the corner path
  const ok = okMid && ends && agree && curved && Math.max(...steps) - Math.min(...steps) < 0.05 * Math.max(...steps);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  QA-RT-10${ok ? '' : ` mid=${mid} ends=${ends} agree=${agree} curved=${curved} steps=${steps}`}`); }

// QA-RT-15/16/19 (v0.9 step 15, R-14 group schedule): a 2 × 2 block on one group path with a smooth point and a corner.
const H = [[0, 0], [2, 0], [0, 2], [2, 2]], FROM = [1, 1];
const groupShow = (points, ends, to, offsets = H.map((h) => [h[0] - FROM[0], h[1] - FROM[1]])) => ({
  marchers: H.map((home, i) => ({ id: i + 1, home })), shapes: {},
  transitions: Object.fromEntries(H.map((_, i) => [i + 1, { id: i + 1, start: 0, end: 16, dest: null, points: [ends[i]], slots: 1, style: 'direct', order: 'inherit', params: null }])),
  lanes: Object.fromEntries(H.map((_, i) => [i + 1, { transition: i + 1, slot: 0, route: 1, offset: offsets[i] }])),
  routes: { 1: { geometry: { v: 1, from: FROM, to, points: points.map((q, i) => ({ id: `p${i}`, ...q })) } } },
  assignments: H.map((_, i) => row(i + 1, i + 1, 0, 0, 16)),
});
const PTS = [{ at: [6, 6], tension: 1 }, { at: [12, 2] }];
const gProbes = Array.from({ length: 161 }, (_, i) => -0.5 + i * 0.1 + 0.0625);
const agreeBits = (db) => { const o = makeOracle(db), r = makeResolver(db); const bad = [];
  for (const m of [1, 2, 3, 4]) for (const b of gProbes) { const p = o.positionAt(m, b), q = r.positionAt(m, b); if (p[0] !== q[0] || p[1] !== q[1]) bad.push(`M${m}@${b}`); }
  return bad.length ? [`oracle and resolver differ at ${bad.slice(0, 4)}`] : []; };
const report = (name, bad) => { bad.length ? fail++ : pass++; console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${name}${bad.length ? '\n   ' + bad.join('\n   ') : ''}`); };
{ // QA-RT-15: end set = start formation moved by G − F, so rigid and steady for the whole move
  const G = [16, 4], ends = H.map((h) => [h[0] + G[0] - FROM[0], h[1] + G[1] - FROM[1]]);
  const db = groupShow(PTS, ends, G), o = makeOracle(db);
  const ref = routeWalk(FROM, PTS, G, FROM, G), bad = agreeBits(db);
  for (let m = 1; m <= 4; m++) { const off = db.lanes[m].offset;
    for (const b of gProbes) { const p = o.positionAt(m, b), w = ref.at(Math.min(1, Math.max(0, b / 16)));
      if (Math.hypot(p[0] - off[0] - w[0], p[1] - off[1] - w[1]) > 1e-9) { bad.push(`M${m}@${b} off the moved reference walk`); break; } }
    const e = o.positionAt(m, 16); if (e[0] !== ends[m - 1][0] || e[1] !== ends[m - 1][1]) bad.push(`M${m} not on its end spot`); }
  report('QA-RT-15', bad); }
{ // QA-RT-16: the end set is a line; rigid between the first and last points, own legs at steady speed each
  const G = [13, 8], ends = [[10, 8], [12, 8], [14, 8], [16, 8]];
  const db = groupShow(PTS, ends, G), o = makeOracle(db), bad = agreeBits(db);
  const off = (m) => db.lanes[m].offset;
  const gw = (m) => groupWalk(H[m - 1], PTS, ends[m - 1], FROM, G, off(m));
  const { uFirst, uLast, W } = gw(1), m1 = W.V.length - 2;
  for (let m = 1; m <= 4; m++) {
    const a = o.positionAt(m, uFirst * 16), z = o.positionAt(m, uLast * 16);
    if (Math.hypot(a[0] - W.V[1][0] - off(m)[0], a[1] - W.V[1][1] - off(m)[1]) > 1e-9) bad.push(`M${m} not on its first point at u_first`);
    if (Math.hypot(z[0] - W.V[m1][0] - off(m)[0], z[1] - W.V[m1][1] - off(m)[1]) > 1e-9) bad.push(`M${m} not on its last point at u_last`);
    for (let k = 0; k <= 40; k++) { const b = 16 * (uFirst + ((uLast - uFirst) * k) / 40), p = o.positionAt(m, b), q = o.positionAt(1, b);
      if (Math.hypot(p[0] - q[0] - (off(m)[0] - off(1)[0]), p[1] - q[1] - (off(m)[1] - off(1)[1])) > 1e-9) { bad.push(`M${m} not rigid with M1 at ${b}`); break; } }
    const steps = Array.from({ length: 10 }, (_, k) => { const b0 = 16 * (uLast + ((1 - uLast) * k) / 10), b1 = 16 * (uLast + ((1 - uLast) * (k + 1)) / 10);
      const p = o.positionAt(m, b0), q = o.positionAt(m, b1); return Math.hypot(q[0] - p[0], q[1] - p[1]); });
    if (Math.max(...steps) - Math.min(...steps) > 1e-6) bad.push(`M${m} last leg not steady ${steps.map((x) => x.toFixed(4))}`);
    const e = o.positionAt(m, 16); if (e[0] !== ends[m - 1][0] || e[1] !== ends[m - 1][1]) bad.push(`M${m} not on its end spot`);
  }
  const lastLens = [1, 2, 3, 4].map((m) => gw(m).last.len);
  if (Math.max(...lastLens) - Math.min(...lastLens) < 1e-3) bad.push('last legs should differ in length');
  report('QA-RT-16', bad); }
{ // QA-RT-19: degenerate schedules
  const G = [16, 4], ends = H.map((h) => [h[0] + 15, h[1] + 3]), bad = [];
  const finite = (db) => { const o = makeOracle(db); for (const m of [1, 2, 3, 4]) for (const b of gProbes) { const p = o.positionAt(m, b); if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return false; } return true; };
  const none = groupShow([], ends, G), on = makeOracle(none);
  bad.push(...agreeBits(none));
  for (const m of [1, 2, 3, 4]) { const p = on.positionAt(m, 5), a = H[m - 1], e = ends[m - 1];
    if (p[0] !== a[0] + (e[0] - a[0]) * (5 / 16) || p[1] !== a[1] + (e[1] - a[1]) * (5 / 16)) bad.push(`no points: M${m} not on R-7's line`); }
  const one = groupShow([{ at: [8, 9], tension: 1 }], ends, G), oo = makeOracle(one), g1 = groupWalk(H[0], one.routes[1].geometry.points, ends[0], FROM, G, one.lanes[1].offset);
  bad.push(...agreeBits(one));
  if (g1.uFirst !== g1.uLast) bad.push('one point: u_first should equal u_last');
  for (const m of [1, 2, 3, 4]) { const p = oo.positionAt(m, g1.uFirst * 16), off = one.lanes[m].offset; if (Math.hypot(p[0] - 8 - off[0], p[1] - 9 - off[1]) > 1e-9) bad.push(`one point: M${m} off its point`); }
  // M1 stands on its placed first point: a zero-length first leg, so it stands until u_first
  const zero = groupShow(PTS, ends, G); zero.marchers[0].home = [6 - 1, 6 - 1];   // offset [-1,-1] places (6,6) at (5,5)
  const oz = makeOracle(zero), gz = groupWalk([5, 5], PTS, ends[0], FROM, G, [-1, -1]);
  bad.push(...agreeBits(zero));
  if (gz.first.len !== 0) bad.push('zero leg should have length 0');
  for (const b of [0.5, 1, gz.uFirst * 16 - 0.01]) { const p = oz.positionAt(1, b); if (p[0] !== 5 || p[1] !== 5) bad.push(`zero leg: M1 moved at ${b}`); }
  const near = groupShow([{ at: [1 + 1e-10, 1] }, ...PTS], ends, G);
  bad.push(...agreeBits(near));
  const big = groupShow(PTS, ends, G, [[2e6, -2e6], [-2e6, 2e6], [2e6, 2e6], [-2e6, -2e6]]);
  if (![none, one, zero, near, big].every(finite)) bad.push('a position is not finite');
  bad.push(...agreeBits(big));
  report('QA-RT-19', bad); }
{ // QA-RT-L1 (v0.10, D-20): the same block on ONE shared transition, a lane per slot (what step 24 writes), walks
  // bit-identically to step 15's breakout (one transition per member), even with an arc style the lanes override
  const G = [13, 8], ends = [[10, 8], [12, 8], [14, 8], [16, 8]], bad = [];
  const broken = groupShow(PTS, ends, G);
  const shared = { ...broken,
    transitions: { 1: { id: 1, start: 0, end: 16, dest: null, points: ends, slots: 4, style: 'arc', order: 'inherit', params: { bulge: 0.3 } } },
    assignments: H.map((_, i) => row(i + 1, 1, i, 0, 16)),
    lanes: Object.fromEntries(H.map((_, i) => [i + 1, { ...broken.lanes[i + 1], transition: 1, slot: i }])) };
  const a = makeOracle(broken), b = makeOracle(shared), c = makeResolver(shared);
  for (const m of [1, 2, 3, 4]) for (const t of gProbes) { const p = a.positionAt(m, t), q = b.positionAt(m, t), r = c.positionAt(m, t);
    if (p[0] !== q[0] || p[1] !== q[1] || p[0] !== r[0] || p[1] !== r[1]) { bad.push(`M${m}@${t}: ${p} vs ${q} / ${r}`); break; } }
  report('QA-RT-L1', bad); }

{ // QA-RT-L2, QA-RT-L5 (v0.10, plan step 3b): an Adjust on one spot, R-14′ item 6 with T-3 and T-4
  const G = { v: 1, from: [0, 0], to: [200, 0], points: [{ id: 'p', at: [50, 0] }, { id: 'q', at: [150, 0] }] };
  const adjShow = (adjust) => ({ marchers: [{ id: 1, home: [0, -5] }, { id: 2, home: [0, 5] }], shapes: {},
    transitions: { 1: { id: 1, start: 0, end: 16, dest: null, points: [[200, -5], [200, 5]], slots: 2, style: 'direct', order: 'slot', params: null } },
    assignments: [{ id: 1, marcher: 1, transition: 1, slot: 0, start: 0, end: 16, layer: 0 }, { id: 2, marcher: 2, transition: 1, slot: 1, start: 0, end: 16, layer: 0 }],
    routes: { 1: { geometry: G } },
    lanes: { 1: { transition: 1, slot: 0, route: 1, offset: [0, -5] }, 2: { transition: 1, slot: 1, route: 1, offset: [0, 5], adjust } } });
  const same = (p, q) => p[0] === q[0] && p[1] === q[1];
  const K = (a, b, f, d) => ({ a, b, f, d });
  const bad = [];
  const db = adjShow({ v: 1, keys: [K('p', 'q', 0.25, [0, 0]), K('p', 'q', 0.5, [0, 20]), K('p', 'q', 0.75, [0, 0])] });
  const a = makeOracle(db), c = makeResolver(db);
  for (const [b, want] of [[8, [100, 25]], [6, [75, 5]], [7, [87.5, 15]], [4, [50, 5]]]) if (!same(a.positionAt(2, b), want)) bad.push(`@${b}: ${a.positionAt(2, b)}`);
  for (let t = 0; t <= 16; t += 0.125) for (const m of [1, 2]) if (!same(a.positionAt(m, t), c.positionAt(m, t))) bad.push(`M${m}@${t}`);
  if (!same(a.positionAt(1, 8), [100, -5])) bad.push('the other lane moved');
  report('QA-RT-L2', bad);
  const bad5 = [];
  const clamp = adjShow({ v: 1, keys: [K('from', 'p', 0.5, [0, 20])] });              // T-3: a key on the first leg sits on D_1
  if (!same(makeOracle(clamp).positionAt(2, 4), [50, 25])) bad5.push('T-3');
  const tie = adjShow({ v: 1, keys: [K('p', 'q', 0.5, [0, 10]), K('p', 'q', 0.5, [0, 20]), K('p', 'q', 0.5 + 1e-14, [0, 30]), K('p', 'q', 0.8, [0, 0])] });
  if (!same(makeOracle(tie).positionAt(2, 8), [100, 35])) bad5.push('T-4: the last stored key of the cluster stands');
  report('QA-RT-L5', bad5); }

// QA-TR (pathways step 4, R-9′ and R-12′): three marchers on a line at (0,0), (4,0), (8,0) follow the leader over
// [0, 16) into the line (20,10) to (20,22), along a trail route with corners at (14,0) and (14,10). Line-up 8, drawn
// part 22, so destOffset 30 and the ends are 30, 36, 42: M1 walks 1.875 a beat, M2 2, M3 (the leader) 2.125.
{ const tshow = (points, extra = {}, route = true) => ({
    marchers: [{ id: 1, home: [0, 0] }, { id: 2, home: [4, 0] }, { id: 3, home: [8, 0] }],
    shapes: { 1: { kind: 'line', geometry: { points: [[20, 10], [20, 22]] } } },
    transitions: { 1: { id: 1, start: 0, end: 16, dest: 1, slots: 3, style: 'follow_the_leader', order: 'slot', params: { waypoints: [] }, ...(route ? { route: 1 } : {}), ...extra } },
    routes: route ? { 1: { geometry: { v: 1, from: [8, 0], to: [20, 10], points } } } : {},
    assignments: [row(1, 1, 0, 0, 16), row(2, 1, 1, 0, 16), row(3, 1, 2, 0, 16)],
  });
  const C2 = [{ id: 'a', at: [14, 0] }, { id: 'b', at: [14, 10] }];
  check('QA-TR-1', tshow(C2), [[1, 4, 7.5, 0], [2, 4, 12, 0], [3, 4, 14, 2.5], [1, 8, 14, 1], [2, 8, 14, 6], [3, 8, 15, 10],
    [1, 12, 14, 8.5], [2, 12, 18, 10], [3, 12, 20, 13.5], [1, 16, 20, 10], [2, 16, 20, 16], [3, 16, 20, 22]],
    entryIs(1, [1, 2, 3], 'slot', [30, 36, 42]));
  // QA-TR-4 (R-12′): Reverse. M1 leads, the far end (20,22) is the entrance, and everyone ends on their own spot. The
  // drawn part is 14 + 10 + √180 from (0,0), so the ends are 8 + 24 + √180 plus 0, 6 and 12.
  const far = Math.hypot(6, 12);
  check('QA-TR-4', tshow(C2, { params: { waypoints: [], reverse: true } }), [[1, 16, 20, 10], [2, 16, 20, 16], [3, 16, 20, 22], [3, 2, 8 - (32 + far) / 8, 0], [1, 1, (36 + far) / 16, 0]],
    entryIs(1, [3, 2, 1], 'slot', [32 + far, 38 + far, 44 + far]));
  // QA-TR-11 (R-13′): no shape. The line runs through the three end spots, 0, 3 and 13 along it, so the ends are 30, 33
  // and 43, and each member lands on its own spot whichever end leads.
  const spots = { dest: null, points: [[20, 10], [20, 13], [26, 21]] };
  check('QA-TR-11', tshow(C2, spots), [[1, 16, 20, 10], [2, 16, 20, 13], [3, 16, 26, 21], [3, 15, 24.6875, 19.25], [1, 8, 14, 1]], entryIs(1, [1, 2, 3], 'slot', [30, 33, 43]));
  check('QA-TR-11 reversed', tshow(C2, { ...spots, params: { waypoints: [], reverse: true } }), [[1, 16, 20, 10], [2, 16, 20, 13], [3, 16, 26, 21]], entryIs(1, [3, 2, 1], 'slot'));
  // QA-TR-13 (R-13′): M2 gone, its spot left empty. The others still end on their own spots, and the line-up skips M2.
  { const gap = tshow(C2, spots); gap.assignments = gap.assignments.filter((r) => r.marcher !== 2);
    check('QA-TR-13 a vacant spot', gap, [[1, 16, 20, 10], [3, 16, 26, 21], [1, 8, 14, 1]], entryIs(1, [1, 3], 'slot', [30, 43])); }
  check('QA-TR-12 one slot', { ...tshow(C2, { dest: null, points: [[20, 10]], slots: 1 }), marchers: [{ id: 3, home: [8, 0] }], assignments: [row(3, 1, 0, 0, 16)] }, [[3, 8, 14, 5], [3, 16, 20, 10]]);
  const same = (p, q) => p[0] === q[0] && p[1] === q[1];
  const report = (name, bad) => { bad.length ? fail++ : pass++; console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${name}${bad.length ? '\n   ' + bad.slice(0, 6).join('\n   ') : ''}`); };
  const bits = (name, a, b) => { const bad = [];
    for (const [x, y] of [[makeOracle(a), makeOracle(b)], [makeResolver(a), makeResolver(b)], [makeOracle(a), makeResolver(a)]])
      for (let t = -1; t <= 17; t += 0.3125) for (const m of [1, 2, 3]) if (!same(x.positionAt(m, t), y.positionAt(m, t))) bad.push(`M${m}@${t}`);
    report(name, bad); };
  bits('QA-TR-2 no points', tshow([]), tshow([], {}, false));
  bits('QA-TR-2 a point on the entrance', tshow([{ id: 'a', at: [20, 10 + 1e-10] }]), tshow([], {}, false));
  bits('QA-TR-5 waypoints not read (T-15)', tshow(C2, { params: { waypoints: [[100, 100]] } }), tshow(C2));
  // QA-TR-3: one smooth point; the cached resolver and the oracle agree bit for bit, the leader is below the chord
  // on the curve, and nobody jumps
  const sm = tshow([{ id: 'q', at: [14, -4], tension: 1 }]), o = makeOracle(sm), r = makeResolver(sm), bad = [];
  for (const m of [1, 2, 3]) { let prev = o.positionAt(m, 0);
    for (let t = 0; t <= 16; t += 1 / 64) { const p = o.positionAt(m, t), q = r.positionAt(m, t);
      if (!same(p, q)) bad.push(`M${m}@${t} oracle ${p} resolver ${q}`);
      if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.1) bad.push(`M${m} jumps at ${t}`);
      prev = p; } }
  if (!(o.positionAt(3, 4)[1] < 0)) bad.push('the leader is not on the curve');
  report('QA-TR-3', bad); }

// QA-AR-1 (R-14″, plan step 10a): a leg with bulge 1/4 and chord 8 is R-8's arc, centre (4, −3), radius 5, length r·θ
// exactly (θ = 4·atan(1/2)). One arc leg alone (toBulge) is R-8's arc itself, bit for bit; an arc leg then a straight
// leg walks at one speed, on the circle until the corner; the oracle and the cached resolver agree bit for bit.
{ const bad = [], same = (p, q) => p[0] === q[0] && p[1] === q[1], C = [4, -3], R = 5, len = R * 4 * Math.atan(0.5);
  const one = rt([]); one.transitions[1].points = [[8, 0]]; one.routes[1].geometry = { v: 1, from: [0, 0], to: [8, 0], points: [], toBulge: 0.25 };
  const arc = { ...rt([]), lanes: undefined, routes: undefined }; arc.transitions[1] = { ...arc.transitions[1], points: [[8, 0]], style: 'arc', params: { bulge: 0.25 } };
  for (const [a, b] of [[makeOracle(one), makeOracle(arc)], [makeResolver(one), makeResolver(arc)]])
    for (let t = -1; t <= 9; t += 0.25) if (!same(a.positionAt(1, t), b.positionAt(1, t))) bad.push(`one leg @${t} is not R-8's arc`);
  const two = rt([]); two.transitions[1].points = [[8, 8]];
  two.routes[1].geometry = { v: 1, from: [0, 0], to: [8, 8], points: [{ id: 'p0', at: [8, 0], bulge: 0.25 }] };
  const o = makeOracle(two), r = makeResolver(two), W = routeWalk([0, 0], two.routes[1].geometry.points, [8, 8]);
  if (Math.abs(W.D[1] - len) > 1e-12) bad.push(`arc length ${W.D[1]}, want r·θ = ${len}`);
  const corner = (8 * len) / (len + 8);
  for (let t = 0; t <= 8; t += 0.25) { const p = o.positionAt(1, t), q = r.positionAt(1, t);
    if (!same(p, q)) bad.push(`@${t} oracle ${p} resolver ${q}`);
    if (t <= corner && Math.abs(Math.hypot(p[0] - C[0], p[1] - C[1]) - R) > 1e-9) bad.push(`@${t} off the circle`); }
  const sp = Array.from({ length: 32 }, (_, i) => i).filter((i) => !(i / 4 < corner && (i + 1) / 4 > corner))   // the step across the corner cuts it
    .map((i) => { const a = o.positionAt(1, i / 4), b = o.positionAt(1, (i + 1) / 4); return Math.hypot(b[0] - a[0], b[1] - a[1]); });
  if (Math.max(...sp) - Math.min(...sp) > 0.02) bad.push(`uneven speed ${Math.min(...sp)}..${Math.max(...sp)}`);
  if (!(o.positionAt(1, 1)[1] > 0)) bad.push('a positive bulge bends toward +90° of the chord');
  bad.length ? fail++ : pass++;
  console.log(`${bad.length ? 'FAIL' : 'PASS'}  QA-AR-1${bad.length ? '\n   ' + bad.slice(0, 6).join('\n   ') : ''}`); }

console.log(`${pass} of ${pass + fail} golden fixtures pass (oracle and cached resolver)`);
if (fail) process.exitCode = 1;

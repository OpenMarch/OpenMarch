// Direct property checks (spec §12.5) on random shows, including boundary-valued inputs.
// Expected values use geometry written independently here: nothing is imported from geom.mjs.
// usage: node props.mjs [seeds=300]      exit status 1 on any violation
import { makeOracle } from './oracle.mjs';
import { makeResolver } from './resolver.mjs';
import { arcPoint, destinationsOf } from './geom.mjs';   // subjects of the R-8 cross-check and the bit-exact arrival check only

const SEEDS = +(process.argv[2] ?? 300);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- independent geometry ----------
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function polyOf(shape) {
  const g = shape.geometry;
  if (shape.kind === 'line' || shape.kind === 'freehand') return g.points;
  if (shape.kind === 'box') { const [x, y] = g.origin; return [[x, y], [x + g.width, y], [x + g.width, y + g.height], [x, y + g.height], [x, y]]; }
  return null;
}
function walk(pts, s) {                          // linear walk, deliberately different from the binary search in geom.mjs
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = d2(pts[i - 1], pts[i]);
    if (seg > 0 && acc + seg >= s) { const f = (s - acc) / seg; return [pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])]; }
    acc += seg;
  }
  return pts[pts.length - 1];
}
function exactSamples(shape, n) {
  const g = shape.geometry;
  if (shape.kind === 'block') return Array.from({ length: n }, (_, i) => [g.origin[0] + (i % g.cols) * g.spacing[0], g.origin[1] + Math.floor(i / g.cols) * g.spacing[1]]);
  const closed = shape.kind === 'circle' || shape.kind === 'box';
  const t = (i) => (closed ? i / n : n === 1 ? 0 : i / (n - 1));
  if (shape.kind === 'circle') return Array.from({ length: n }, (_, i) => { const a = g.start_angle + (g.clockwise ? -1 : 1) * 2 * Math.PI * t(i); return [g.center[0] + g.radius * Math.cos(a), g.center[1] + g.radius * Math.sin(a)]; });
  const pts = polyOf(shape); let L = 0; for (let i = 1; i < pts.length; i++) L += d2(pts[i - 1], pts[i]);
  return Array.from({ length: n }, (_, i) => walk(pts, t(i) * L));
}
function distToSeg(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
  const f = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2));
  return d2(p, [a[0] + f * vx, a[1] + f * vy]);
}
const distToPoly = (p, pts) => (pts.length === 1 ? d2(p, pts[0]) : Math.min(...pts.slice(1).map((b, i) => distToSeg(p, pts[i], b))));
const distToShape = (p, shape) => (shape.kind === 'circle' ? Math.abs(d2(p, shape.geometry.center) - shape.geometry.radius) : distToPoly(p, polyOf(shape)));
function arcCentreForm(A, B, k, p) {             // the textbook centre/radius construction, independent of R-8's formula
  const c = d2(A, B); if (Math.abs(k) < 1e-9 || c === 0) return [A[0] + (B[0] - A[0]) * p, A[1] + (B[1] - A[1]) * p];
  const s = k * c, R = (c * c / 4 + s * s) / (2 * Math.abs(s)), M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const n = [-(B[1] - A[1]) / c, (B[0] - A[0]) / c], off = s - Math.sign(s) * R, C = [M[0] + off * n[0], M[1] + off * n[1]];
  const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]), phi = Math.atan2(c / 2, R - Math.abs(s)), a = a0 + p * (-Math.sign(k) * 2 * phi);
  return [C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)];
}

// ---------- world generator (normal and boundary-valued) ----------
function makeWorld(seed, boundary) {
  const R = mulberry32(seed * 104729 + (boundary ? 1 : 0));
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = (xs) => xs[Math.floor(R() * xs.length)];
  const S = boundary ? pick([1, 1e3, 1e6]) : 10;                     // coordinate scale, up to the I-S1 bound
  const B0 = boundary ? pick([0, 2 ** 31 - 1 - 200]) : 0;            // beat base, up to the I-N2 bound
  const c = () => Math.round((R() * 2 - 1) * S * 1e3) / 1e3;
  const pt = () => [c(), c()];
  const shape = () => {
    const k = pick(['line', 'freehand', 'circle', 'box', 'block']);
    if (k === 'line') { const a = pt(); let b = pt(); if (a[0] === b[0] && a[1] === b[1]) b = [a[0] + 1, a[1]]; return { kind: k, geometry: { points: [a, b] } }; }
    if (k === 'freehand') { const p = [pt()]; for (let i = 0; i < ri(1, 4); i++) p.push(R() < 0.3 ? p.at(-1).slice() : pt()); p.push(p[0].slice()); if (p.every((q) => q[0] === p[0][0] && q[1] === p[0][1])) p.push([p[0][0] + 1, p[0][1]]); return { kind: k, geometry: { points: p } }; }
    const half = () => pt().map((v) => v / 2), size = () => Math.max(1e-3, Math.abs(c()) / 2);   // keep every point inside [-S, S]² (I-S1)
    if (k === 'circle') return { kind: k, geometry: { center: half(), radius: size(), start_angle: R() * 2 * Math.PI * 0.999999, clockwise: R() < 0.5 } };
    if (k === 'box') return { kind: k, geometry: { origin: half(), width: size(), height: size() } };
    return { kind: k, geometry: { origin: half(), rows: ri(1, 4), cols: ri(1, 4), spacing: [c() / 8, c() / 8] } };
  };
  const db = { marchers: [], shapes: {}, transitions: {}, assignments: [] };
  for (let i = 1; i <= 6; i++) db.shapes[i] = shape();
  for (let m = 1; m <= ri(3, 7); m++) db.marchers.push({ id: m, home: R() < 0.2 && m > 1 ? db.marchers[0].home.slice() : pt() });
  const bulge = () => (boundary ? pick([0.5, -0.5, 1e-9, -1e-9, 0, R() - 0.5]) : +(R() - 0.5).toFixed(3));   // |k| <= 1/2 (I-T2)
  for (let id = 1; id <= ri(5, 9); id++) {
    const s = B0 + ri(0, 150), e = s + ri(1, 40);
    let style = pick(['direct', 'arc', 'follow_the_leader', 'follow_the_leader']);
    let dest = ri(1, 6); if (style === 'follow_the_leader') while (db.shapes[dest].kind === 'block') dest = ri(1, 6);
    let slots = ri(1, 8); const sh = db.shapes[dest]; if (sh.kind === 'block') slots = Math.min(slots, sh.geometry.rows * sh.geometry.cols);  // I-T3, I-T4
    db.transitions[id] = { id, start: s, end: e, dest, slots, style, order: R() < 0.8 ? 'inherit' : 'slot',
      params: style === 'arc' ? { bulge: bulge() } : style === 'follow_the_leader' ? { waypoints: Array.from({ length: ri(0, 2) }, () => (R() < 0.3 && db.marchers.length ? db.marchers[0].home.slice() : pt())) } : null };
    if (style !== 'follow_the_leader' && R() < 0.3) { db.transitions[id].dest = null; db.transitions[id].points = Array.from({ length: slots }, pt); }   // D-16
  }
  let rid = 1;
  const ok = (r) => { const t = db.transitions[r.transition];
    if (r.start < t.start || r.end > t.end || r.end <= r.start || r.slot >= t.slots) return false;
    return db.assignments.every((o) => !(o.transition === r.transition && (o.slot === r.slot || o.marcher === r.marcher)) &&
      !(o.marcher === r.marcher && o.layer === r.layer && o.start < r.end && r.start < o.end)); };
  for (let i = 0; i < 70; i++) {
    const t = pick(Object.values(db.transitions)), full = R() < 0.6;
    const s = full ? t.start : ri(t.start, t.end - 1), e = full ? t.end : ri(s + 1, t.end);
    const r = { id: rid, marcher: pick(db.marchers).id, transition: t.id, slot: ri(0, t.slots - 1), start: s, end: e, layer: pick([0, 0, 0, 1, 2]) };
    if (ok(r)) { db.assignments.push(r); rid++; }
  }
  return { db, S, R };
}

// Adversarial chain: repeated partial minor arcs at |bulge| = 1/2, each exit aimed away from the next target.
function chainWorld(seed) {
  const R = mulberry32(seed * 7907), S = 1e6, N = 60;
  const corners = [[0, 0], [S, S], [-S, S], [-S, -S], [S, -S]];
  const db = { marchers: [{ id: 1, home: [S, 0] }], shapes: {}, transitions: {}, assignments: [] };
  corners.forEach((q, i) => (db.shapes[i + 1] = { kind: 'line', geometry: { points: [q, [q[0] === S ? S - 1 : q[0] + 1, q[1]]] } }));
  for (let i = 0; i < N; i++) {
    db.transitions[i + 1] = { id: i + 1, start: i, end: i + 2, dest: 1 + Math.floor(R() * 5), slots: 1, style: 'arc', order: 'inherit', params: { bulge: R() < 0.5 ? 0.5 : -0.5 } };
    db.assignments.push({ id: i + 1, marcher: 1, transition: i + 1, slot: 0, start: i, end: i + 1, layer: 0 });
  }
  db.shapes[6] = { kind: 'line', geometry: { points: [[1, 1], [2, 1]] } };
  db.transitions[N + 1] = { id: N + 1, start: N, end: N + 4, dest: 6, slots: 1, style: 'direct', order: 'inherit', params: null };
  db.assignments.push({ id: N + 1, marcher: 1, transition: N + 1, slot: 0, start: N, end: N + 4, layer: 0 });
  return { db, S, R };
}

/** β: the largest distance from the field origin to any authored point (homes, waypoints, every point of every shape). */
function betaOf(db) {
  let b = 0; const see = (q) => (b = Math.max(b, Math.hypot(q[0], q[1])));
  db.marchers.forEach((m) => see(m.home));
  Object.values(db.transitions).forEach((t) => { (t.params?.waypoints ?? []).forEach(see); (t.points ?? []).forEach(see); });
  for (const s of Object.values(db.shapes)) {
    const g = s.geometry;
    if (s.kind === 'circle') b = Math.max(b, Math.hypot(...g.center) + g.radius);
    else if (s.kind === 'block') { for (let r = 0; r < g.rows; r++) for (let c2 = 0; c2 < g.cols; c2++) see([g.origin[0] + c2 * g.spacing[0], g.origin[1] + r * g.spacing[1]]); }
    else polyOf(s).forEach(see);
  }
  return b;
}

const o0 = (db) => makeOracle(db);

// ---------- checks ----------
const counts = {}; const failures = [];
const fail = (prop, seed, boundary, msg) => { counts[prop] = (counts[prop] ?? 0) + 1; if (failures.length < 12) failures.push(`${prop} seed ${seed}${boundary ? ' (boundary)' : ''}: ${msg}`); };
const pass = (prop) => { counts[prop + ' checked'] = (counts[prop + ' checked'] ?? 0) + 1; };
const finite = (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]);
const fmt = (p) => `(${p.map((v) => +v.toPrecision(10)).join(', ')})`;

for (let seed = 1; seed <= SEEDS; seed++) for (const mode of ['normal', 'boundary', 'chain']) {
  if (mode === 'chain' && seed % 10) continue;                       // one adversarial chain per 10 seeds
  const boundary = mode !== 'normal';
  const { db, S, R } = mode === 'chain' ? chainWorld(seed) : makeWorld(seed, boundary);
  const beta = betaOf(db);
  const A = db.marchers.reduce((a, m) => a + o0(db).spans(m.id).filter((s) => s.row && db.transitions[s.row.transition].style === 'arc').length, 0);   // arc spans in the show
  const eps = 1e-9 * Math.max(1, S) + 1e-12;
  const o = makeOracle(db), res = makeResolver(db);
  const F = (p, why) => fail(p, seed, boundary, why);

  for (const m of db.marchers) {
    const spans = o.spans(m.id);
    for (const s of spans) {
      const probes = [s.start, s.end, (s.start + s.end) / 2].filter(Number.isFinite);
      for (const b of probes.length ? probes : [0]) {
        const b2 = Math.min(b, s.end === Infinity ? b : s.end);
        const x = o.evalSpan(s, b2);
        if (!finite(x)) F('P-11 finite', `M${m.id} span@${s.start} b=${b2} -> ${x}`); else pass('P-11 finite');
        if (!(Math.hypot(x[0], x[1]) <= beta * Math.sqrt(1 + A) * (1 + 1e-12) + 1e-9)) F('P-13 derived range', `M${m.id}@${b2}: |P| = ${Math.hypot(x[0], x[1]).toExponential(3)} > β√(1+a) = ${(beta * Math.sqrt(1 + A)).toExponential(3)}`); else pass('P-13 derived range');
        const y = res.positionAt(m.id, b2 === s.end ? b2 - 0 : b2);
        const z = o.positionAt(m.id, b2);
        if (!(d2(y, z) <= eps)) F('resolver = oracle', `M${m.id}@${b2}: ${fmt(y)} vs ${fmt(z)}`); else pass('resolver = oracle');
      }
      // P-1 continuity at the span's start
      if (s.k > 0 && Number.isFinite(s.start)) {
        const a = o.evalSpan(spans[s.k - 1], s.start), b = o.evalSpan(s, s.start);
        if (!(d2(a, b) <= eps)) F('P-1 continuity', `M${m.id}@${s.start}: ${fmt(a)} vs ${fmt(b)}`); else pass('P-1 continuity');
      }
      // P-9 holds are constant
      if (!s.row && Number.isFinite(s.start)) {
        const a = o.evalSpan(s, s.start), b = o.evalSpan(s, Number.isFinite(s.end) ? (s.start + s.end) / 2 : s.start + 1e6);
        if (!(a[0] === b[0] && a[1] === b[1])) F('P-9 hold', `M${m.id}@${s.start}`); else pass('P-9 hold');
      }
      // P-7 arrival, against independently sampled destinations
      if (s.row && s.end === db.transitions[s.row.transition].end) {
        const t = db.transitions[s.row.transition], pts = t.dest == null ? t.points.slice(0, t.slots) : exactSamples(db.shapes[t.dest], t.slots);
        let want;
        if (t.style !== 'follow_the_leader') want = pts[s.row.slot];
        else {
          const e = o.ftlEntry(t.id), n = t.slots, mm = e.members.length, q = e.members.indexOf(m.id);
          if (q >= 0) want = pts[n - mm + q];
          else { const others = db.assignments.filter((r) => r.transition === t.id && !e.members.includes(r.marcher)).sort((a, b) => a.slot - b.slot || a.marcher - b.marcher);
                 want = pts[n - mm - 1 - others.findIndex((r) => r.marcher === m.id)]; }
        }
        const got = o.evalSpan(s, t.end);
        if (!(d2(got, want) <= eps)) F('P-7 arrival', `M${m.id} T${t.id} (${t.style}, ${t.dest == null ? "individual" : db.shapes[t.dest].kind}): ${fmt(got)} vs exact ${fmt(want)}`); else pass('P-7 arrival');
        // §8.10: arrival is bit-exact, i.e. identical to the model's own sample point (no interpolation residue)
        const own = destinationsOf(t, db.shapes), idx = pts.findIndex((q) => q === want);
        const exact = own[idx];
        if (!(got[0] === exact[0] && got[1] === exact[1])) F('P-7 bit-exact arrival', `M${m.id} T${t.id} (${t.style}): ${fmt(got)} vs ${fmt(exact)}`); else pass('P-7 bit-exact arrival');
      }
      // P-6 trail adherence during founding FTL spans
      if (s.row && db.transitions[s.row.transition].style === 'follow_the_leader' && s.start === db.transitions[s.row.transition].start) {
        const t = db.transitions[s.row.transition], e = o.ftlEntry(t.id);
        const pre = [...e.members.map((mm) => o.evalSpan(o.spans(mm).find((x) => x.row && x.row.transition === t.id && x.start === t.start), t.start)),
                     ...(t.params?.waypoints ?? [])];
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          const b = s.start + f * (s.end - s.start), p = o.evalSpan(s, b);
          const dist = Math.min(distToShape(p, db.shapes[t.dest]), distToPoly(p, [...pre, exactSamples(db.shapes[t.dest], 1)[0]]));
          if (!(dist <= eps)) F('P-6 trail', `M${m.id} T${t.id}@${b}: ${dist.toExponential(2)} off the trail`); else pass('P-6 trail');
        }
      }
    }
  }
  if (mode === 'chain') {
    const last = Object.values(db.transitions).at(-1), got = o.positionAt(1, last.end);
    if (!(got[0] === 1 && got[1] === 1)) F('P-7 arrival', `chain: final direct move arrived at ${fmt(got)}, not (1, 1)`); else pass('P-7 arrival');
  }
  // P-5 and P-11 on FTL entries
  for (const t of Object.values(db.transitions)) if (t.style === 'follow_the_leader') {
    const e = o.ftlEntry(t.id);
    const all = [...e.startDist, ...e.endDist, ...[...e.target.values()].flat()];
    if (!all.every(Number.isFinite)) F('P-11 finite', `entry T${t.id} has non-finite values`); else pass('P-11 finite');
    let okMono = true;
    for (let q = 0; q < e.members.length; q++) {
      if (q > 0 && (e.startDist[q] < e.startDist[q - 1] || e.endDist[q] < e.endDist[q - 1])) okMono = false;
      if (e.endDist[q] < e.startDist[q]) okMono = false;
    }
    if (!okMono) F('P-5 no overtaking', `T${t.id}`); else pass('P-5 no overtaking');
  }
  // P-12 causality: removing one assignment of transition T changes no position before T starts
  for (let trial = 0; trial < 3 && db.assignments.length; trial++) {
    const r = db.assignments[Math.floor(R() * db.assignments.length)], t = db.transitions[r.transition];
    const o2 = makeOracle({ ...db, assignments: db.assignments.filter((x) => x !== r) });
    let same = true, where = '';
    for (const m of db.marchers) for (const s of o.spans(m.id)) for (const b of [s.start, (s.start + s.end) / 2])
      if (Number.isFinite(b) && b < t.start && !(d2(o.positionAt(m.id, b), o2.positionAt(m.id, b)) <= eps)) { same = false; where = `M${m.id}@${b}`; }
    if (!same) F('P-12 causality', `removing row ${r.id} (T${t.id} starts ${t.start}) changed ${where}`); else pass('P-12 causality');
  }
  // P-2 determinism: shuffle rows and renumber row ids
  {
    const perm = db.assignments.map((r) => ({ ...r })).sort(() => R() - 0.5);
    const ids = perm.map((_, i) => 10000 + i).sort(() => R() - 0.5);
    perm.forEach((r, i) => { r.id = ids[i]; });
    const o2 = makeOracle({ ...db, assignments: perm });
    let same = true;
    for (const m of db.marchers) for (const b of Object.values(db.transitions).flatMap((t) => [t.start, (t.start + t.end) / 2, t.end]))
      if (!(d2(o.positionAt(m.id, b), o2.positionAt(m.id, b)) <= 1e-12 * Math.max(1, S))) same = false;
    for (const t of Object.values(db.transitions)) if (t.style === 'follow_the_leader' && JSON.stringify(o.ftlEntry(t.id).members) !== JSON.stringify(o2.ftlEntry(t.id).members)) same = false;
    if (!same) F('P-2 determinism', 'shuffled/renumbered rows changed the result'); else pass('P-2 determinism');
  }
}

// R-8 cross-check: stable arc formula vs the textbook centre form, at moderate inputs
{
  const R = mulberry32(7);
  for (let i = 0; i < 20000; i++) {
    const A = [R() * 2000 - 1000, R() * 2000 - 1000], B = [R() * 2000 - 1000, R() * 2000 - 1000], k = R() - 0.5, p = R();
    const a = arcPoint(A, B, k, p), b = arcCentreForm(A, B, k, p);
    if (!(d2(a, b) <= 1e-7)) { fail('R-8 cross-check', i, false, `${fmt(A)}→${fmt(B)} k=${k} p=${p}: ${fmt(a)} vs ${fmt(b)}`); } else pass('R-8 cross-check');
  }
  // endpoints are exact and extreme finite inputs stay finite
  for (const [A, B, k] of [[[0, 0], [8, 0], 0.5], [[0, 0], [1e6, 0], 1e-9], [[-1e6, -1e6], [1e6, 1e6], -0.5], [[0, 0], [8, 0], 1e200], [[0, 0], [Number.MIN_VALUE, 0], 0], [[0, 0], [Number.MIN_VALUE, 0], 0.5], [[1e6, 1e6], [1e6 + 1e-10, 1e6], 0.5]]) {
    const e0 = arcPoint(A, B, k, 0), e1 = arcPoint(A, B, k, 1), mid = arcPoint(A, B, k, 0.5);
    if (e0 !== A || e1 !== B || !finite(mid)) fail('R-8 endpoints/finite', 0, true, `${fmt(A)}→${fmt(B)} k=${k}`); else pass('R-8 endpoints/finite');
  }
}

console.log(JSON.stringify({ seeds: SEEDS, modes: ['normal', 'boundary', 'chain'], counts, failures }, null, 1));
console.log(`${Object.entries(counts).filter(([k]) => k.endsWith('checked')).reduce((a, [, v]) => a + v, 0)} property checks, ${failures.length} failures`);
if (failures.length) process.exitCode = 1;

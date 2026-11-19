// Direct property checks (spec §12.5) on random shows, including boundary-valued inputs.
// Expected values use geometry written independently here: nothing is imported from geom.mjs.
// usage: node props.mjs [seeds=300]      exit status 1 on any violation
import { makeOracle } from './oracle.mjs';
import { makeResolver } from './resolver.mjs';
import { arcPoint, destinationsOf } from './geom.mjs';   // subjects of the R-8 cross-check and the bit-exact arrival check only
import { randArcRoute, randAdjust, hasArc, hasSmooth } from './arcroutes.mjs';   // route generation only (R-14″ worlds)

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

// ---------- routes with corners and arc legs (R-14 cleaning, R-14″), written from the spec ----------
// Smooth points are not modelled: these checks run only on routes with none. Arc lengths come from the centre form
// (2·φ·R), not R-14″'s r·θ formula; a bulge under 1e-7 is taken as its chord, within 2·|bulge|·chord.
const EPSG = 1e-9, TINY = 1e-7;
function cleanLegs(A, pts, B, toBulge) {
  const V = [A], K = [null];
  for (const q of pts) if (d2(V[V.length - 1], q.at) >= EPSG) { V.push(q.at); K.push(q.bulge ?? null); }
  let dropped = false, into = null;                        // inner points on B go; the leg into B keeps the first one's bulge
  while (V.length > 1 && d2(V[V.length - 1], B) < EPSG) { V.pop(); into = K.pop(); dropped = true; }
  V.push(B); K.push(dropped ? into : (toBulge ?? null));
  const legs = [];
  for (let j = 0; j + 1 < V.length; j++) {
    const P = V[j], Q = V[j + 1], k = K[j + 1], c = d2(P, Q);
    if (k === null || c === 0 || Math.abs(k) < TINY) { legs.push({ P, Q, k: null, len: c, slack: k ? 2 * Math.abs(k) * c : 0 }); continue; }
    const sg = Math.abs(k) * c, Rr = (c * c / 4 + sg * sg) / (2 * sg), phi = Math.atan2(c / 2, Rr - sg);
    legs.push({ P, Q, k, len: 2 * phi * Rr, slack: 0 });
  }
  const D = [0]; legs.forEach((l) => D.push(D[D.length - 1] + l.len));
  return { V, legs, D, L: D[D.length - 1], slack: legs.reduce((a, l) => a + l.slack, 0) };
}
const legAt = (l, f) => (l.k === null ? [l.P[0] + (l.Q[0] - l.P[0]) * f, l.P[1] + (l.Q[1] - l.P[1]) * f] : arcCentreForm(l.P, l.Q, l.k, f));
function walkAtDist(W, d) {
  let j = 0; while (j < W.legs.length - 1 && !(d < W.D[j + 1])) j++;
  const l = W.legs[j]; return legAt(l, l.len > 0 ? Math.min(1, Math.max(0, (d - W.D[j]) / l.len)) : 0);
}
/** R-14 own path: A to B through the route, at one speed; one leg alone is R-7 or R-8 by progress. */
function ownWalkAt(A, g, B, p) {
  const W = cleanLegs(A, g.points, B, g.toBulge);
  if (p <= 0) return { at: A, slack: 0 }; if (p >= 1) return { at: B, slack: 0 };
  if (W.legs.length === 1) return { at: legAt(W.legs[0], p), slack: W.slack };
  return { at: walkAtDist(W, p * W.L), slack: W.slack };
}
/** R-14 group schedule with no Adjust: own first leg to W_1 + o, W + o between the moments, own last leg; arc legs stay arcs. */
function groupWalkAt(A, g, B, o, p) {
  const W = cleanLegs(g.from, g.points, g.to, g.toBulge), m = W.V.length - 2;
  if (p <= 0) return { at: A, slack: 0 }; if (p >= 1) return { at: B, slack: 0 };
  const add = (q) => [q[0] + o[0], q[1] + o[1]];
  if (m < 1) return { at: legAt({ ...W.legs[0], P: A, Q: B }, p), slack: W.slack + (W.legs[0].k === null ? 0 : 0) };
  const uF = W.D[1] / W.L, uL = W.D[m] / W.L;
  if (p < uF) return { at: legAt({ ...W.legs[0], P: A, Q: add(W.V[1]) }, p / uF), slack: W.slack };
  if (p <= uL) return { at: add(walkAtDist(W, p * W.L)), slack: W.slack };
  return { at: legAt({ ...W.legs[m], P: add(W.V[m]), Q: B }, (p - uL) / (1 - uL)), slack: W.slack };
}
/** Distance from p to one leg: its segment, or its circle (the centre form). */
function distToLeg(p, l) {
  if (l.k === null) return Math.max(0, distToSeg(p, l.P, l.Q) - l.slack);
  const c = d2(l.P, l.Q), sg = l.k * c, Rr = (c * c / 4 + sg * sg) / (2 * Math.abs(sg)), M = [(l.P[0] + l.Q[0]) / 2, (l.P[1] + l.Q[1]) / 2];
  const n = [-(l.Q[1] - l.P[1]) / c, (l.Q[0] - l.P[0]) / c], off = sg - Math.sign(sg) * Rr, C = [M[0] + off * n[0], M[1] + off * n[1]];
  return Math.abs(d2(p, C) - Rr);
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
  return { db, S, R, pt, c, ri, pick };
}

// Route worlds (R-14′ lanes, R-9′ trails, R-14″ arc legs) on their own seeds, so the other modes are unchanged. Half of them
// have no smooth point anywhere, so every route is checked against the independent walk above and P-13 applies.
function routeWorld(seed, boundary) {
  const w = makeWorld(seed + 7777777, boundary), { db, S, R, pt, c, ri, pick } = w;
  const smoothShare = R() < 0.5 ? 0 : 0.35;
  db.routes = {}; db.lanes = {};
  let nr = 1, nl = 1;
  const route = (o) => { db.routes[nr] = { geometry: randArcRoute(R, { pt, n: ri(0, 5), smoothShare, scale: S, ...o }) }; return nr++; };
  for (const t of Object.values(db.transitions)) {
    const dests = destinationsOf(t, db.shapes);
    if (t.style === 'follow_the_leader') { if (R() < 0.6) t.route = route({ targets: [exactSamples(db.shapes[t.dest], 1)[0]] }); continue; }
    if (R() < 0.3) continue;
    if (R() < 0.5) {
      const F = pt(), G = pt(), rid = route({ targets: [F, G], from: F, to: G });
      for (let k = 0; k < t.slots; k++) if (R() < 0.8) {
        db.lanes[nl++] = { transition: t.id, slot: k, route: rid, offset: R() < 0.15 ? [0, 0] : [c() / 10, c() / 10],
                           ...(R() < 0.35 ? { adjust: randAdjust(R, db.routes[rid].geometry, S / 20) } : {}) };
      }
    } else for (let k = 0; k < t.slots; k++) if (R() < 0.75) db.lanes[nl++] = { transition: t.id, slot: k, route: route({ targets: [dests[k]] }), offset: null };
  }
  return w;
}
/** β over the routes: every route point (and its placed copy on each lane), plus the largest Adjust displacement. */
function routeBeta(db) {
  let b = 0, dmax = 0; const see = (q) => (b = Math.max(b, Math.hypot(q[0], q[1])));
  const offs = (rid) => [[0, 0], ...Object.values(db.lanes ?? {}).filter((l) => l.route === +rid && l.offset).map((l) => l.offset)];
  for (const [rid, r] of Object.entries(db.routes ?? {})) for (const o of offs(rid))
    for (const q of [r.geometry.from, r.geometry.to, ...r.geometry.points.map((x) => x.at)]) see([q[0] + o[0], q[1] + o[1]]);
  for (const l of Object.values(db.lanes ?? {})) for (const k of l.adjust?.keys ?? []) dmax = Math.max(dmax, Math.hypot(k.d[0], k.d[1]));
  return b + dmax;
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

const laneOf = (db, tid, slot) => Object.values(db.lanes ?? {}).find((l) => l.transition === tid && l.slot === slot);
const routeTally = { worlds: 0, arcRoutes: 0 };
for (let seed = 1; seed <= SEEDS; seed++) for (const mode of ['normal', 'boundary', 'chain', 'route']) {
  if (mode === 'chain' && seed % 10) continue;                       // one adversarial chain per 10 seeds
  const boundary = mode === 'boundary' || mode === 'chain' || (mode === 'route' && seed % 2 === 0);   // route worlds alternate
  const { db, S, R } = mode === 'chain' ? chainWorld(seed) : mode === 'route' ? routeWorld(seed, boundary) : makeWorld(seed, boundary);
  if (mode === 'route') { routeTally.worlds++; routeTally.arcRoutes += Object.values(db.routes).filter((r) => hasArc(r.geometry)).length; }
  const smoothRoutes = Object.values(db.routes ?? {}).some((r) => hasSmooth(r.geometry));
  const beta = Math.max(betaOf(db), routeBeta(db));
  // arc spans in the show; every founding span on a route (a lane's or a trail's) counts as one too (§8.11)
  const onRoute = (o, s) => { const t = db.transitions[s.row.transition]; return o.kind(s) === 'founding' && (t.style === 'follow_the_leader' ? t.route != null : !!laneOf(db, t.id, s.row.slot)); };
  const A = db.marchers.reduce((a, m) => { const o = o0(db); return a + o.spans(m.id).filter((s) => s.row && (db.transitions[s.row.transition].style === 'arc' || onRoute(o, s))).length; }, 0);
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
        if (smoothRoutes) {}                                         // a smooth route's cubic can overshoot its points: no bound here
        else if (!(Math.hypot(x[0], x[1]) <= beta * Math.sqrt(1 + A) * (1 + 1e-12) + 1e-9)) F('P-13 derived range', `M${m.id}@${b2}: |P| = ${Math.hypot(x[0], x[1]).toExponential(3)} > β√(1+a) = ${(beta * Math.sqrt(1 + A)).toExponential(3)}`); else pass('P-13 derived range');
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
      // P-14 (R-14, R-14″): a founding span on a lane's route of corners and arc legs walks it as the spec's walk, written above
      const lane = s.row && laneOf(db, s.row.transition, s.row.slot), lt = s.row && db.transitions[s.row.transition];
      if (lane && lt.style !== 'follow_the_leader' && o.kind(s) === 'founding') {
        const g = db.routes[lane.route].geometry, Aorig = o.evalSpan(s, s.start), Bdst = destinationsOf(lt, db.shapes)[s.row.slot];
        if (!hasSmooth(g) && !(lane.offset && lane.adjust?.keys?.length)) {
          const kind = lane.offset ? 'group' : 'own';
          for (const f of [0.03, 0.2, 0.37, 0.5, 0.61, 0.8, 0.97, R()]) {
            const b = s.start + f * (s.end - s.start), pr = (b - lt.start) / (lt.end - lt.start);
            const want = lane.offset ? groupWalkAt(Aorig, g, Bdst, lane.offset, pr) : ownWalkAt(Aorig, g, Bdst, pr), got = o.evalSpan(s, b);
            const tag = `P-14 ${kind} route${hasArc(g) ? ' with arcs' : ''}`;
            if (!(d2(got, want.at) <= 10 * eps + want.slack)) F(tag, `M${m.id} T${lt.id}@${b}: ${fmt(got)} vs ${fmt(want.at)} (${JSON.stringify(g).slice(0, 160)})`); else pass(tag);
          }
        }
      }
      // P-6 trail adherence during founding FTL spans; with a trail route, on the line-up, the route's legs or the shape
      const ftlT = s.row && db.transitions[s.row.transition];
      if (ftlT && ftlT.style === 'follow_the_leader' && ftlT.route != null && s.start === ftlT.start) {
        const g = db.routes[ftlT.route].geometry;
        if (!hasSmooth(g)) {
          const e = o.ftlEntry(ftlT.id), origins = e.members.map((mm) => o.evalSpan(o.spans(mm).find((x) => x.row && x.row.transition === ftlT.id && x.start === ftlT.start), ftlT.start));
          const W = cleanLegs(origins[origins.length - 1], g.points, exactSamples(db.shapes[ftlT.dest], 1)[0], g.toBulge);
          const tag = `P-6 trail route${hasArc(g) ? ' with arcs' : ''}`;
          for (const f of [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1, R()]) {
            const b = s.start + f * (s.end - s.start), p = o.evalSpan(s, b);
            const dist = Math.min(distToShape(p, db.shapes[ftlT.dest]), distToPoly(p, origins), ...W.legs.map((l) => distToLeg(p, l)));
            if (!(dist <= 10 * eps)) F(tag, `M${m.id} T${ftlT.id}@${b}: ${dist.toExponential(2)} off the trail`); else pass(tag);
          }
        }
      } else if (s.row && db.transitions[s.row.transition].style === 'follow_the_leader' && s.start === db.transitions[s.row.transition].start) {
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

console.log(JSON.stringify({ seeds: SEEDS, modes: ['normal', 'boundary', 'chain', 'route'], routeWorlds: routeTally, counts, failures }, null, 1));
console.log(`${Object.entries(counts).filter(([k]) => k.endsWith('checked')).reduce((a, [, v]) => a + v, 0)} property checks, ${failures.length} failures`);
if (failures.length) process.exitCode = 1;

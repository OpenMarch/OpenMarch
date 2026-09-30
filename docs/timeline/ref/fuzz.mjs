// Differential fuzzer: cached resolver (§9) vs uncached oracle (§8) under random edit batches.
// usage: node fuzz.mjs [rules=v0.2] [seeds=200] [steps=60]
import { makeOracle } from './oracle.mjs';
import { makeResolver } from './resolver.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const EXPECT_FAIL = process.argv.includes('--expect-fail');
const [rules = 'v0.2+', SEEDS = '200', STEPS = '60'] = args;
const EPS = 1e-6;

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeWorld(seed) {
  const R = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = (xs) => xs[Math.floor(R() * xs.length)];
  const pt = () => [ri(-10, 10), ri(-10, 10)];
  const SHOW = 32;
  const db = { marchers: [], shapes: {}, transitions: {}, assignments: [] };
  let nextRow = 1, nextT = 1;

  const randShape = () => {
    const k = pick(['line', 'freehand', 'circle', 'box']);
    if (k === 'line') { const a = pt(); let b = pt(); if (b[0] === a[0] && b[1] === a[1]) b = [a[0] + 1, a[1]]; return { kind: k, geometry: { points: [a, b] } }; }
    if (k === 'freehand') { const pts = [pt()]; for (let i = 0; i < ri(1, 4); i++) pts.push(R() < 0.15 ? pts.at(-1).slice() : pt()); if (pts.every((p) => p[0] === pts[0][0] && p[1] === pts[0][1])) pts.push([pts[0][0] + 1, pts[0][1]]); return { kind: k, geometry: { points: pts } }; }
    if (k === 'circle') return { kind: k, geometry: { center: pt(), radius: ri(1, 6), start_angle: R() * 6, clockwise: R() < 0.5 } };
    return { kind: k, geometry: { origin: pt(), width: ri(1, 6), height: ri(1, 6) } };
  };
  for (let i = 1; i <= 6; i++) db.shapes[i] = randShape();
  for (let m = 1; m <= ri(4, 7); m++) db.marchers.push({ id: m, home: pt() });

  const randParams = (style) => style === 'arc' ? { bulge: +(R() - 0.5).toFixed(3) }
    : style === 'follow_the_leader' ? { waypoints: Array.from({ length: ri(0, 2) }, pt) } : null;
  const newTransition = () => {
    const s = ri(0, SHOW - 2), e = ri(s + 1, Math.min(SHOW, s + 12));
    const style = pick(['direct', 'direct', 'arc', 'follow_the_leader', 'follow_the_leader']);
    const t = { id: nextT++, start: s, end: e, dest: ri(1, 6), slots: ri(1, 5), style, order: R() < 0.8 ? 'inherit' : 'slot', params: randParams(style) };
    if (style !== 'follow_the_leader' && R() < 0.3) { t.dest = null; t.points = Array.from({ length: t.slots }, pt); }
    db.transitions[t.id] = t; return t;
  };
  for (let i = 0; i < ri(6, 10); i++) newTransition();

  // ---- invariant checks mirroring §6 (the DB would reject these)
  const overlaps = (a, b) => a.start < b.end && b.start < a.end;
  const validRow = (r, ignoreId) => {
    const t = db.transitions[r.transition];
    if (!t || r.start < t.start || r.end > t.end || r.end <= r.start || r.slot < 0 || r.slot >= t.slots) return false;
    for (const o of db.assignments) {
      if (o.id === ignoreId) continue;
      if (o.transition === r.transition && (o.slot === r.slot || o.marcher === r.marcher)) return false;  // I-A4, I-A5
      if (o.marcher === r.marcher && o.layer === r.layer && overlaps(o, r)) return false;                // I-A3
    }
    return true;
  };
  const randRow = () => {
    const t = pick(Object.values(db.transitions)); if (!t) return null;
    const full = R() < 0.6;
    const s = full ? t.start : ri(t.start, t.end - 1), e = full ? t.end : ri(s + 1, t.end);
    return { id: nextRow, marcher: pick(db.marchers).id, transition: t.id, slot: ri(0, t.slots - 1), start: s, end: e, layer: pick([0, 0, 0, 1, 2]) };
  };
  for (let i = 0; i < 60; i++) { const r = randRow(); if (r && validRow(r)) { db.assignments.push(r); nextRow++; } }

  // ---- edit operations: each mutates db and returns a partial batch, or null if it would be rejected
  const ops = {
    insertRow() { for (let i = 0; i < 20; i++) { const r = randRow(); if (r && validRow(r)) { nextRow++; db.assignments.push(r); return { rows: [{ before: null, after: { ...r } }] }; } } return null; },
    deleteRow() { if (!db.assignments.length) return null; const i = ri(0, db.assignments.length - 1); const [r] = db.assignments.splice(i, 1); return { rows: [{ before: r, after: null }] }; },
    updateRow() {
      if (!db.assignments.length) return null;
      const r = pick(db.assignments), t = db.transitions[r.transition], n = { ...r };
      const f = pick(['layer', 'range', 'slot']);
      if (f === 'layer') n.layer = pick([0, 1, 2]);
      if (f === 'range') { n.start = ri(t.start, t.end - 1); n.end = ri(n.start + 1, t.end); }
      if (f === 'slot') n.slot = ri(0, t.slots - 1);
      if (!validRow(n, r.id)) return null;
      const before = { ...r }; Object.assign(r, n); return { rows: [{ before, after: { ...r } }] };
    },
    moveShape() { const id = ri(1, 6), s = db.shapes[id], d = [ri(-4, 4), ri(-4, 4)], g = structuredClone(s.geometry);
      if (g.points) g.points = g.points.map((p) => [p[0] + d[0], p[1] + d[1]]);
      if (g.center) g.center = [g.center[0] + d[0], g.center[1] + d[1]];
      if (g.origin) g.origin = [g.origin[0] + d[0], g.origin[1] + d[1]];
      s.geometry = g; return { shapes: [id] }; },
    reshape() { const id = ri(1, 6); db.shapes[id] = randShape(); return { shapes: [id] }; },
    style() { const t = pick(Object.values(db.transitions)); if (!t) return null; const before = { ...t };
      t.style = pick(['direct', 'arc', 'follow_the_leader']); t.params = randParams(t.style);
      if (t.style === 'follow_the_leader' && t.dest == null) { t.dest = ri(1, 6); delete t.points; }   // I-T5: FTL needs a shape
      return { transitions: [{ id: t.id, before, after: { ...t } }] }; },
    params() { const t = pick(Object.values(db.transitions)); if (!t || t.style === 'direct') return null; const before = { ...t };
      t.params = randParams(t.style); return { transitions: [{ id: t.id, before, after: { ...t } }] }; },
    order() { const t = pick(Object.values(db.transitions)); if (!t) return null; const before = { ...t };
      t.order = t.order === 'inherit' ? 'slot' : 'inherit'; return { transitions: [{ id: t.id, before, after: { ...t } }] }; },
    slots() { const t = pick(Object.values(db.transitions)); if (!t) return null;
      const used = Math.max(-1, ...db.assignments.filter((r) => r.transition === t.id).map((r) => r.slot));
      const n = ri(used + 1, 6); if (n < 1 || n === t.slots) return null; const before = { ...t }; t.slots = n;
      if (t.dest == null) { t.points = t.points.slice(0, n); while (t.points.length < n) t.points.push(pt()); }   // place new slots in the same edit
      return { transitions: [{ id: t.id, before, after: { ...t } }] }; },
    dest() { // switch between a shape and individual placement, or re-point to another shape
      const t = pick(Object.values(db.transitions)); if (!t) return null; const before = { ...t };
      if (t.dest != null && t.style !== 'follow_the_leader' && R() < 0.5) { t.dest = null; t.points = Array.from({ length: t.slots }, pt); }
      else { t.dest = ri(1, 6); delete t.points; }
      return { transitions: [{ id: t.id, before, after: { ...t } }] }; },
    movePoint() { // edit one individually placed destination: arrives as a destinations change, not a transition change
      const ts = Object.values(db.transitions).filter((t) => t.dest == null); if (!ts.length) return null;
      const t = pick(ts); t.points = t.points.map((q) => q.slice()); t.points[ri(0, t.slots - 1)] = pt();
      return { destinations: [t.id] }; },
    range() { // R-E1 anchored rewrite; the whole edit aborts if any invariant fails
      const t = pick(Object.values(db.transitions)); if (!t) return null;
      const ns = ri(Math.max(0, t.start - 3), t.start + 3), ne = ri(Math.max(ns + 1, t.end - 3), t.end + 3);
      if (ne > SHOW || ns >= ne || (ns === t.start && ne === t.end)) return null;
      const snapshot = JSON.stringify(db);
      const before = { ...t }; t.start = ns; t.end = ne;
      const changed = [];
      for (const r of db.assignments.filter((r) => r.transition === t.id)) {
        const b = { ...r };
        if (r.start === before.start) r.start = ns;
        if (r.end === before.end) r.end = ne;
        if (r.start !== b.start || r.end !== b.end) changed.push({ before: b, after: r });
      }
      const ok = db.assignments.filter((r) => r.transition === t.id).every((r) => validRow(r, r.id));
      if (!ok) { const s = JSON.parse(snapshot); Object.assign(db, s); return null; }   // ROLLBACK
      return { transitions: [{ id: t.id, before, after: { ...t } }], rows: changed.map(({ before, after }) => ({ before, after: { ...after } })) };
    },
    deleteTransition() { // FK cascade
      const ids = Object.keys(db.transitions); if (ids.length < 3) return null;
      const t = db.transitions[pick(ids)]; delete db.transitions[t.id];
      const gone = db.assignments.filter((r) => r.transition === t.id); db.assignments = db.assignments.filter((r) => r.transition !== t.id);
      return { transitions: [{ id: t.id, before: t, after: null }], rows: gone.map((r) => ({ before: r, after: null })) };
    },
    addTransition() { const t = newTransition(); return { transitions: [{ id: t.id, before: null, after: { ...t } }] }; },
    home() { const m = pick(db.marchers); m.home = pt(); return { marchers: [{ id: m.id }] }; },
    steal() { // a higher-layer row that splits someone's existing span (the #2 pattern)
      const victim = pick(db.assignments); if (!victim) return null;
      const t = pick(Object.values(db.transitions));
      const s = Math.max(t.start, victim.start), e = Math.min(t.end, victim.end); if (e - s < 1) return null;
      const a = ri(s, e - 1), b = ri(a + 1, e);
      const r = { id: nextRow, marcher: victim.marcher, transition: t.id, slot: ri(0, t.slots - 1), start: a, end: b, layer: victim.layer + 1 };
      if (!validRow(r)) return null; nextRow++; db.assignments.push(r); return { rows: [{ before: null, after: { ...r } }] };
    },
  };
  const opNames = Object.keys(ops);
  const merge = (a, b) => ({ destinations: [...(a.destinations ?? []), ...(b.destinations ?? [])], rows: [...(a.rows ?? []), ...(b.rows ?? [])], transitions: [...(a.transitions ?? []), ...(b.transitions ?? [])],
                             shapes: [...(a.shapes ?? []), ...(b.shapes ?? [])], marchers: [...(a.marchers ?? []), ...(b.marchers ?? [])] });
  function randomBatch() {
    const n = R() < 0.7 ? 1 : ri(2, 3); let batch = { rows: [], transitions: [], shapes: [], marchers: [] }; const names = [];
    for (let i = 0; i < n; i++) { const name = pick(opNames); const b = ops[name](); if (b) { batch = merge(batch, b); names.push(name); } }
    return names.length ? { batch, names } : null;
  }
  return { db, R, randomBatch, SHOW };
}

function compare(res, db, R, fraction) {
  const o = makeOracle(db);
  for (const m of db.marchers) for (let b = -1; b <= 34; b += 0.5) {
    if (R() > fraction) continue;
    const x = res.positionAt(m.id, b), y = o.positionAt(m.id, b);
    if (!(Math.abs(x[0] - y[0]) < EPS && Math.abs(x[1] - y[1]) < EPS)) return { m: m.id, b, resolver: x, oracle: y };
  }
  return null;
}

const stats = { seeds: 0, batches: 0, divergent: 0, closure: 0, ops: {} };
const firstFailures = [];
for (let seed = 1; seed <= +SEEDS; seed++) {
  const w = makeWorld(seed);
  const res = makeResolver(w.db, { rules });
  stats.seeds++;
  compare(res, w.db, w.R, 1);                      // warm everything
  for (let step = 0; step < +STEPS; step++) {
    const rb = w.randomBatch(); if (!rb) continue;
    stats.batches++; for (const n of rb.names) stats.ops[n] = (stats.ops[n] ?? 0) + 1;
    let cc, bad;
    try {
      res.applyBatch(rb.batch);
      cc = res.checkCacheClosure();
      bad = compare(res, w.db, w.R, w.R() < 0.4 ? 0.25 : 1);
    } catch (e) { bad = { exception: e.message.slice(0, 60) }; stats.exceptions = (stats.exceptions ?? 0) + 1; }
    if (cc !== true || bad) {
      if (bad) stats.divergent++; if (cc !== true && cc !== undefined) stats.closure++;
      if (firstFailures.length < 4) firstFailures.push({ seed, step, ops: rb.names, closure: cc, divergence: bad });
      break;                                          // one failure per seed; move on
    }
  }
}
console.log(JSON.stringify({ rules, ...stats, firstFailures }, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(4) : v), 1));
console.log(`rules ${rules}: ${stats.batches} batches, ${stats.divergent} divergent, ${stats.closure} closure violations, ${stats.exceptions ?? 0} exceptions${EXPECT_FAIL ? ' (failures expected)' : ''}`);
const failed = stats.divergent + stats.closure + (stats.exceptions ?? 0) > 0;
if (failed !== EXPECT_FAIL) process.exitCode = 1;   // with --expect-fail, finding no failure is the error

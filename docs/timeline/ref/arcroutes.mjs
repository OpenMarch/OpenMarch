// Random route geometry with arc legs (R-14″, pathways step 10a) for fuzz.mjs, props.mjs and e2e.mjs.
// A route's leg i arrives at points[i]; the last leg arrives at `to`'s side and its bulge is the route's `toBulge`.
// Every route this writes is valid by R-14″: each bulge is a finite number with 0 < |bulge| <= 1/2, and a point at
// either end of an arc leg is a corner (no `tension`). Points may repeat the one before, sit within or just past
// EPS_GEOM (1e-9) of it, or land on (or near) a target: B, F or G, so cleaning drops them and hands on bulges.

/** Bulges at and around the limits: exactly ±1/2, tiny (straight to R-8 below 2.5e-13, nearly straight above). */
export const EDGE_BULGES = [0.5, -0.5, 0.4999999, -0.25, 0.25, 1e-9, -1e-9, 1e-13, -1e-13, 1e-6, -1e-4];

export function randBulge(R) {
  if (R() < 0.45) return EDGE_BULGES[Math.floor(R() * EDGE_BULGES.length)];
  const k = R() - 0.5;
  return k === 0 ? 0.5 : k;
}

/** R-14″ validity, as the app's validateRouteGeometry has it; returns a reason or null. */
export function arcRouteProblem(g) {
  const ok = (k) => typeof k === 'number' && Number.isFinite(k) && k !== 0 && Math.abs(k) <= 0.5;
  if ('toBulge' in g && !ok(g.toBulge)) return 'toBulge out of range';
  const n = g.points.length;
  const arc = (leg) => (leg < n ? 'bulge' in g.points[leg] : 'toBulge' in g);
  for (let i = 0; i < n; i++) {
    const q = g.points[i];
    if ('bulge' in q && !ok(q.bulge)) return `points[${i}].bulge out of range`;
    if ((q.tension ?? 0) > 0 && (arc(i) || arc(i + 1))) return `points[${i}] is smooth beside an arc leg`;
  }
  return null;
}

/**
 * A random route. `pt()` gives a fresh point; `targets` are points to land on or near (B for an own path, F and G for a
 * group path); `from` and `to` default to fresh points. `arcShare` is each leg's chance of an arc, `smoothShare` a
 * corner-eligible point's chance of a tension. `ids` lets a reshape keep the ids an Adjust names.
 */
export function randArcRoute(R, { pt, n, targets = [], from, to, arcShare = 0.5, smoothShare = 0.35, ids, scale = 10 }) {
  const pick = (xs) => xs[Math.floor(R() * xs.length)];
  const nudge = (q, e) => { const a = R() * 2 * Math.PI; return [q[0] + e * Math.cos(a), q[1] + e * Math.sin(a)]; };
  const at = [];
  for (let i = 0; i < n; i++) {
    const prev = at[i - 1], u = R();
    if (prev && u < 0.08) at.push(prev.slice());                                      // repeated point
    else if (prev && u < 0.13) at.push(nudge(prev, 1e-10 * Math.max(1, scale)));       // within EPS_GEOM of the last
    else if (prev && u < 0.16) at.push(nudge(prev, 2e-9 * Math.max(1, scale)));        // just past it at small scales
    else if (targets.length && u < 0.27) at.push(pick(targets).slice());              // on B (or F, G)
    else if (targets.length && u < 0.32) at.push(nudge(pick(targets), 1e-10));          // within EPS_GEOM of B
    else at.push(pt());
  }
  const arcs = Array.from({ length: n + 1 }, () => R() < arcShare);
  const points = at.map((q, i) => ({ id: ids?.[i] ?? `p${i}`, at: q }));
  points.forEach((q, i) => {
    if (arcs[i]) q.bulge = randBulge(R);
    else if (!arcs[i + 1] && R() < smoothShare) q.tension = pick([1, 1, 0.3, 2, 0.01]);
  });
  const g = { v: 1, from: from ?? pt(), to: to ?? pt(), points };
  if (arcs[n]) g.toBulge = randBulge(R);
  const why = arcRouteProblem(g);
  if (why) throw new Error(`arcroutes generated an invalid route: ${why}`);
  return g;
}

/** Set or clear one leg's bulge (leg n is `toBulge`), making the points at its ends corners. Returns the new geometry. */
export function toggleLeg(R, g) {
  const out = structuredClone(g), n = out.points.length, leg = Math.floor(R() * (n + 1));
  const has = leg < n ? 'bulge' in out.points[leg] : 'toBulge' in out;
  if (has && R() < 0.5) { if (leg < n) delete out.points[leg].bulge; else delete out.toBulge; return out; }
  const k = randBulge(R);
  if (leg < n) out.points[leg].bulge = k; else out.toBulge = k;
  if (leg - 1 >= 0) delete out.points[leg - 1].tension;
  if (leg < n) delete out.points[leg].tension;
  return out;
}

/** A point of the route moved onto (or within EPS_GEOM of) `target`, keeping its bulge and tension where still valid. */
export function landOn(R, g, target) {
  if (!g.points.length) return null;
  const out = structuredClone(g), i = Math.floor(R() * out.points.length);
  out.points[i].at = R() < 0.6 ? target.slice() : [target[0] + 1e-10, target[1] - 1e-10];
  return out;
}

/** True when the route has an arc leg. */
export const hasArc = (g) => 'toBulge' in g || g.points.some((q) => 'bulge' in q);
export const hasSmooth = (g) => g.points.some((q) => (q.tension ?? 0) > 0);

/**
 * A random Adjust profile on route `g`: keys on adjacent anchors mostly, with pairs on one (a, b) at close `f`
 * (E-J5's neighbourhood: on a straight stretch they are refused, on an arc leg the view leaves them to the app).
 */
export function randAdjust(R, g, dmax) {
  const anchors = ['from', ...g.points.map((q) => q.id), 'to'];
  const keys = [], n = 1 + Math.floor(R() * 3);
  const d = () => [(R() * 2 - 1) * dmax, (R() * 2 - 1) * dmax];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(R() * (anchors.length - 1)), b = R() < 0.85 ? j + 1 : j + 1 + Math.floor(R() * (anchors.length - 1 - j));
    const f = [0, 1, 0.5, R(), R()][Math.floor(R() * 5)];
    keys.push({ a: anchors[j], b: anchors[b], f, d: d() });
    if (R() < 0.3) keys.push({ a: anchors[j], b: anchors[b], f: Math.min(1, f + R() * 0.05), d: d() });   // a close pair
  }
  return { v: 1, keys };
}

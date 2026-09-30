// Shared, stateless helpers used by both the oracle and the cached resolver.
// Implements spec R-2 (flattening), R-8 (arc), R-13 (sampling / exact destination paths) and §8.10.
// No curve is ever flattened: circles are evaluated from their exact parameterization.

export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** Smallest meaningful distance (§8.10): a chord shorter than this is treated as a straight line. */
export const EPS_GEOM = 1e-9;
/** Endpoint-exact interpolation (§8.10): t <= 0 returns a, t >= 1 returns b, bit for bit. */
export const lerp = (a, b, t) => (t <= 0 ? a : t >= 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
export const clamp01 = (t) => Math.max(0, Math.min(1, t));
export const cumOf = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i])); return c; };

/** Point at arc length d along a polyline. Zero-length segments are never selected (§8.10). O(log P). */
export function pointAtDist(pts, cum, d) {
  if (d <= 0) return pts[0];
  const L = cum[cum.length - 1];
  if (d >= L) return pts[pts.length - 1];
  let lo = 1, hi = cum.length - 1;               // first i with cum[i] >= d, so cum[i-1] < d
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] >= d) hi = mid; else lo = mid + 1; }
  return lerp(pts[lo - 1], pts[lo], (d - cum[lo - 1]) / (cum[lo] - cum[lo - 1]));
}

/**
 * R-13: the exact destination path of a path-kind shape: { closed, L, at(s) } with s in [0, L] (clamped).
 * Polylines (line, freehand, box) are exact already; a circle is evaluated from its angle.
 */
export function destPath(shape) {
  const g = shape.geometry;
  if (shape.kind === 'circle') {
    const L = 2 * Math.PI * g.radius, dir = g.clockwise ? -1 : 1;
    return { closed: true, L, at(s) {
      const a = g.start_angle + dir * (Math.max(0, Math.min(L, s)) / g.radius);
      return [g.center[0] + g.radius * Math.cos(a), g.center[1] + g.radius * Math.sin(a)];
    } };
  }
  let pts;
  if (shape.kind === 'line' || shape.kind === 'freehand') pts = g.points;
  else if (shape.kind === 'box') { const [x, y] = g.origin; pts = [[x, y], [x + g.width, y], [x + g.width, y + g.height], [x, y + g.height], [x, y]]; }
  else throw new Error(`${shape.kind} is not a path kind`);
  const cum = cumOf(pts);
  return { closed: shape.kind === 'box', L: cum[cum.length - 1], at: (s) => pointAtDist(pts, cum, s) };
}
export const paramT = (closed, i, n) => (closed ? i / n : (n === 1 ? 0 : i / (n - 1)));

/** R-13: a transition's slot destinations, from its shape or from individually placed points (D-16). */
export function destinationsOf(t, shapes) {
  if (t.dest == null) return t.points.slice(0, t.slots).map((p) => [p[0], p[1]]);
  return sampleDestinations(shapes[t.dest], t.slots);
}

/** R-13 slot destinations sampled from a shape. */
export function sampleDestinations(shape, n) {
  if (shape.kind === 'block') { const g = shape.geometry; return Array.from({ length: n }, (_, i) => [g.origin[0] + (i % g.cols) * g.spacing[0], g.origin[1] + Math.floor(i / g.cols) * g.spacing[1]]); }
  const P = destPath(shape);
  return Array.from({ length: n }, (_, i) => P.at(paramT(P.closed, i, n) * P.L));
}

/**
 * R-8: circular MINOR arc from A to B with signed bulge k = sagitta / chord, |k| <= 1/2, at constant angular speed.
 * Numerically stable: everything is expressed relative to the chord (no far-away centre, no radius
 * subtraction, no division by the chord), endpoints are returned exactly, and finite inputs give finite outputs.
 */
export function arcPoint(A, B, k, p) {
  if (p <= 0) return A;
  if (p >= 1) return B;
  const dx = B[0] - A[0], dy = B[1] - A[1], c = Math.hypot(dx, dy);
  if (c < EPS_GEOM) return lerp(A, B, p);                 // below the geometric scale: straight line
  const h = c / 2, phi = 2 * Math.atan(2 * k);               // signed half-angle at the centre; = 2·atan(k·c/h) without dividing by h
  if (Math.abs(phi) < 1e-12) return lerp(A, B, p);
  const sinPhi = Math.sin(phi);
  const along = (h * Math.sin(phi * (2 * p - 1))) / sinPhi;                      // from chord midpoint, toward B
  const normal = (2 * h * Math.sin(phi * p) * Math.sin(phi * (1 - p))) / sinPhi;  // toward the +90° side for k > 0
  const ux = dx / c, uy = dy / c;
  const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
  return [mx + ux * along - uy * normal, my + uy * along + ux * normal];
}

/** R-2: rows (one marcher) -> spans partitioning (-inf, +inf). Each span: {row|null, start, end}. */
export function flatten(rows) {
  const cuts = [...new Set(rows.flatMap((r) => [r.start, r.end]))].sort((a, b) => a - b);
  const raw = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const s = cuts[i], e = cuts[i + 1];
    let win = null;
    for (const r of rows) if (r.start <= s && r.end >= e && (!win || r.layer > win.layer)) win = r;
    raw.push({ row: win, start: s, end: e });
  }
  const all = [{ row: null, start: -Infinity, end: raw.length ? raw[0].start : Infinity }, ...raw];
  if (raw.length) all.push({ row: null, start: raw[raw.length - 1].end, end: Infinity });
  const out = [];
  for (const sp of all) {
    const last = out[out.length - 1];
    if (last && (last.row?.id ?? null) === (sp.row?.id ?? null) && last.end === sp.start) { last.end = sp.end; continue; }
    out.push({ ...sp });
  }
  return out;
}

/**
 * R-9 steps 3-4: an FTL trail = polyline through member origins and waypoints to the destination's
 * start, followed by the EXACT destination path. Returns { destOffset, at(d) }.
 */
export function makeTrail(origins, waypoints, path) {
  const pre = [...origins, ...waypoints, path.at(0)];
  const cum = cumOf(pre), destOffset = cum[cum.length - 1];
  return { cum, destOffset, at: (d) => (d < destOffset ? pointAtDist(pre, cum, d) : path.at(d - destOffset)) };
}

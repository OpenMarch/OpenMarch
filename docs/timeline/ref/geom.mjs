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

/**
 * R-14 (v0.9 steps 1 and 2): the walked path of a founding route span, from A through the route's inner points to B.
 * Written independently of the app's geometry (linear scans, its own Catmull–Rom and Bézier code), so the two
 * check each other. `pts` are the route's points ({at, tension?, bulge?}); `F`, `G` its from and to (tangent neighbours);
 * `toBulge` the last leg's bulge. R-14″ (step 10a): a leg whose arriving point (or `toBulge`, for the leg into B) has a
 * bulge is R-8's arc, measured exactly as r·θ from the centre form (r = (h² + s²)/(2|s|), θ = 4·atan(2|k|)), not sampled.
 */
export function arcLen(P0, P3, k) {
  const c = dist(P0, P3);
  if (c < EPS_GEOM || Math.abs(2 * Math.atan(2 * k)) < 1e-12) return c;      // R-8's straight cases
  const h = c / 2, s = k * c;
  return ((h * h + s * s) / (2 * Math.abs(s))) * 4 * Math.atan(2 * Math.abs(k));
}
export function routeWalk(A, pts, B, F = A, G = B, toBulge = undefined) {
  const V = [A], tau = [0], src = [-1];
  pts.forEach((q, i) => { if (dist(V[V.length - 1], q.at) >= EPS_GEOM) { V.push(q.at); tau.push(q.tension > 0 ? q.tension : 0); src.push(i); } });
  let intoB;   // R-14″: inner points dropped at B hand the leg into B the bulge of the first of them
  while (V.length > 1 && dist(V[V.length - 1], B) < EPS_GEOM) { V.pop(); tau.pop(); intoB = src.pop(); }
  V.push(B); tau.push(0); src.push(-1);
  const bulgeOf = (j) => { const k = j + 1 === V.length - 1 ? (intoB === undefined ? toBulge : pts[intoB].bulge) : pts[src[j + 1]].bulge; return typeof k === 'number' && Number.isFinite(k) && k !== 0 ? k : null; };
  const m = V.length - 2;
  // Tangent neighbours from the route alone: N = [F, P'..., G]; rep[i] is P_i's representative's index in N
  const N = [F], rep = [];
  pts.forEach((q, i) => { if (i === 0 || dist(N[N.length - 1], q.at) >= EPS_GEOM) N.push(q.at); rep.push(N.length - 1); });
  N.push(G);
  const handle = (k) => {
    if (!(tau[k] > 0)) return null;
    const q = V[k], a = N[rep[src[k]] - 1], c = N[rep[src[k]] + 1], t = tau[k];
    let dax = a[0] - q[0], day = a[1] - q[1], dcx = c[0] - q[0], dcy = c[1] - q[1];
    let ra = Math.hypot(dax, day), rc = Math.hypot(dcx, dcy);
    if (ra < EPS_GEOM && rc < EPS_GEOM) return { out: q, in: q };
    if (ra < EPS_GEOM) { dax = -dcx; day = -dcy; ra = rc; } else if (rc < EPS_GEOM) { dcx = -dax; dcy = -day; rc = ra; }
    const d1 = Math.sqrt(ra), d2 = Math.sqrt(rc), wo = 3 * d1 * (d1 + d2), wi = 3 * d2 * (d1 + d2);
    return { out: [q[0] + (t * (ra * dcx - rc * dax)) / wo, q[1] + (t * (ra * dcy - rc * day)) / wo],
             in: [q[0] + (t * (rc * dax - ra * dcx)) / wi, q[1] + (t * (rc * day - ra * dcy)) / wi] };
  };
  const K = 64;
  const bez = (P0, c1, c2, P3, t) => { const u = 1 - t, k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
    return [k0 * P0[0] + k1 * c1[0] + k2 * c2[0] + k3 * P3[0], k0 * P0[1] + k1 * c1[1] + k2 * c2[1] + k3 * P3[1]]; };
  const pieces = [], D = [0];
  for (let j = 0; j <= m; j++) {
    const P0 = V[j], P3 = V[j + 1], h0 = handle(j), h3 = handle(j + 1), k = bulgeOf(j);
    if (k !== null) { pieces.push({ arc: k }); D.push(D[j] + arcLen(P0, P3, k)); continue; }
    if (!h0 && !h3) { pieces.push(null); D.push(D[j] + Math.hypot(P3[0] - P0[0], P3[1] - P0[1])); continue; }
    const c1 = j === 0 ? [P0[0] + (P3[0] - P0[0]) / 3, P0[1] + (P3[1] - P0[1]) / 3] : h0 ? h0.out : P0;
    const c2 = j === m ? [P3[0] + (P0[0] - P3[0]) / 3, P3[1] + (P0[1] - P3[1]) / 3] : h3 ? h3.in : P3;
    const e = [0];
    for (let i = 1; i <= K; i++) { const a = bez(P0, c1, c2, P3, (i - 1) / K), b = bez(P0, c1, c2, P3, i / K); e.push(e[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    pieces.push({ c1, c2, e });
    D.push(D[j] + e[K]);
  }
  const L = D[D.length - 1];
  return {
    V, D, L, pieces, tau, src,
    at(p) {
      if (p <= 0) return A;
      if (p >= 1) return B;
      if (V.length === 2 && pieces[0]) return arcPoint(A, B, pieces[0].arc, p);   // one arc leg is R-8's arc itself
      if (V.length === 2 || L < EPS_GEOM) return lerp(A, B, p);   // [A, B] is R-7, bit for bit (QA-RT-2)
      const d = p * L;
      let j = 0;
      while (j < V.length - 2 && !(d < D[j + 1])) j++;
      const x = d - D[j], pc = pieces[j];
      if (!pc) return lerp(V[j], V[j + 1], x / (D[j + 1] - D[j]));
      if ('arc' in pc) return arcPoint(V[j], V[j + 1], pc.arc, x / (D[j + 1] - D[j]));
      let i = 1;
      while (i <= K && !(x < pc.e[i])) i++;
      if (i > K) return V[j + 1];
      return bez(V[j], pc.c1, pc.c2, V[j + 1], (i - 1 + (x - pc.e[i - 1]) / (pc.e[i] - pc.e[i - 1])) / K);
    },
  };
}

/**
 * R-13′ and R-12′ (pathways step 4): how a follow-the-leader entry reads its destination. With a shape the stops are
 * R-13's samples: member q of m takes sample n-m+q and the k-th other row n-m-1-k, or, with `reverse` (the path entered
 * from its far end), m-1-q and m+k. With no shape the path is the line through the slots' destinations `pts` (slot order),
 * each a stop at its own length along it, and every row takes its own slot's point. Returns the path as walked, the two
 * index rules and each point's distance along the walked path.
 */
export function ftlDest(shapePath, pts, n, reverse) {
  let base = shapePath, stop, own = false;
  if (!base) { const line = pts.length ? pts : [[0, 0]]; let acc = 0; const at = [0];
    for (let i = 1; i < line.length; i++) { acc += dist(line[i - 1], line[i]); at.push(acc); }
    base = { closed: false, L: acc, at: (s) => pointAtDist(line, at, s) }; stop = (j) => at[j] ?? acc; own = true; }
  else stop = (j) => paramT(base.closed, j, n) * base.L;
  if (!reverse) return { walked: base, L: base.L, member: (q, m, slot) => (own ? slot : n - m + q), other: (k, m, slot) => (own ? slot : n - m - 1 - k), along: stop };
  return { walked: { closed: base.closed, L: base.L, at: (s) => base.at(base.L - s) }, L: base.L,
    member: (q, m, slot) => (own ? slot : m - 1 - q), other: (k, m, slot) => (own ? slot : m + k), along: (j) => base.L - stop(j) };
}

/**
 * R-9′ (pathways step 4): a follow-the-leader trail with a trail route. The line-up runs through the member origins
 * (tail first); the drawn part is R-14's walk from the leader's origin through the route's points to the destination's
 * start, entered by distance; then the EXACT destination path. With no point kept it is R-9 with no waypoints, bit for
 * bit (QA-TR-2). Written from the spec with this file's own routeWalk and linear scans.
 */
export function makeRouteTrail(origins, route, path) {
  if (!origins.length) return makeTrail(origins, [], path);
  const W = routeWalk(origins[origins.length - 1], route.points, path.at(0), route.from, route.to, route.toBulge);
  if ((W.V.length === 2 && !W.pieces[0]) || W.L < EPS_GEOM) return makeTrail(origins, [], path);
  const cum = cumOf(origins), lineLen = cum[cum.length - 1], destOffset = lineLen + W.L, K = 64;
  const bez = (P0, c1, c2, P3, t) => { const u = 1 - t, k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
    return [k0 * P0[0] + k1 * c1[0] + k2 * c2[0] + k3 * P3[0], k0 * P0[1] + k1 * c1[1] + k2 * c2[1] + k3 * P3[1]]; };
  const drawn = (d) => {                                        // walk_x(W, d): R-14's Evaluation entered at distance d
    if (d <= 0) return W.V[0];
    if (d >= W.L) return W.V[W.V.length - 1];
    let j = 0;
    while (j < W.V.length - 2 && !(d < W.D[j + 1])) j++;
    const x = d - W.D[j], pc = W.pieces[j];
    if (!pc) return lerp(W.V[j], W.V[j + 1], x / (W.D[j + 1] - W.D[j]));
    if ('arc' in pc) return arcPoint(W.V[j], W.V[j + 1], pc.arc, x / (W.D[j + 1] - W.D[j]));
    let i = 1;
    while (i <= K && !(x < pc.e[i])) i++;
    if (i > K) return W.V[j + 1];
    return bez(W.V[j], pc.c1, pc.c2, W.V[j + 1], (i - 1 + (x - pc.e[i - 1]) / (pc.e[i] - pc.e[i - 1])) / K);
  };
  return { cum, destOffset, lineLen, W,
    at: (d) => (d < lineLen ? pointAtDist(origins, cum, d) : d < destOffset ? drawn(d - lineLen) : path.at(d - destOffset)) };
}

/**
 * R-13″ (pathways step 4b): a follow-the-leader transition with no shape and `ends: "along"`. The way P is the line-up
 * through the member origins (tail first), then the drawn part W: R-14's walk from the leader's origin through the
 * route's points but the last, to the last (from and to as tangent neighbours). Each member's end e_q is the arc length
 * on P of the point of P nearest its spot (lines projected exactly, a cubic onto its 64 measured chords; ties to the
 * larger distance), made strictly increasing (+EPS_GEOM) in trail order, then at least its start. It walks P to e_q,
 * then straight to its spot, at one speed. Written from the spec with this file's own routeWalk and linear scans.
 */
export function makeAlongWay(origins, route) {
  const line = origins.length ? origins : [[0, 0]];
  const cum = cumOf(line), lineLen = cum[cum.length - 1];
  const pts = route?.points ?? [];
  let W = null;
  if (origins.length && pts.length) {
    // R-14″: the leg into the last point is an arc by that point's own bulge (a leg to `to` has no length here)
    const w = routeWalk(line[line.length - 1], pts.slice(0, -1), pts[pts.length - 1].at, route.from, route.to, pts[pts.length - 1].bulge);
    if (w.L >= EPS_GEOM) W = w;
  }
  const total = lineLen + (W ? W.L : 0), K = 64;
  const bez = (P0, c1, c2, P3, t) => { const u = 1 - t, k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
    return [k0 * P0[0] + k1 * c1[0] + k2 * c2[0] + k3 * P3[0], k0 * P0[1] + k1 * c1[1] + k2 * c2[1] + k3 * P3[1]]; };
  const drawn = (d) => {
    if (d <= 0) return W.V[0];
    if (d >= W.L) return W.V[W.V.length - 1];
    let j = 0;
    while (j < W.V.length - 2 && !(d < W.D[j + 1])) j++;
    const x = d - W.D[j], pc = W.pieces[j];
    if (!pc) return lerp(W.V[j], W.V[j + 1], x / (W.D[j + 1] - W.D[j]));
    if ('arc' in pc) return arcPoint(W.V[j], W.V[j + 1], pc.arc, x / (W.D[j + 1] - W.D[j]));
    let i = 1;
    while (i <= K && !(x < pc.e[i])) i++;
    if (i > K) return W.V[j + 1];
    return bez(W.V[j], pc.c1, pc.c2, W.V[j + 1], (i - 1 + (x - pc.e[i - 1]) / (pc.e[i] - pc.e[i - 1])) / K);
  };
  const at = (d) => (!W || d < lineLen ? pointAtDist(line, cum, d) : drawn(d - lineLen));
  // the way's straight pieces to project onto: [a, b, distance at a, length]; arc legs are kept whole
  const segs = [[line[0], line[0], 0, 0]], arcs = [];
  for (let i = 1; i < line.length; i++) segs.push([line[i - 1], line[i], cum[i - 1], cum[i] - cum[i - 1]]);
  if (W) for (let j = 0; j < W.V.length - 1; j++) {
    const P0 = W.V[j], P3 = W.V[j + 1], pc = W.pieces[j], base = lineLen + W.D[j];
    if (!pc) { segs.push([P0, P3, base, W.D[j + 1] - W.D[j]]); continue; }
    if ('arc' in pc) { arcs.push([P0, P3, pc.arc, base, W.D[j + 1] - W.D[j]]); continue; }
    let prev = P0;
    for (let i = 1; i <= K; i++) { const s = i === K ? P3 : bez(P0, pc.c1, pc.c2, P3, i / K); segs.push([prev, s, base + pc.e[i - 1], pc.e[i] - pc.e[i - 1]]); prev = s; }
  }
  const nearest = (p) => {
    let best = Infinity, d = 0;
    for (const [a, b, d0, len] of segs) {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const f = l2 > 0 ? clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2) : 0;
      const dd = Math.hypot(a[0] + dx * f - p[0], a[1] + dy * f - p[1]);
      if (dd <= best) { best = dd; d = d0 + f * len; }
    }
    // R-14″: an arc leg, exactly: p's angle about the circle's centre, held to the arc's span, and the arc's two ends
    for (const [P0, P3, k, d0, len] of arcs) {
      const f = nearestArcFraction(P0, P3, k, p);
      for (const [g, at] of [[0, P0], [1, P3], [f, arcPoint(P0, P3, k, f)]]) {
        const dd = Math.hypot(at[0] - p[0], at[1] - p[1]);
        if (dd < best || (dd === best && d0 + g * len > d)) { best = dd; d = d0 + g * len; }
      }
    }
    return d;
  };
  return { cum, destOffset: total, at, nearest };
}

/**
 * R-14″: the fraction of R-8's arc A→B (bulge k) nearest p, from the centre form: centre c = M + n·(s − r) with
 * s = k·|AB| toward the +90° side n and r = (h² + s²)/(2s) signed; p's angle about c, measured from the arc's middle
 * and wrapped to (−π, π], is held to half the sweep. A chord under EPS_GEOM or a straight arc is projected as a line.
 */
export function nearestArcFraction(A, B, k, p) {
  const c = dist(A, B);
  if (c < EPS_GEOM) return 0;
  const ux = (B[0] - A[0]) / c, uy = (B[1] - A[1]) / c, M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  if (Math.abs(2 * Math.atan(2 * k)) < 1e-12) return clamp01(((p[0] - A[0]) * ux + (p[1] - A[1]) * uy) / c);
  const h = c / 2, s = k * c, r = (h * h + s * s) / (2 * s);
  const C = [M[0] - uy * (s - r), M[1] + ux * (s - r)];
  const apex = [M[0] - uy * s, M[1] + ux * s];
  const ang = (q) => Math.atan2(q[1] - C[1], q[0] - C[0]);
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
  const half = wrap(ang(apex) - ang(A));            // signed half-sweep, A to the apex
  const dev = wrap(ang(p) - ang(apex));
  const held = Math.max(-Math.abs(half), Math.min(Math.abs(half), dev));
  return clamp01(0.5 + held / (2 * half));
}

/** R-13″: the ends on an along-way: e_q, the turn P(e_q) and the straight leg to the spot. */
export function alongWayEnds(way, spots, startDist) {
  const e = [];
  spots.forEach((p, q) => { const d = way.nearest(p); e.push(q > 0 ? Math.max(d, e[q - 1] + EPS_GEOM) : d); });
  const endDist = e.map((d, q) => Math.max(d, startDist[q]));
  const turn = endDist.map((d) => way.at(d));
  return { endDist, turn, straight: turn.map((t, q) => dist(t, spots[q])) };
}

/** R-13″: a founding member at progress p (0 < p < 1): along the way, then straight to its spot. */
export function alongWayAt(way, s, e, turn, straight, spot, p) {
  const a = e - s, d = (a + straight) * p;
  if (d < a || !(straight > 0)) return way.at(s + Math.min(d, a));
  return lerp(turn, spot, (d - a) / straight);
}

/**
 * R-14 group schedule (v0.9 step 15): a group path member's walk. `W` is the reference walk from F to G (routeWalk,
 * this file's own code); every member passes its placed copy of W's first and last kept inner points at the moments
 * W reaches them at its steady speed (uFirst, uLast), walks W placed by its offset between them, and walks its own
 * first leg (A onto W_1 + o) and last leg (W_m + o to B) at steady speed each. Written from the spec, not the app.
 */
// R-14′ items 4 and 6 (v0.10, plan step 3b): a profile's effective keys on the reference walk W. Written from the spec on
// its own: T-1 and T-2 for anchors, T-3 clamps into [D_1, D_m], T-4 is a single-linkage scan keeping the last stored key per
// cluster. Returns the keys [{ x, d }] and how many of each total rule fired.
export function laneProfile(W, pts, profile) {
  const m = W.V.length - 2, out = { keys: [], clamped: 0, ties: 0, anchors: 0 };
  if (m < 1 || !profile) return out;                                                   // T-11
  const index = new Map(pts.map((q, i) => [q.id, i]));
  const placeOfId = (id, end) => {
    if (id === end) return end === 'from' ? 0 : W.L;
    if (!index.has(id)) { out.anchors++; return end === 'from' ? 0 : W.L; }            // T-1
    for (let k = m; k >= 1; k--) if (W.src[k] <= index.get(id)) return W.D[k];
    return 0;                                                                          // it lay on F
  };
  const keyed = profile.keys.map((key, n) => {
    const a = placeOfId(key.a, 'from'), b = placeOfId(key.b, 'to');
    if (a > b) out.anchors++;                                                          // T-2
    const raw = a + clamp01(key.f) * (b - a), x = Math.min(W.D[m], Math.max(W.D[1], raw));
    if (x !== raw) out.clamped++;
    return { x, d: key.d, n };
  });
  keyed.sort((p, q) => p.x - q.x || p.n - q.n);
  let cluster = [];
  const flush = () => { if (cluster.length) { out.ties += cluster.length - 1; const pick = cluster.reduce((p, q) => (q.n > p.n ? q : p)); out.keys.push({ x: pick.x, d: pick.d }); cluster = []; } };
  keyed.forEach((k, i) => { if (i > 0 && k.x - keyed[i - 1].x >= EPS_GEOM) flush(); cluster.push(k); });
  flush();
  return out;
}

/** R-14′ item 6 (iv): the profile's displacement at place x. */
export function profileAt(keys, x) {
  if (!keys.length) return [0, 0];
  if (x <= keys[0].x) return keys[0].d;
  if (x >= keys[keys.length - 1].x) return keys[keys.length - 1].d;
  let j = 0;
  while (!(x < keys[j + 1].x)) j++;
  const f = (x - keys[j].x) / (keys[j + 1].x - keys[j].x), p = keys[j].d, q = keys[j + 1].d;
  return [p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])];
}

export function groupWalk(A, pts, B, F, G, o, adjust = null, toBulge = undefined) {
  const W = routeWalk(F, pts, G, F, G, toBulge), m = W.V.length - 2;
  const keys = laneProfile(W, pts, adjust).keys;
  const add = (q) => [q[0] + o[0], q[1] + o[1]];
  // R-14′ item 7: ((q + o) + δ); nothing is added without a profile, so step 15's walk is bit-identical (item 9)
  const placedAt = (q, x) => { const p = add(q); if (!keys.length) return p; const d = profileAt(keys, x); return [p[0] + d[0], p[1] + d[1]]; };
  if (m < 1) return { W, uFirst: NaN, uLast: NaN, first: null, last: null, at: (p) => (p <= 0 ? A : p >= 1 ? B : W.pieces[0] ? arcPoint(A, B, W.pieces[0].arc, p) : lerp(A, B, p)) };
  const uFirst = W.D[1] / W.L, uLast = W.D[m] / W.L;
  const K = 64;
  const bez = (P0, c1, c2, P3, t) => { const u = 1 - t, k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
    return [k0 * P0[0] + k1 * c1[0] + k2 * c2[0] + k3 * P3[0], k0 * P0[1] + k1 * c1[1] + k2 * c2[1] + k3 * P3[1]]; };
  // A leg: a line, or a cubic measured on K samples as R-14's Length
  // R-14″: a route's arc leg stays R-8's arc (its bulge) on each member's own leg
  const arcLeg = (S, E, k) => ({ S, E, len: arcLen(S, E, k), at: (f) => arcPoint(S, E, k, f) });
  const leg = (S, E, c1, c2) => {
    if (!c1) return { S, E, len: Math.hypot(E[0] - S[0], E[1] - S[1]), at: (f) => lerp(S, E, f) };
    const e = [0];
    for (let i = 1; i <= K; i++) { const a = bez(S, c1, c2, E, (i - 1) / K), b = i === K ? E : bez(S, c1, c2, E, i / K); e.push(e[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const len = e[K];
    return { S, E, len, at(f) {
      if (len < EPS_GEOM) return lerp(S, E, f);
      const x = f * len;
      let i = 1;
      while (i <= K && !(x < e[i])) i++;
      if (i > K) return E;
      return bez(S, c1, c2, E, (i - 1 + (x - e[i - 1]) / (e[i] - e[i - 1])) / K);
    } };
  };
  const W1 = placedAt(W.V[1], W.D[1]), Wm = placedAt(W.V[m], W.D[m]);
  const p0 = W.pieces[0], pm = W.pieces[m];
  // The piece next to W_1 (W_m) is a cubic exactly when some end of it is smooth; the leg reads W_1's own handle
  // only when W_1 itself is smooth (its `in`, the reference piece's second control), else it is a line (a corner).
  // A leg whose ends are within EPS_GEOM is a line, so a member standing on its point doesn't loop out to a handle
  const near = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < EPS_GEOM;
  const smooth1 = W.tau[1] > 0 && !near(A, W1), smoothM = W.tau[m] > 0 && !near(Wm, B);
  const first = p0 && 'arc' in p0 ? arcLeg(A, W1, p0.arc) : smooth1 ? leg(A, W1, [A[0] + (W1[0] - A[0]) / 3, A[1] + (W1[1] - A[1]) / 3], placedAt(p0.c2, W.D[1])) : leg(A, W1, null, null);
  const last = pm && 'arc' in pm ? arcLeg(Wm, B, pm.arc) : smoothM ? leg(Wm, B, placedAt(pm.c1, W.D[m]), [B[0] + (Wm[0] - B[0]) / 3, B[1] + (Wm[1] - B[1]) / 3]) : leg(Wm, B, null, null);
  return {
    W, uFirst, uLast, first, last,
    at(p) {
      if (p <= 0) return A;
      if (p >= 1) return B;
      if (p < uFirst) return first.at(p / uFirst);
      if (p <= uLast) return placedAt(W.at(p), p * W.L);
      return last.at((p - uLast) / (1 - uLast));
    },
  };
}

// Vendored from om-pose (github.com/OpenMarch/om-pose), render/step-blend.js at commit 87cc16e816f0d4a074098b9cb27fdb9431c95dac.
// Do not edit here: change it in om-pose and copy it again. Local changes: none.
// om-pose is OpenMarch's own (private) repository; these files ship under the app's license.

// In-between step sizes: which two clips to blend, and how much, for a drill distance per count.
//
// Drill step sizes are continuous; clips exist at discrete N-to-5 sizes. Every clip shares the same timing
// (30 samples per count; loops 2 counts, transitions 1) and phase, so two sizes of the same move played at the
// same clip time with weight w = (d - step_a) / (step_b - step_a) travel exactly d per count, and the planted
// foot stays planted (scripts/blend_check.py measures it). Pure functions over the clip manifest
// (out/body/manifest.json, or its `clips` array): no imports, no THREE. Sizes are read from the manifest's
// `base`, `step_m` and `dir`, so sizes added later are picked up without a code change.
//
//   import { pickBlend, blendClips } from "./step-blend.js";
//   const p = pickBlend(manifest, "forward", 0.66, { height: 1.05, bpm: 132 });
//   // p = { a: "8to5-h105", b: "6to5-h105", weight: 0.46, d: 0.66, ... }
//   writeMarcher(mesh, i, { row: bake.rows[p.a], row2: bake.rows[p.b], weight: p.weight, phase: -c0 });
//   // the body origin moves p.d per count along the clip's dir (rotated by the heading)
//   const so = blendClips(manifest, p, "stepoff");   // { a: "stepoff_8to5-h105", b: "stepoff_6to5-h105", weight }
//   const r = blendRoot(manifest, so, u);            // [x, z] at u in [0, 1] of the count: root_x/root_z lerped by weight
//
// Outside a family's range (smaller than its smallest size or larger than its largest) the pick clamps to that
// size with weight 0 and `clamped: true`; the landing correction takes up the rest.

// A family is a move's loops at every size: travelling (step_m > 0) along the same `dir` (default [0, 1]).
export const FAMILIES = { forward: [0, 1], backward: [0, -1], slideL: [1, 0], slideR: [-1, 0] };

const _cache = new WeakMap();
const clipsOf = (manifest) => Array.isArray(manifest) ? manifest : manifest.clips;
const sameHeight = (c, h) => Math.abs((c.height ?? 1) - h) < 1e-6;

// The family's loops at one height class, sorted by step_m, with one clip per size: a clip with `min_bpm`
// (6to5_fast) replaces its sibling of the same step and direction when bpm >= min_bpm, and is left out below.
export function familySizes(manifest, family, { height = 1, bpm = 120 } = {}) {
  const dir = typeof family === "string" ? FAMILIES[family] : family;
  if (!dir) throw new Error(`familySizes: unknown family ${family}`);
  const key = `${dir}|${height}|${bpm}`;
  let byKey = _cache.get(manifest);
  if (!byKey) _cache.set(manifest, byKey = new Map());
  if (byKey.has(key)) return byKey.get(key);
  const bySize = new Map();
  for (const c of clipsOf(manifest)) {
    if (c.loop === false || !(c.step_m > 0) || !sameHeight(c, height)) continue;
    const [dx, dz] = c.dir ?? [0, 1];
    if (Math.abs(dx - dir[0]) > 1e-3 || Math.abs(dz - dir[1]) > 1e-3) continue;
    if (c.min_bpm && bpm < c.min_bpm) continue;
    const k = c.step_m.toFixed(5), have = bySize.get(k);
    if (!have || (c.min_bpm ?? 0) > (have.min_bpm ?? 0)) bySize.set(k, c);   // the faster technique wins at its tempo
  }
  const out = [...bySize.values()].sort((p, q) => p.step_m - q.step_m);
  byKey.set(key, out);
  return out;
}

// The two neighbouring sizes around d (metres per count) and the weight of the larger one. `a` and `b` are clip
// names (the height class's tag included), ready for bake.rows or the manifest; `baseA`/`baseB` are the
// moves' bases (for their step-offs and halts, see blendClips). At an exact size, weight is 0 and a is it.
export function pickBlend(manifest, family, d, opts = {}) {
  const sizes = familySizes(manifest, family, opts);
  if (!sizes.length) throw new Error(`pickBlend: no ${family} sizes at height ${opts.height ?? 1}`);
  const lo = sizes[0], hi = sizes[sizes.length - 1];
  const res = (a, b, weight, clamped) => ({ a: a.name, b: b.name, weight, baseA: a.base, baseB: b.base, stepA: a.step_m, stepB: b.step_m,
    d: a.step_m + weight * (b.step_m - a.step_m), height: opts.height ?? 1, clamped });
  if (!(d > lo.step_m)) return res(lo, lo, 0, d < lo.step_m - 1e-9);
  if (d >= hi.step_m) return res(hi, hi, 0, d > hi.step_m + 1e-9);
  let i = 0;
  while (sizes[i + 1].step_m <= d) i++;
  const a = sizes[i], b = sizes[i + 1];
  return res(a, b, (d - a.step_m) / (b.step_m - a.step_m), false);
}

// The matching pair of another clip kind for a pick: "" (the loops), "stepoff", "halt", "halt2". Returns clip
// names and the same weight; b is null when that kind is missing for b's move (then play a alone).
export function blendClips(manifest, pick, kind = "") {
  const find = (base) => clipsOf(manifest).find(c => c.base === (kind ? `${kind}_${base}` : base) && sameHeight(c, pick.height));
  const a = find(pick.baseA), b = pick.baseB === pick.baseA ? a : find(pick.baseB);
  if (!a) throw new Error(`blendClips: no ${kind || "loop"} clip for ${pick.baseA}`);
  return { a: a.name, b: b ? b.name : null, weight: b ? pick.weight : 0, clipA: a, clipB: b ?? a };
}

// A blended transition's body offset at u in [0, 1] of its count: root_x/root_z of both clips (sample
// interpolated), lerped by the weight. Field metres for a marcher facing +Z; rotate by the heading as writeMatrix does.
export function blendRoot(manifest, pair, u) {
  const at = (r, u) => { const x = Math.min(Math.max(u, 0), 1) * (r.length - 1), i = Math.floor(x), f = x - i; return r[i] + (r[Math.min(i + 1, r.length - 1)] - r[i]) * f; };
  const { clipA: a, clipB: b, weight: w } = pair;
  const ax = at(a.root_x, u), az = at(a.root_z, u);
  if (!w) return [ax, az];
  return [ax + (at(b.root_x, u) - ax) * w, az + (at(b.root_z, u) - az) * w];
}

// ---- Direction: any travel direction relative to the facing ----
//
//   import { pickDirection, pickBlend, turnedClips, turnRoot } from "./step-blend.js";
//   const dir = pickDirection(facing, tx, tz);   // { family: "forward", legYaw: 0.52, phi: 0.52 }
//   const p = pickBlend(manifest, dir.family, d, { height, bpm });
//   writeMarcher(mesh, i, { row: bake.rows[p.a], row2: bake.rows[p.b], weight: p.weight, phase: -c0, legYaw: dir.legYaw });
//   // the loop's body origin moves d per count along rotate(FAMILIES[family], legYaw), then by the heading
//   const so = turnedClips(manifest, p, dir, "stepoff");   // the step off built nearest the turn, and the rest
//   writeMarcher(mesh, i, { row: bake.rows[so.a], row2: so.b && bake.rows[so.b], weight: so.weight, phase: -c0, legYaw: so.legYaw });
//   const [x, z] = turnRoot(manifest, so, u);   // body offset at u of the count (instead of blendRoot)
//
// The rule: phi is the travel direction relative to the facing, + toward the performer's left. Strictly ahead
// (|phi| < 90 deg) is the forward family with the legs turned by phi; exactly sideways the slides; strictly
// behind the backward family turned by phi - 180 (phi + 180 on the right), so straight back is unturned. The
// upper body stays square to the facing. "Exactly" sideways is within SIDEWAYS_TOL: there the slide clip plays
// with the leftover turned in (legYaw = phi -/+ 90), so the loop still travels exactly along the drill.
export const SIDEWAYS_TOL = 0.5 * Math.PI / 180;

// facing: the marcher's heading (radians about +Y, 0 = facing +Z, as writeMatrix takes it); travel (tx, tz): the
// direction it moves on the field (any length). Returns { family, legYaw, phi } (radians), or family "none" for no
// travel (mark time or attention: the caller knows which).
export function pickDirection(facing, tx, tz) {
  if (!(Math.hypot(tx, tz) > 1e-12)) return { family: "none", legYaw: 0, phi: 0 };
  const c = Math.cos(facing), s = Math.sin(facing);
  const lx = c * tx - s * tz, lz = s * tx + c * tz;   // the travel in the marcher's own frame (+x its left)
  const phi = Math.atan2(lx, lz), a = Math.abs(phi), half = Math.PI / 2;
  if (Math.abs(a - half) <= SIDEWAYS_TOL) return { family: phi > 0 ? "slideL" : "slideR", legYaw: phi - Math.sign(phi) * half, phi };
  if (a < half) return { family: "forward", legYaw: phi, phi };
  return { family: "backward", legYaw: phi - Math.sign(phi) * Math.PI, phi };
}

// The family's travel direction turned by legYaw, in the marcher's frame (rotate by the heading for the field).
export function turnedDir(family, legYaw) {
  const [x, z] = FAMILIES[family], c = Math.cos(legYaw), s = Math.sin(legYaw);
  return [c * x + s * z, -s * x + c * z];
}

// Step offs and halts for a turned move. They start or end at attention, so the legs can't simply be turned the
// whole count; instead each move's step off and halts are built with the legs turned 0 and +-45 degrees (and the
// forward family's +-90 are the slides', built from the same legs), and the nearest one plays with the leftover
// turn (at most 22.5 degrees; 45 near sideways on the backward side) eased in or out over its `turn_window`: the
// stretch in which the moving foot is in the air and the standing foot's heel or ball stays put (`turn_pivot`).
// turnRoot keeps that point still. kind: "stepoff", "halt" or "halt2". `pick` from pickBlend, `dir` from
// pickDirection. Returns blendClips' pair plus `legYaw` for writeMarcher ([from, to, u0, u1]) and `built`
// (radians the clips' legs are turned) and `residual`.
const TURNED_DEG = [-90, -45, 0, 45, 90];
export function turnedClips(manifest, pick, dir, kind) {
  const deg = dir.legYaw * 180 / Math.PI, fam = dir.family;
  const name = (base, d) => d === 0 ? base : Math.abs(d) !== 90 ? `${base}_${d > 0 ? "L" : "R"}${Math.abs(d)}`
    : fam === "forward" && /^\d+to5$/.test(base) ? `slide${d > 0 ? "L" : "R"}${base}` : null;
  const has = (base) => base !== null && clipsOf(manifest).some(c => c.base === `${kind}_${base}` && sameHeight(c, pick.height));
  let built = 0;
  if (fam === "forward" || fam === "backward") {
    for (const d of TURNED_DEG) {
      if (Math.abs(d - deg) < Math.abs(built - deg) - 1e-9 && has(name(pick.baseA, d)) && (pick.baseB === pick.baseA || has(name(pick.baseB, d)))) built = d;
    }
  }
  const sub = { ...pick, baseA: name(pick.baseA, built), baseB: name(pick.baseB, built) };
  const pair = blendClips(manifest, sub, kind);
  const residual = (deg - built) * Math.PI / 180;
  const w = pair.weight, lerp = (p, q) => p + (q - p) * w;
  const A = pair.clipA, B = pair.clipB;
  const win = A.turn_window && B.turn_window ? [lerp(A.turn_window[0], B.turn_window[0]), lerp(A.turn_window[1], B.turn_window[1])] : [0, 1];
  const pivot = A.turn_pivot && B.turn_pivot ? [lerp(A.turn_pivot[0], B.turn_pivot[0]), lerp(A.turn_pivot[1], B.turn_pivot[1])] : null;
  const up = kind === "stepoff";
  return { ...pair, built: built * Math.PI / 180, residual, window: win, pivot, kind,
           legYaw: [up ? 0 : residual, up ? residual : 0, win[0], win[1]] };
}

// smootherstep, as the shader eases the turn
export const turnEase = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * x * (x * (x * 6 - 15) + 10); };

// The residual turn at u of the count, for a turnedClips pair: what the shader turns the legs by (radians).
export function turnAt(pair, u) {
  const [y0, y1, u0, u1] = pair.legYaw;
  return y0 + (y1 - y0) * turnEase((u - u0) / Math.max(u1 - u0, 1e-6));
}

// A turned step off's or halt's body offset at u in [0, 1]: blendRoot, plus what keeps the turn's pivot (the
// standing foot's heel or ball) still while the legs turn about the body origin:
// origin(u) = R(t0) p - R(t(u)) (p - root(u)), t the residual turn, R(t) as writeMatrix rotates (x, z).
// With no residual it is blendRoot. Marcher frame; rotate by the heading.
export function turnRoot(manifest, pair, u) {
  const [x, z] = blendRoot(manifest, pair, u);
  if (!pair.residual || !pair.pivot) return [x, z];
  const rot = (t, a, b) => [Math.cos(t) * a + Math.sin(t) * b, -Math.sin(t) * a + Math.cos(t) * b];
  const [px, pz] = pair.pivot, t0 = turnAt(pair, 0), t = turnAt(pair, u);
  const [ax, az] = rot(t0, px, pz), [bx, bz] = rot(t, px - x, pz - z);
  return [ax - bx, az - bz];
}

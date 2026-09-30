"""Mutation test for props.mjs (spec §12.10): re-introduce known bugs and confirm the property checker catches each.
Run: python3 mutate.py        exit status 1 if any mutation is missed."""
import shutil, subprocess, json, os, sys, tempfile
base = os.path.dirname(os.path.abspath(__file__))
tmp = tempfile.mkdtemp()
missed = 0
muts = {
 'M1 circle flattened with 720 segments (v0.2 behaviour)': ('geom.mjs',
   "  if (shape.kind === 'circle') {\n    const L = 2 * Math.PI * g.radius, dir = g.clockwise ? -1 : 1;",
   "  if (shape.kind === 'circle') {\n    const pts = []; for (let i = 0; i <= 720; i++) { const a = g.start_angle + (g.clockwise ? -1 : 1) * 2 * Math.PI * i / 720; pts.push([g.center[0] + g.radius * Math.cos(a), g.center[1] + g.radius * Math.sin(a)]); }\n    const cum = cumOf(pts); return { closed: true, L: cum.at(-1), at: (s) => pointAtDist(pts, cum, s) };\n  }\n  if (false) {\n    const L = 2 * Math.PI * g.radius, dir = g.clockwise ? -1 : 1;"),
 'M2 unstable centre-form arc, no exact endpoints (v0.2 behaviour)': ('geom.mjs',
   "export function arcPoint(A, B, k, p) {\n  if (p <= 0) return A;\n  if (p >= 1) return B;",
   "export function arcPoint(A, B, k, p) {\n  { const c = dist(A, B); if (Math.abs(k) < 1e-9 || c === 0) return lerp(A, B, p);\n  const s = k * c, R = (c * c / 4 + s * s) / (2 * Math.abs(s)); const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];\n  const nrm = [-(B[1] - A[1]) / c, (B[0] - A[0]) / c]; const off = s - Math.sign(s) * R; const C = [M[0] + off * nrm[0], M[1] + off * nrm[1]];\n  const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]); const phi = Math.atan2(c / 2, R - Math.abs(s)); const a = a0 + p * (-Math.sign(k) * 2 * phi);\n  return [C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]; }"),
 'M7 major arcs allowed again (effective bulge up to 2)': ('geom.mjs',
   "const h = c / 2, phi = 2 * Math.atan(2 * k);",
   "const h = c / 2, phi = 2 * Math.atan(8 * k);"),
 'M8 v0.3 arc: divides by the chord, no minimum scale': ('geom.mjs',
   "  if (c < EPS_GEOM) return lerp(A, B, p);                 // below the geometric scale: straight line\n  const h = c / 2, phi = 2 * Math.atan(2 * k);",
   "  if (c === 0) return A;\n  const h = c / 2, phi = 2 * Math.atan((k * c) / h);"),
 'M9 interpolation not endpoint-exact': ('geom.mjs',
   "export const lerp = (a, b, t) => (t <= 0 ? a : t >= 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);",
   "export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];"),
 'M3 clipped progress denominator (the D-7 bug)': ('oracle.mjs',
   "const p = clamp01((b - sp.start) / (t.end - sp.start));",
   "const p = clamp01((b - sp.start) / (sp.end - sp.start));"),
 'M4 FTL member targets off by one': ('oracle.mjs',
   "const target = new Map(members.map((mm, q) => [mm, pts[n - m + q]]));",
   "const target = new Map(members.map((mm, q) => [mm, pts[Math.max(0, n - m + q - 1)]]));"),
 'M5 holds drift': ('oracle.mjs',
   "if (!sp.row) return origin(sp);                                                   // R-6",
   "if (!sp.row) { const o = origin(sp); return Number.isFinite(sp.start) ? [o[0] + (b - sp.start) * 1e-6, o[1]] : o; }"),
 'M6 joiner targets ordered by row id instead of (slot, marcher)': ('oracle.mjs',
   ".sort((a, b) => a.slot - b.slot || a.marcher - b.marcher)",
   ".sort((a, b) => a.id - b.id)"),
}
for name, (f, old, new) in muts.items():
    d = os.path.join(tmp, 'mut'); shutil.rmtree(d, ignore_errors=True); shutil.copytree(base, d)
    src = open(f'{d}/{f}').read(); assert src.count(old) == 1, (name, src.count(old)); open(f'{d}/{f}', 'w').write(src.replace(old, new))
    r = subprocess.run(['node', 'props.mjs', '150'], cwd=d, capture_output=True, text=True)
    try:
        out = json.loads(r.stdout[:r.stdout.rindex('}') + 1])
        caught = sorted({k for k in out['counts'] if not k.endswith('checked')})
    except Exception:
        err = [l for l in r.stderr.strip().splitlines() if 'Error' in l]
        caught = ['CRASH: ' + (err[-1] if err else '?')[:90]]
    by_property = bool(caught) and not caught[0].startswith('CRASH')
    print(f"{'CAUGHT' if by_property else ('CRASHED' if r.returncode else 'MISSED')}  {name}\n        violated: {caught}")
    missed += 0 if by_property else 1
shutil.rmtree(tmp, ignore_errors=True)
print(f"{len(muts) - missed} of {len(muts)} mutations caught by a property check")
sys.exit(1 if missed else 0)

// cspell:ignore Peucker
/**
 * A model seen from straight above, for the 2D field (instruments.md section 6, "2D"): its
 * silhouette, as one or more closed outlines, and the edges seen from above (bars, drum heads,
 * steps), as polylines. The field draws the outline at every zoom and the edges once it is
 * zoomed in far enough for them to read (`pitPlan.ts`).
 *
 * Two callers make the same drawing:
 * - `scripts/view3d-assets/pit-plan.mjs` for the built-in models, into `assets/pit/plan.json`
 *   (Node runs this file directly, so it has no imports and only erasable TypeScript);
 * - the model import (fork #998), for an imported model's sidecar.
 *
 * The triangles are drawn into a grid from above on the CPU: 5 mm cells, or coarser for a model
 * over about 6 m, so the grid stays near 1200 cells a side.
 */

/** One triangle in the model's axes (meters, +Y up): `[ax, ay, az, bx, by, bz, cx, cy, cz]` */
export type PlanTriangle = ArrayLike<number>;

/**
 * A model from above, in millimeters in the model's axes (x across, z toward the audience): flat
 * `[x, z, x, z, ...]` lists. Outlines are closed with no repeated end point.
 */
export interface PlanFromAbove {
    outline: number[][];
    details: number[][];
}

/** Meters per grid cell, at the finest */
const CELL = 0.005;
/** The most cells along the model's longest side; past it the cells grow */
const MAX_CELLS = 1200;
/** Closing radius in cells: parts closer than about 2.5 cm merge into one outline */
const CLOSE = 5;
/** Smallest outline kept, in m² */
const MIN_AREA = 0.0015;
/** How far an outline may stray from the traced edge, in cells */
const OUTLINE_TOLERANCE = 1.6;
/** Faces meeting at more than this many degrees make an edge worth drawing */
const CREASE_DEG = 30;
/** An edge point is seen from above when nothing stands more than this over it, in m */
const SEEN_TOLERANCE = 0.012;
/** Shortest detail line kept, in m */
const MIN_DETAIL = 0.012;
/** How far a joined detail polyline may stray, in m */
const DETAIL_TOLERANCE = 0.002;

type Point2 = [number, number];
type Point3 = [number, number, number];

interface Grid {
    /** Covered cells */
    mask: Uint8Array;
    /** The highest surface in each cell, -Infinity where nothing is */
    top: Float64Array;
    W: number;
    H: number;
    x0: number;
    z0: number;
    cell: number;
}

export interface PlanOptions {
    /**
     * Also mark a sliver thinner than a cell that covers no cell's middle, along its sides. An
     * imported sign or panel can be all slivers from above; the built-ins are solid, and their
     * `plan.json` was drawn without this.
     */
    slivers?: boolean;
}

/** Draws `triangles` from straight above (see the module comment). */
export function planFromAbove(
    triangles: readonly PlanTriangle[],
    { slivers = false }: PlanOptions = {},
): PlanFromAbove {
    if (triangles.length === 0) return { outline: [], details: [] };
    const grid = rasterize(triangles, slivers);
    const mm = (v: number) => Math.round(v * 1000);
    return {
        outline: outlinesOf(grid).map((ring) =>
            ring.flatMap(([x, z]) => [mm(x), mm(z)]),
        ),
        details: detailsOf(triangles, grid).map((line) =>
            line.flatMap(([x, z]) => [mm(x), mm(z)]),
        ),
    };
}

// ---------- the grid seen from above ----------

function rasterize(triangles: readonly PlanTriangle[], slivers: boolean): Grid {
    let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
    for (const t of triangles)
        for (let k = 0; k < 3; k++) {
            minX = Math.min(minX, t[k * 3]);
            maxX = Math.max(maxX, t[k * 3]);
            minZ = Math.min(minZ, t[k * 3 + 2]);
            maxZ = Math.max(maxZ, t[k * 3 + 2]);
        }
    const cell = Math.max(CELL, Math.max(maxX - minX, maxZ - minZ) / MAX_CELLS);
    const pad = CLOSE * 2 + 2;
    const x0 = minX - pad * cell,
        z0 = minZ - pad * cell;
    const W = Math.ceil((maxX - minX) / cell) + pad * 2;
    const H = Math.ceil((maxZ - minZ) / cell) + pad * 2;
    const mask = new Uint8Array(W * H);
    const top = new Float64Array(W * H).fill(-Infinity);
    for (const t of triangles) {
        // In cells, sampled at cell centers
        const ax = (t[0] - x0) / cell,
            ay = t[1],
            az = (t[2] - z0) / cell;
        const bx = (t[3] - x0) / cell,
            by = t[4],
            bz = (t[5] - z0) / cell;
        const cx = (t[6] - x0) / cell,
            cy = t[7],
            cz = (t[8] - z0) / cell;
        const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
        const c0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))),
            c1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
        const r0 = Math.max(0, Math.floor(Math.min(az, bz, cz))),
            r1 = Math.min(H - 1, Math.ceil(Math.max(az, bz, cz)));
        let marked = false;
        if (Math.abs(area) >= 1e-9)
            for (let r = r0; r <= r1; r++)
                for (let c = c0; c <= c1; c++) {
                    const px = c + 0.5,
                        pz = r + 0.5;
                    const w0 =
                        ((bx - px) * (cz - pz) - (cx - px) * (bz - pz)) / area;
                    const w1 =
                        ((cx - px) * (az - pz) - (ax - px) * (cz - pz)) / area;
                    const w2 = 1 - w0 - w1;
                    if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
                    const i = r * W + c;
                    mask[i] = 1;
                    top[i] = Math.max(top[i], w0 * ay + w1 * by + w2 * cy);
                    marked = true;
                }
        if (Math.abs(area) < 1e-9 || (slivers && !marked)) {
            // Edge-on (a vertical face), or a sliver that covers no cell's middle: mark the
            // cells along its sides, at its top height
            const pts: Point3[] = [
                [ax, az, ay],
                [bx, bz, by],
                [cx, cz, cy],
            ];
            for (let i = 0; i < 3; i++) {
                const p = pts[i],
                    q = pts[(i + 1) % 3];
                const steps =
                    Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 2) + 1;
                for (let s = 0; s <= steps; s++) {
                    const f = s / steps;
                    const c = Math.floor(p[0] + (q[0] - p[0]) * f),
                        r = Math.floor(p[1] + (q[1] - p[1]) * f);
                    if (c < 0 || r < 0 || c >= W || r >= H) continue;
                    mask[r * W + c] = 1;
                    top[r * W + c] = Math.max(
                        top[r * W + c],
                        Math.max(ay, by, cy),
                    );
                }
            }
        }
    }
    return { mask, top, W, H, x0, z0, cell };
}

function dilate(m: Uint8Array, W: number, H: number, k: number): Uint8Array {
    const a = new Uint8Array(W * H),
        b = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            let v = 0;
            for (let d = -k; d <= k && !v; d++) {
                const xx = x + d;
                if (xx >= 0 && xx < W && m[y * W + xx]) v = 1;
            }
            a[y * W + x] = v;
        }
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            let v = 0;
            for (let d = -k; d <= k && !v; d++) {
                const yy = y + d;
                if (yy >= 0 && yy < H && a[yy * W + x]) v = 1;
            }
            b[y * W + x] = v;
        }
    return b;
}

const erode = (m: Uint8Array, W: number, H: number, k: number) =>
    dilate(
        m.map((v) => 1 - v),
        W,
        H,
        k,
    ).map((v) => 1 - v);

function fillHoles(m: Uint8Array, W: number, H: number): void {
    const seen = new Uint8Array(W * H);
    const stack: number[] = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
        const i = stack.pop()!;
        if (seen[i] || m[i]) continue;
        seen[i] = 1;
        const x = i % W,
            y = (i / W) | 0;
        if (x > 0) stack.push(i - 1);
        if (x < W - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - W);
        if (y < H - 1) stack.push(i + W);
    }
    for (let i = 0; i < W * H; i++) if (!m[i] && !seen[i]) m[i] = 1;
}

interface Component {
    mask: Uint8Array;
    area: number;
    sx: number;
    sy: number;
}

function components(m: Uint8Array, W: number, H: number): Component[] {
    const label = new Int32Array(W * H);
    const out: Component[] = [];
    let n = 0;
    for (let i = 0; i < W * H; i++) {
        if (!m[i] || label[i]) continue;
        n++;
        const mask = new Uint8Array(W * H);
        let area = 0;
        const stack = [i];
        while (stack.length) {
            const j = stack.pop()!;
            if (label[j] || !m[j]) continue;
            label[j] = n;
            mask[j] = 1;
            area++;
            const x = j % W,
                y = (j / W) | 0;
            if (x > 0) stack.push(j - 1);
            if (x < W - 1) stack.push(j + 1);
            if (y > 0) stack.push(j - W);
            if (y < H - 1) stack.push(j + W);
        }
        out.push({ mask, area, sx: i % W, sy: (i / W) | 0 });
    }
    return out;
}

/** The boundary of one component, by Moore-neighbor tracing from its first cell in row order */
function trace(
    mask: Uint8Array,
    W: number,
    H: number,
    sx: number,
    sy: number,
): Point2[] {
    const D: Point2[] = [
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
    ];
    const inside = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
    const pts: Point2[] = [[sx, sy]];
    let cx = sx,
        cy = sy,
        dir = 0,
        first = -1,
        atStart = false;
    for (let n = 0; n < W * H * 2; n++) {
        let d = -1;
        for (let i = 0; i < 8; i++) {
            const dd = (dir + 6 + i) % 8;
            if (inside(cx + D[dd][0], cy + D[dd][1])) {
                d = dd;
                break;
            }
        }
        if (d < 0) break;
        if (atStart && d === first) break;
        if (first < 0) first = d;
        cx += D[d][0];
        cy += D[d][1];
        dir = d;
        atStart = cx === sx && cy === sy;
        if (!atStart) pts.push([cx, cy]);
    }
    return pts;
}

/** Douglas–Peucker on an open polyline */
function simplifyLine(pts: Point2[], eps: number): Point2[] {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0],
        [bx, by] = pts[pts.length - 1];
    const len = Math.hypot(bx - ax, by - ay);
    let best = -1,
        at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
        const d =
            len < 1e-12
                ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
                : Math.abs(
                      (bx - ax) * (ay - pts[i][1]) -
                          (ax - pts[i][0]) * (by - ay),
                  ) / len;
        if (d > best) {
            best = d;
            at = i;
        }
    }
    if (best <= eps) return [pts[0], pts[pts.length - 1]];
    const left = simplifyLine(pts.slice(0, at + 1), eps);
    return left.slice(0, -1).concat(simplifyLine(pts.slice(at), eps));
}

/** Douglas–Peucker on a ring, split at the point farthest from its first */
function simplifyRing(ring: Point2[], eps: number): Point2[] {
    if (ring.length < 4) return ring;
    let far = 0,
        farthest = -1;
    for (let i = 0; i < ring.length; i++) {
        const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
        if (d > farthest) {
            farthest = d;
            far = i;
        }
    }
    const a = simplifyLine(ring.slice(0, far + 1), eps);
    const b = simplifyLine(ring.slice(far).concat([ring[0]]), eps);
    return a.slice(0, -1).concat(b.slice(0, -1));
}

// ---------- outline ----------

function outlinesOf(grid: Grid): Point2[][] {
    const { W, H, x0, z0, cell } = grid;
    const closed = erode(dilate(grid.mask, W, H, CLOSE), W, H, CLOSE);
    fillHoles(closed, W, H);
    return components(closed, W, H)
        .filter((c) => c.area * cell * cell >= MIN_AREA)
        .map((c) =>
            simplifyRing(
                trace(c.mask, W, H, c.sx, c.sy),
                OUTLINE_TOLERANCE,
            ).map(
                ([x, y]): Point2 => [
                    x0 + (x + 0.5) * cell,
                    z0 + (y + 0.5) * cell,
                ],
            ),
        );
}

// ---------- edges seen from above ----------

interface Edge {
    a: Point3;
    b: Point3;
    normals: Point3[];
}

// eslint-disable-next-line max-lines-per-function -- the script's algorithm, kept whole
function detailsOf(triangles: readonly PlanTriangle[], grid: Grid): Point2[][] {
    const { W, H, x0, z0, top, cell } = grid;
    // Edges keyed by their end points (rounded to 0.1 mm, so split vertices meet), with each face's normal
    const key = (p: Point3) =>
        `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
    const edges = new Map<string, Edge>();
    for (const t of triangles) {
        const ux = t[3] - t[0],
            uy = t[4] - t[1],
            uz = t[5] - t[2];
        const vx = t[6] - t[0],
            vy = t[7] - t[1],
            vz = t[8] - t[2];
        let nx = uy * vz - uz * vy,
            ny = uz * vx - ux * vz,
            nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-12) continue;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        for (let k = 0; k < 3; k++) {
            const a: Point3 = [t[k * 3], t[k * 3 + 1], t[k * 3 + 2]];
            const j = ((k + 1) % 3) * 3;
            const b: Point3 = [t[j], t[j + 1], t[j + 2]];
            const ka = key(a),
                kb = key(b);
            const id = ka < kb ? ka + "|" + kb : kb + "|" + ka;
            let e = edges.get(id);
            if (!e) {
                e = { a, b, normals: [] };
                edges.set(id, e);
            }
            e.normals.push([nx, ny, nz]);
        }
    }
    const crease = Math.cos((CREASE_DEG * Math.PI) / 180);
    const heightAt = (x: number, z: number) => {
        const c = Math.floor((x - x0) / cell),
            r = Math.floor((z - z0) / cell);
        let h = -Infinity;
        // The highest of the cell and its neighbors: an edge on a surface's rim still counts as seen
        for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
                const cc = c + dc,
                    rr = r + dr;
                if (cc >= 0 && rr >= 0 && cc < W && rr < H)
                    h = Math.max(h, top[rr * W + cc]);
            }
        return h;
    };
    const seenAt = (p: Point3) => p[1] >= heightAt(p[0], p[2]) - SEEN_TOLERANCE;
    const segments: [Point3, Point3][] = [];
    for (const { a, b, normals } of edges.values()) {
        const sharp =
            normals.length === 1 ||
            normals.some((n, i) =>
                normals.some(
                    (m, j) =>
                        j > i &&
                        n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < crease,
                ),
            );
        if (!sharp) continue;
        const flat = Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (flat < MIN_DETAIL / 2) continue; // seen end-on from above
        // Keep the runs of the edge that nothing stands over
        const steps = Math.max(2, Math.ceil(flat / (cell / 2)));
        let run: [Point3, Point3] | null = null;
        for (let s = 0; s <= steps; s++) {
            const f = s / steps;
            const p: Point3 = [
                a[0] + (b[0] - a[0]) * f,
                a[1] + (b[1] - a[1]) * f,
                a[2] + (b[2] - a[2]) * f,
            ];
            if (seenAt(p)) {
                if (!run) run = [p, p];
                else run[1] = p;
            } else if (run) {
                segments.push(run);
                run = null;
            }
        }
        if (run) segments.push(run);
    }
    const long = segments.filter(
        ([p, q]) => Math.hypot(q[0] - p[0], q[2] - p[2]) >= MIN_DETAIL,
    );
    return joinSegments(
        long.map(([p, q]): [Point2, Point2] => [
            [p[0], p[2]],
            [q[0], q[2]],
        ]),
    );
}

/** Joins segments that share end points into polylines, then simplifies each */
function joinSegments(segments: [Point2, Point2][]): Point2[][] {
    const k = ([x, z]: Point2) =>
        `${Math.round(x * 1e3)},${Math.round(z * 1e3)}`;
    const byEnd = new Map<string, number[]>();
    segments.forEach((s, i) => {
        for (const p of s) {
            const id = k(p);
            if (!byEnd.has(id)) byEnd.set(id, []);
            byEnd.get(id)!.push(i);
        }
    });
    const used = new Uint8Array(segments.length);
    const lines: Point2[][] = [];
    const extend = (line: Point2[]) => {
        for (;;) {
            const end = line[line.length - 1];
            const next = (byEnd.get(k(end)) ?? []).find((i) => !used[i]);
            if (next === undefined) return;
            used[next] = 1;
            const [p, q] = segments[next];
            line.push(k(p) === k(end) ? q : p);
        }
    };
    segments.forEach((s, i) => {
        if (used[i]) return;
        used[i] = 1;
        const line: Point2[] = [s[0], s[1]];
        extend(line);
        line.reverse();
        extend(line);
        lines.push(simplifyLine(line, DETAIL_TOLERANCE));
    });
    return lines;
}

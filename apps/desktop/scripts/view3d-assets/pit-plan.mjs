// cspell:ignore gltf Peucker
// Draws each front ensemble model from straight above for the 2D field (instruments.md section 6, "2D"):
// its silhouette, as one or more closed outlines, and the edges seen from above (bars, drum heads,
// steps), as polylines. The field draws the outline at every zoom and the edges once it is zoomed in
// far enough for them to read.
//
//   node scripts/view3d-assets/pit-plan.mjs
//
// Run it from apps/desktop whenever the pit GLBs change (after copying a new build into
// src/view3d/assets/pit), then commit src/view3d/assets/pit/plan.json. Reads each model's detailed GLB,
// in the models' axes (meters, +Y up, +Z toward the audience; README.md there), and writes, per model:
//
//   { "outline": [[x, z, x, z, ...], ...], "details": [[x, z, x, z, ...], ...] }
//
// in millimeters, x across and z toward the audience, outlines counter-clockwise on screen with no
// repeated end point. Pure Node: the GLB is read directly (no three.js loader, no images) and drawn into a
// 5 mm grid on the CPU.
import fs from "node:fs";
import path from "node:path";
import prettier from "prettier";

const DIR = path.resolve("src/view3d/assets/pit");
/** Meters per grid cell */
const CELL = 0.005;
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

// ---------- GLB ----------

function readGlb(file) {
    const buf = fs.readFileSync(file);
    if (buf.readUInt32LE(0) !== 0x46546c67)
        throw new Error(`${file} is not a GLB`);
    let offset = 12;
    let json = null;
    let bin = null;
    while (offset < buf.length) {
        const length = buf.readUInt32LE(offset);
        const type = buf.readUInt32LE(offset + 4);
        const data = buf.subarray(offset + 8, offset + 8 + length);
        if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
        else if (type === 0x004e4942) bin = data;
        offset += 8 + length;
    }
    return { json, bin };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const ARRAYS = {
    5121: Uint8Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array,
};

function accessorValues({ json, bin }, index) {
    const a = json.accessors[index];
    const view = json.bufferViews[a.bufferView];
    const Type = ARRAYS[a.componentType];
    const n = COMPONENTS[a.type];
    const stride = view.byteStride ?? n * Type.BYTES_PER_ELEMENT;
    const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const out = new Float64Array(a.count * n);
    const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const read = {
        5121: (o) => dv.getUint8(o),
        5123: (o) => dv.getUint16(o, true),
        5125: (o) => dv.getUint32(o, true),
        5126: (o) => dv.getFloat32(o, true),
    }[a.componentType];
    for (let i = 0; i < a.count; i++)
        for (let c = 0; c < n; c++)
            out[i * n + c] = read(
                base + i * stride + c * Type.BYTES_PER_ELEMENT,
            );
    return out;
}

/** Column-major 4×4 */
function multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            for (let k = 0; k < 4; k++)
                out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return out;
}

function nodeMatrix(node) {
    if (node.matrix) return node.matrix;
    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];
    return [
        (1 - 2 * (qy * qy + qz * qz)) * sx,
        2 * (qx * qy + qz * qw) * sx,
        2 * (qx * qz - qy * qw) * sx,
        0,
        2 * (qx * qy - qz * qw) * sy,
        (1 - 2 * (qx * qx + qz * qz)) * sy,
        2 * (qy * qz + qx * qw) * sy,
        0,
        2 * (qx * qz + qy * qw) * sz,
        2 * (qy * qz - qx * qw) * sz,
        (1 - 2 * (qx * qx + qy * qy)) * sz,
        0,
        tx,
        ty,
        tz,
        1,
    ];
}

/** Every triangle of the model's default scene, in model space: [ax, ay, az, bx, ..., cz] per triangle */
function trianglesOf(glb) {
    const { json } = glb;
    const triangles = [];
    const visit = (index, parent) => {
        const node = json.nodes[index];
        const m = multiply(parent, nodeMatrix(node));
        if (node.mesh !== undefined)
            for (const prim of json.meshes[node.mesh].primitives) {
                if ((prim.mode ?? 4) !== 4) continue;
                const pos = accessorValues(glb, prim.attributes.POSITION);
                const count = pos.length / 3;
                const idx =
                    prim.indices !== undefined
                        ? accessorValues(glb, prim.indices)
                        : Array.from({ length: count }, (_, i) => i);
                const world = new Float64Array(pos.length);
                for (let i = 0; i < count; i++) {
                    const x = pos[i * 3],
                        y = pos[i * 3 + 1],
                        z = pos[i * 3 + 2];
                    world[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
                    world[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
                    world[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
                }
                for (let i = 0; i + 2 < idx.length; i += 3) {
                    const t = [];
                    for (let k = 0; k < 3; k++)
                        t.push(
                            world[idx[i + k] * 3],
                            world[idx[i + k] * 3 + 1],
                            world[idx[i + k] * 3 + 2],
                        );
                    triangles.push(t);
                }
            }
        for (const child of node.children ?? []) visit(child, m);
    };
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const root of json.scenes[json.scene ?? 0].nodes)
        visit(root, identity);
    return triangles;
}

// ---------- the grid seen from above ----------

/**
 * Draws the triangles into a grid from above: `mask` (covered cells) and `top` (the highest surface in
 * each cell, -Infinity where nothing is).
 */
function rasterize(triangles) {
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
    const pad = CLOSE * 2 + 2;
    const x0 = minX - pad * CELL,
        z0 = minZ - pad * CELL;
    const W = Math.ceil((maxX - minX) / CELL) + pad * 2;
    const H = Math.ceil((maxZ - minZ) / CELL) + pad * 2;
    const mask = new Uint8Array(W * H);
    const top = new Float64Array(W * H).fill(-Infinity);
    for (const t of triangles) {
        // In cells, sampled at cell centers
        const ax = (t[0] - x0) / CELL,
            ay = t[1],
            az = (t[2] - z0) / CELL;
        const bx = (t[3] - x0) / CELL,
            by = t[4],
            bz = (t[5] - z0) / CELL;
        const cx = (t[6] - x0) / CELL,
            cy = t[7],
            cz = (t[8] - z0) / CELL;
        const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
        const c0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))),
            c1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
        const r0 = Math.max(0, Math.floor(Math.min(az, bz, cz))),
            r1 = Math.min(H - 1, Math.ceil(Math.max(az, bz, cz)));
        if (Math.abs(area) < 1e-9) {
            // Edge-on (a vertical face): mark the cells along its longest side, at its top height
            const pts = [
                [ax, az, ay],
                [bx, bz, by],
                [cx, cz, cy],
            ];
            for (let i = 0; i < 3; i++) {
                const [p, q] = [pts[i], pts[(i + 1) % 3]];
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
            continue;
        }
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
            }
    }
    return { mask, top, W, H, x0, z0 };
}

function dilate(m, W, H, k) {
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
const erode = (m, W, H, k) =>
    dilate(
        m.map((v) => 1 - v),
        W,
        H,
        k,
    ).map((v) => 1 - v);

function fillHoles(m, W, H) {
    const seen = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
        const i = stack.pop();
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

function components(m, W, H) {
    const label = new Int32Array(W * H);
    const out = [];
    let n = 0;
    for (let i = 0; i < W * H; i++) {
        if (!m[i] || label[i]) continue;
        n++;
        const mask = new Uint8Array(W * H);
        let area = 0;
        const stack = [i];
        while (stack.length) {
            const j = stack.pop();
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
function trace(mask, W, H, sx, sy) {
    const D = [
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
    ];
    const inside = (x, y) =>
        x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
    const pts = [[sx, sy]];
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
function simplifyLine(pts, eps) {
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
function simplifyRing(ring, eps) {
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

function outlinesOf(grid) {
    const { W, H, x0, z0 } = grid;
    const closed = erode(dilate(grid.mask, W, H, CLOSE), W, H, CLOSE);
    fillHoles(closed, W, H);
    return components(closed, W, H)
        .filter((c) => c.area * CELL * CELL >= MIN_AREA)
        .map((c) =>
            simplifyRing(
                trace(c.mask, W, H, c.sx, c.sy),
                OUTLINE_TOLERANCE,
            ).map(([x, y]) => [x0 + (x + 0.5) * CELL, z0 + (y + 0.5) * CELL]),
        );
}

// ---------- edges seen from above ----------

function detailsOf(triangles, grid) {
    const { W, H, x0, z0, top } = grid;
    // Edges keyed by their end points (rounded to 0.1 mm, so split vertices meet), with each face's normal
    const key = (x, y, z) =>
        `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    const edges = new Map();
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
            const a = [t[k * 3], t[k * 3 + 1], t[k * 3 + 2]];
            const b = [
                t[((k + 1) % 3) * 3],
                t[((k + 1) % 3) * 3 + 1],
                t[((k + 1) % 3) * 3 + 2],
            ];
            const ka = key(...a),
                kb = key(...b);
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
    const heightAt = (x, z) => {
        const c = Math.floor((x - x0) / CELL),
            r = Math.floor((z - z0) / CELL);
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
    const seenAt = (x, y, z) => y >= heightAt(x, z) - SEEN_TOLERANCE;
    const segments = [];
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
        const steps = Math.max(2, Math.ceil(flat / (CELL / 2)));
        let run = null;
        for (let s = 0; s <= steps; s++) {
            const f = s / steps;
            const p = [
                a[0] + (b[0] - a[0]) * f,
                a[1] + (b[1] - a[1]) * f,
                a[2] + (b[2] - a[2]) * f,
            ];
            if (seenAt(...p)) {
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
        long.map(([p, q]) => [
            [p[0], p[2]],
            [q[0], q[2]],
        ]),
    );
}

/** Joins segments that share end points into polylines, then simplifies each */
function joinSegments(segments) {
    const k = ([x, z]) => `${Math.round(x * 1e3)},${Math.round(z * 1e3)}`;
    const byEnd = new Map();
    segments.forEach((s, i) => {
        for (const p of s) {
            const id = k(p);
            if (!byEnd.has(id)) byEnd.set(id, []);
            byEnd.get(id).push(i);
        }
    });
    const used = new Uint8Array(segments.length);
    const lines = [];
    const extend = (line) => {
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
        const line = [s[0], s[1]];
        extend(line);
        line.reverse();
        extend(line);
        lines.push(simplifyLine(line, DETAIL_TOLERANCE));
    });
    return lines;
}

// ---------- write ----------

const mm = (v) => Math.round(v * 1000);
const manifest = JSON.parse(
    fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"),
);
const out = {};
let points = 0;
for (const name of Object.keys(manifest).sort()) {
    const triangles = trianglesOf(readGlb(path.join(DIR, `${name}.glb`)));
    const grid = rasterize(triangles);
    const outline = outlinesOf(grid).map((ring) =>
        ring.flatMap(([x, z]) => [mm(x), mm(z)]),
    );
    const details = detailsOf(triangles, grid).map((line) =>
        line.flatMap(([x, z]) => [mm(x), mm(z)]),
    );
    points += [...outline, ...details].reduce((n, l) => n + l.length / 2, 0);
    out[name] = { outline, details };
}
const file = path.join(DIR, "plan.json");
// Formatted as the repo formats JSON, so the format check passes as written
const options = (await prettier.resolveConfig(file)) ?? {};
fs.writeFileSync(
    file,
    await prettier.format(JSON.stringify(out), { ...options, filepath: file }),
);
console.log(
    `plan.json: ${Object.keys(out).length} models, ${points} points, ${fs.statSync(file).size} bytes`,
);

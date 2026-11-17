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
// repeated end point. Pure Node: the GLB is read directly (no three.js loader, no images). The drawing
// itself is src/view3d/core/pit/planFromAbove.ts, which the model import (fork #998) shares.
import fs from "node:fs";
import path from "node:path";
import prettier from "prettier";
// Node runs the TypeScript directly (type stripping); the model import uses it too
import { planFromAbove } from "../../src/view3d/core/pit/planFromAbove.ts";

const DIR = path.resolve("src/view3d/assets/pit");

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

// ---------- write ----------

const manifest = JSON.parse(
    fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"),
);
const out = {};
let points = 0;
for (const name of Object.keys(manifest).sort()) {
    const { outline, details } = planFromAbove(
        trianglesOf(readGlb(path.join(DIR, `${name}.glb`))),
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

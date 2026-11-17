// cspell:ignore strided gltf ompose CUBICSPLINE
// Copies om-pose's marcher assets into the 3D View and packs its clips: one GLB per height class (one
// skeleton, every clip as an animation) instead of one GLB per clip.
//
// Two things shrink a pack to about a third, with nothing visible lost (checked through three's GLTFLoader
// before anything is written):
// - The still pose is stored once. A track that holds one value for a whole clip (the upper body, while
//   the legs move) is dropped when it matches the pack's still pose (the `__still` animation, within
//   STILL_TOLERANCE); the app puts it back on load (restoreStillPose in marcherAssets.ts).
// - Rotations are 16-bit (glTF normalized shorts): at most 1.5e-5 off per component, about 0.002°.
// Everything else (times, translations, scales) is copied byte for byte.
//
//   node scripts/view3d-assets/pack-om-pose.mjs <om-pose checkout>
//
// Run it from apps/desktop when the om-pose pin moves, then commit the result. Writes
// src/view3d/assets/om-pose/{bodies/*.glb, clips/clips-h<class>.glb, manifest.json, SOURCE.json} (the main clips
// with the winds' direction changes, om-pose `python -m ompose.turns`, not tracked there), and the crab step
// (om-pose `python -m ompose.crab`, not tracked there) to crab/{clips-h<class>.glb, manifest.json}, loaded only for a
// show with percussion. Clips the manifest marks `mirror_of` aren't packed: the app mirrors them from their partner.
// See ADR 0010 D-7 and src/view3d/render/README.md.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
    restoreStillPose,
    STILL_POSE,
} from "../../src/view3d/window/performers/marchers/stillPose.ts";

const src = path.resolve(process.argv[2] ?? "");
if (!fs.existsSync(path.join(src, "out/body/manifest.json")))
    throw new Error("usage: pack-om-pose.mjs <om-pose checkout>");
const dest = path.resolve("src/view3d/assets/om-pose");
const animDir = path.join(src, "out/body");
const baseManifest = JSON.parse(
    fs.readFileSync(path.join(animDir, "manifest.json"), "utf8"),
);
// The wind players' direction changes (om-pose `python -m ompose.turns`, not tracked there) join the main clips:
// every show with winds plays them.
const turnsManifestPath = path.join(animDir, "turns/manifest.json");
if (!fs.existsSync(turnsManifestPath))
    throw new Error(
        "no direction change clips: run `python -m ompose.turns` in om-pose first",
    );
const manifest = {
    ...baseManifest,
    clips: [
        ...baseManifest.clips,
        ...JSON.parse(fs.readFileSync(turnsManifestPath, "utf8")).clips,
    ],
};

/** Height class (0.9 ... 1.1) to the file tag the app loads: h090 ... h110. */
export const classTag = (h) =>
    `h${String(Math.round(h * 100)).padStart(3, "0")}`;

function readGlb(file) {
    const b = fs.readFileSync(file);
    const jl = b.readUInt32LE(12);
    const json = JSON.parse(b.subarray(20, 20 + jl).toString("utf8"));
    const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + b.readUInt32LE(20 + jl));
    return { json, bin };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// The skeleton's structure (names, hierarchy), without rest transforms.
const structure = (nodes) =>
    JSON.stringify(nodes.map((n) => [n.name, n.children ?? []]));
const TRS = ["translation", "rotation", "scale"];

/** The pack's shared still pose: one animation of 2-key tracks the app copies into every clip that lacks them. */
const STILL = STILL_POSE;
/** How far (per component) a held value may be from the still pose and still be dropped. */
const STILL_TOLERANCE = 5e-5;
const SHORT = 32767;

// One source clip's channels, as floats, with each held channel's value (`held`, else null).
function readClip(clip, first, nodesKey) {
    const { json, bin } = readGlb(path.join(animDir, clip.file));
    if (structure(json.nodes) !== nodesKey)
        throw new Error(`${clip.name}: different skeleton`);
    if (json.animations.length !== 1)
        throw new Error(`${clip.name}: expected one animation`);
    const anim = json.animations[0];
    const animated = new Set(
        anim.channels.map((c) => `${c.target.node}.${c.target.path}`),
    );
    json.nodes.forEach((n, i) => {
        const restDiffers = TRS.some(
            (k) => JSON.stringify(n[k]) !== JSON.stringify(first.nodes[i][k]),
        );
        if (restDiffers && !TRS.every((k) => animated.has(`${i}.${k}`)))
            throw new Error(
                `${clip.name}: node ${n.name} has its own rest pose and isn't fully animated`,
            );
    });
    if (anim.name !== clip.name)
        throw new Error(`${clip.file}: animation is ${anim.name}`);
    const floats = (i) => {
        const a = json.accessors[i];
        if (a.componentType !== 5126 || a.sparse || a.normalized)
            throw new Error(`${clip.name}: unexpected accessor`);
        const size = COMPONENTS[a.type] * 4;
        const bv = json.bufferViews[a.bufferView];
        if (bv.byteStride && bv.byteStride !== size)
            throw new Error(`${clip.name}: strided data`);
        const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
        return {
            type: a.type,
            data: new Float32Array(
                Uint8Array.from(bin.subarray(start, start + a.count * size))
                    .buffer,
            ),
        };
    };
    const channels = anim.channels.map((c) => {
        const s = anim.samplers[c.sampler];
        const interpolation = s.interpolation ?? "LINEAR";
        if (interpolation === "CUBICSPLINE")
            throw new Error(`${clip.name}: cubic spline sampler`);
        const t = floats(s.input).data;
        const v = floats(s.output);
        const n = COMPONENTS[v.type];
        const held = v.data.every(
            (x, k) => Math.abs(x - v.data[k % n]) <= STILL_TOLERANCE,
        );
        return {
            target: c.target,
            interpolation,
            key: `${c.target.node}.${c.target.path}`,
            times: t,
            type: v.type,
            values: v.data,
            held: held ? v.data.subarray(0, n) : null,
        };
    });
    return { name: anim.name, channels };
}

// One class: the first clip's nodes, then every clip's samplers. Every clip must have the same skeleton
// structure. Their rest transforms differ by float noise (up to 1.9e-5 at commit 87cc16e8); that is checked
// to be harmless: a node whose rest transform differs from the first clip's must be animated in all of
// translation, rotation and scale, so the rest value never shows. Identical accessors are stored once;
// accessor data is pooled per element size.
function pack(clips) {
    const first = readGlb(path.join(animDir, clips[0].file)).json;
    const nodesKey = structure(first.nodes);
    const out = {
        asset: { version: "2.0", generator: "OpenMarch pack-om-pose.mjs" },
        scene: 0,
        scenes: first.scenes,
        nodes: first.nodes,
        animations: [],
        accessors: [],
        bufferViews: [],
        buffers: [],
    };
    const pools = new Map(); // element size -> { view, parts, bytes }
    const accessorByHash = new Map();
    const store = (meta, bytes) => {
        const size = bytes.length / meta.count;
        const hash = crypto
            .createHash("sha256")
            .update(JSON.stringify(meta))
            .update(bytes)
            .digest("hex");
        if (accessorByHash.has(hash)) return accessorByHash.get(hash);
        if (!pools.has(size))
            pools.set(size, { view: pools.size, parts: [], bytes: 0 });
        const pool = pools.get(size);
        out.accessors.push({
            ...meta,
            bufferView: pool.view,
            byteOffset: pool.bytes,
        });
        pool.parts.push(bytes);
        pool.bytes += bytes.length;
        accessorByHash.set(hash, out.accessors.length - 1);
        return out.accessors.length - 1;
    };
    const times = (t) =>
        store(
            {
                componentType: 5126,
                count: t.length,
                type: "SCALAR",
                min: [Math.min(...t)],
                max: [Math.max(...t)],
            },
            Buffer.from(t.buffer, t.byteOffset, t.byteLength),
        );
    // Rotations as normalized shorts; everything else as the source's floats.
    const values = (v, type, rotation) => {
        const count = v.length / COMPONENTS[type];
        if (!rotation)
            return store(
                { componentType: 5126, count, type },
                Buffer.from(v.buffer, v.byteOffset, v.byteLength),
            );
        const q = Int16Array.from(v, (x) =>
            Math.round(Math.max(-1, Math.min(1, x)) * SHORT),
        );
        return store(
            { componentType: 5122, normalized: true, count, type },
            Buffer.from(q.buffer),
        );
    };

    const read = clips.map((clip) => readClip(clip, first, nodesKey));

    // The still pose: each channel's first held value. A held channel at it is dropped.
    const still = new Map();
    for (const clip of read)
        for (const c of clip.channels)
            if (c.held && !still.has(c.key)) still.set(c.key, c);
    const atStill = (c) =>
        c.held &&
        c.held.every(
            (x, k) => Math.abs(x - still.get(c.key).held[k]) <= STILL_TOLERANCE,
        );
    const end = (c) => c.times[c.times.length - 1];
    const emit = (name, channels) => {
        const samplers = channels.map((c) => ({
            input: times(c.times),
            output: values(c.values, c.type, c.target.path === "rotation"),
            interpolation: c.interpolation,
        }));
        out.animations.push({
            name,
            samplers,
            channels: channels.map((c, i) => ({
                sampler: i,
                target: c.target,
            })),
        });
    };
    emit(
        STILL,
        [...still.values()].map((c) => ({
            ...c,
            times: new Float32Array([0, 1]),
            values: Float32Array.from([...c.held, ...c.held]),
        })),
    );
    for (const clip of read) {
        const kept = clip.channels.filter((c) => !atStill(c));
        // Keep the clip's length: if every channel left ends early, keep the dropped one that ends last.
        const duration = Math.max(...clip.channels.map(end));
        if (!kept.length || Math.max(...kept.map(end)) < duration)
            kept.push(clip.channels.find((c) => end(c) === duration));
        emit(clip.name, kept);
    }
    const parts = [];
    let offset = 0;
    for (const pool of [...pools.values()].sort((a, b) => a.view - b.view)) {
        out.bufferViews.push({
            buffer: 0,
            byteOffset: offset,
            byteLength: pool.bytes,
        });
        parts.push(...pool.parts);
        offset += pool.bytes; // every element is a multiple of 4 bytes, so views stay aligned
    }
    out.buffers.push({ byteLength: offset });
    const bin = Buffer.concat(parts);
    let json = Buffer.from(JSON.stringify(out), "utf8");
    json = Buffer.concat([
        json,
        Buffer.alloc((4 - (json.length % 4)) % 4, 0x20),
    ]);
    const chunk = (data, type) => {
        const h = Buffer.alloc(8);
        h.writeUInt32LE(data.length, 0);
        h.writeUInt32LE(type, 4);
        return [h, data];
    };
    const body = Buffer.concat([
        ...chunk(json, 0x4e4f534a),
        ...chunk(bin, 0x004e4942),
    ]);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + body.length, 8);
    return Buffer.concat([header, body]);
}

const parse = (buf) =>
    new Promise((resolve, reject) =>
        new GLTFLoader().parse(
            buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
            "",
            resolve,
            reject,
        ),
    );
const sameBytes = (a, b) =>
    a.length === b.length &&
    Buffer.compare(
        Buffer.from(a.buffer, a.byteOffset, a.byteLength),
        Buffer.from(b.buffer, b.byteOffset, b.byteLength),
    ) === 0;
const near = (a, b) =>
    a.length === b.length &&
    a.every((x, i) => Math.abs(x - b[i]) <= STILL_TOLERANCE);

// Every track of every clip, as three loads it and the app restores it, must match the source file's: the
// same times and values within STILL_TOLERANCE, or for a held track, the same held value.
async function verify(packed, clips) {
    const loaded = new Map(
        restoreStillPose((await parse(packed)).animations).map((a) => [
            a.name,
            a,
        ]),
    );
    let tracks = 0;
    for (const clip of clips) {
        const ref = (
            await parse(fs.readFileSync(path.join(animDir, clip.file)))
        ).animations[0];
        const got = loaded.get(clip.name);
        if (
            !got ||
            got.duration !== ref.duration ||
            got.tracks.length !== ref.tracks.length
        )
            throw new Error(`${clip.name}: missing or different after packing`);
        const byName = new Map(got.tracks.map((t) => [t.name, t]));
        for (const t of ref.tracks) {
            const q = byName.get(t.name);
            const n = t.getValueSize();
            // A held track reads the same whatever its keys and interpolation.
            const heldAt = (v, row) =>
                v.every((x, i) => Math.abs(x - row[i % n]) <= STILL_TOLERANCE);
            const same =
                q &&
                (heldAt(t.values, t.values)
                    ? heldAt(q.values, t.values)
                    : sameBytes(t.times, q.times) &&
                      t.getInterpolation() === q.getInterpolation() &&
                      near(t.values, q.values));
            if (!same)
                throw new Error(
                    `${clip.name}: track ${t.name} differs after packing`,
                );
            tracks++;
        }
    }
    return tracks;
}

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const commit = execFileSync("git", ["-C", src, "rev-parse", "HEAD"], {
    encoding: "utf8",
}).trim();
const dirty = execFileSync(
    "git",
    ["-C", src, "status", "--porcelain", "--", "assets/body-v4u", "out/body"],
    { encoding: "utf8" },
).trim();
if (dirty) throw new Error(`om-pose has uncommitted asset changes:\n${dirty}`);

const files = {};
const write = (rel, buf) => {
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.writeFileSync(path.join(dest, rel), buf);
    files[rel] = { bytes: buf.length, sha256: sha(buf) };
};

const heights = [...new Set(manifest.clips.map((c) => c.height ?? 1))].sort();
const packs = [];
for (const h of heights) {
    const clips = manifest.clips.filter((c) => (c.height ?? 1) === h);
    const packed = pack(clips);
    const tracks = await verify(packed, clips);
    packs.push({ rel: `clips/clips-${classTag(h)}.glb`, packed });
    console.log(
        `${classTag(h)}: ${clips.length} clips, ${tracks} tracks match, ${(packed.length / 1e6).toFixed(2)} MB`,
    );
}
const crabManifestPath = path.join(animDir, "crab/manifest.json");
if (!fs.existsSync(crabManifestPath))
    throw new Error(
        "no crab clips: run `python -m ompose.crab` in om-pose first",
    );
const crabManifest = JSON.parse(fs.readFileSync(crabManifestPath, "utf8"));
for (const h of [
    ...new Set(crabManifest.clips.map((c) => c.height ?? 1)),
].sort()) {
    // crab right's loops and halts are crab left's mirrored (`mirror_of`): they have no file
    const clips = crabManifest.clips.filter(
        (c) => (c.height ?? 1) === h && c.file,
    );
    const packed = pack(clips);
    const tracks = await verify(packed, clips);
    packs.push({ rel: `crab/clips-${classTag(h)}.glb`, packed });
    console.log(
        `crab ${classTag(h)}: ${clips.length} clips, ${tracks} tracks match, ${(packed.length / 1e6).toFixed(2)} MB`,
    );
}
// The folder's LICENSE is the repository's, not om-pose's: keep it.
const licensePath = path.join(dest, "LICENSE");
const license = fs.existsSync(licensePath)
    ? fs.readFileSync(licensePath)
    : null;
fs.rmSync(dest, { recursive: true, force: true });
if (license) write("LICENSE", license);
for (const { rel, packed } of packs) write(rel, packed);
for (const f of fs
    .readdirSync(path.join(src, "assets/body-v4u"))
    .filter((f) => f.endsWith(".glb"))
    .sort())
    write(`bodies/${f}`, fs.readFileSync(path.join(src, "assets/body-v4u", f)));
write("manifest.json", Buffer.from(JSON.stringify(manifest)));
write("crab/manifest.json", fs.readFileSync(crabManifestPath));
fs.writeFileSync(
    path.join(dest, "SOURCE.json"),
    JSON.stringify(
        {
            source: "https://github.com/OpenMarch/om-pose",
            commit,
            from: {
                bodies: "assets/body-v4u/*.glb",
                clips: "out/body/animations/*.glb, packed one GLB per height class (still pose once, 16-bit rotations)",
                manifest:
                    "out/body/manifest.json and out/body/turns/manifest.json, joined",
                turns: "out/body/turns (generated by ompose.turns at this commit), packed with the main clips",
                crab: "out/body/crab (generated by ompose.crab at this commit), packed one GLB per height class (still pose once, 16-bit rotations)",
            },
            license:
                "Not under the app's license (see LICENSE): the clips are in the counsel gate (lawyer Q3); the meshes take CC0 1.0 once Q3 is answered and om-pose adopts a license upstream (ADR 0010 D-7, D-21)",
            files,
        },
        null,
        4,
    ) + "\n",
);
console.log(
    `wrote ${Object.keys(files).length} files to ${path.relative(process.cwd(), dest)} from om-pose ${commit}`,
);

// cspell:ignore strided gltf
// Copies om-pose's marcher assets into the 3D View and packs its clips: one GLB per height class (one
// skeleton, every clip as an animation) instead of one GLB per clip. Lossless: every keyframe is copied
// byte for byte, and the script checks that through three's GLTFLoader before writing anything.
//
//   node scripts/view3d-assets/pack-om-pose.mjs <om-pose checkout>
//
// Run it from apps/desktop when the om-pose pin moves, then commit the result. Writes
// src/view3d/assets/om-pose/{bodies/*.glb, clips/clips-h<class>.glb, manifest.json, SOURCE.json}.
// See ADR 0002 D-7 and src/view3d/vendor/om-pose/README.md.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const src = path.resolve(process.argv[2] ?? "");
if (!fs.existsSync(path.join(src, "out/body/manifest.json")))
    throw new Error("usage: pack-om-pose.mjs <om-pose checkout>");
const dest = path.resolve("src/view3d/assets/om-pose");
const animDir = path.join(src, "out/body");
const manifest = JSON.parse(
    fs.readFileSync(path.join(animDir, "manifest.json"), "utf8"),
);

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

// One class: the first clip's nodes, then every clip's samplers. Every clip must have the same skeleton
// structure. Their rest transforms differ by float noise (up to 1.9e-5 at commit 87cc16e8); that is checked
// to be harmless: a node whose rest transform differs from the first clip's must be animated in all of
// translation, rotation and scale, so the rest value never shows. Identical accessors are stored once; accessor data is pooled per element size.
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
    for (const clip of clips) {
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
                (k) =>
                    JSON.stringify(n[k]) !== JSON.stringify(first.nodes[i][k]),
            );
            if (restDiffers && !TRS.every((k) => animated.has(`${i}.${k}`)))
                throw new Error(
                    `${clip.name}: node ${n.name} has its own rest pose and isn't fully animated`,
                );
        });
        if (anim.name !== clip.name)
            throw new Error(`${clip.file}: animation is ${anim.name}`);
        const accessor = (i) => {
            const a = json.accessors[i];
            if (a.componentType !== 5126 || a.sparse)
                throw new Error(`${clip.name}: unexpected accessor`);
            const size = COMPONENTS[a.type] * 4;
            const bv = json.bufferViews[a.bufferView];
            if (bv.byteStride && bv.byteStride !== size)
                throw new Error(`${clip.name}: strided data`);
            const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
            const bytes = bin.subarray(start, start + a.count * size);
            const hash = crypto
                .createHash("sha256")
                .update(JSON.stringify([a.type, a.min, a.max]))
                .update(bytes)
                .digest("hex");
            if (accessorByHash.has(hash)) return accessorByHash.get(hash);
            if (!pools.has(size))
                pools.set(size, { view: pools.size, parts: [], bytes: 0 });
            const pool = pools.get(size);
            const { bufferView: _v, byteOffset: _o, ...rest } = a;
            out.accessors.push({
                ...rest,
                bufferView: pool.view,
                byteOffset: pool.bytes,
            });
            pool.parts.push(bytes);
            pool.bytes += bytes.length;
            accessorByHash.set(hash, out.accessors.length - 1);
            return out.accessors.length - 1;
        };
        out.animations.push({
            name: anim.name,
            samplers: anim.samplers.map((s) => ({
                ...s,
                input: accessor(s.input),
                output: accessor(s.output),
            })),
            channels: anim.channels,
        });
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

// Every track of every clip, as three loads it, must be byte-identical to the source file's.
async function verify(packed, clips) {
    const loaded = new Map(
        (await parse(packed)).animations.map((a) => [a.name, a]),
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
            if (
                !q ||
                !sameBytes(t.times, q.times) ||
                !sameBytes(t.values, q.values) ||
                t.getInterpolation() !== q.getInterpolation()
            )
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
        `${classTag(h)}: ${clips.length} clips, ${tracks} tracks identical, ${(packed.length / 1e6).toFixed(2)} MB`,
    );
}
fs.rmSync(dest, { recursive: true, force: true });
for (const { rel, packed } of packs) write(rel, packed);
for (const f of fs
    .readdirSync(path.join(src, "assets/body-v4u"))
    .filter((f) => f.endsWith(".glb"))
    .sort())
    write(`bodies/${f}`, fs.readFileSync(path.join(src, "assets/body-v4u", f)));
write("manifest.json", fs.readFileSync(path.join(animDir, "manifest.json")));
fs.writeFileSync(
    path.join(dest, "SOURCE.json"),
    JSON.stringify(
        {
            source: "https://github.com/OpenMarch/om-pose",
            commit,
            from: {
                bodies: "assets/body-v4u/*.glb",
                clips: "out/body/animations/*.glb, packed one GLB per height class",
                manifest: "out/body/manifest.json",
            },
            license:
                "om-pose is OpenMarch's own repository; these files ship under the app's license",
            files,
        },
        null,
        2,
    ) + "\n",
);
console.log(
    `wrote ${Object.keys(files).length} files to ${path.relative(process.cwd(), dest)} from om-pose ${commit}`,
);

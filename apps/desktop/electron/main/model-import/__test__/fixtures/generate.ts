/**
 * Writes the model import fixtures next to this file. Each one exercises a
 * row of the import report or a rejection; `pipeline.test.ts` says which.
 *
 * From `apps/desktop`:
 *
 *     pnpm exec tsx electron/main/model-import/__test__/fixtures/generate.ts
 *
 * Regenerate after changing this file and commit the outputs; the tests read
 * the committed files and never run this script.
 */
/* eslint-disable no-console, max-lines-per-function -- a one-off fixture script */
// cspell:words clearcoat basisu meshopt
import {
    Accessor,
    Document,
    NodeIO,
    type Material,
    type Mesh,
    type Node,
    type Skin,
} from "@gltf-transform/core";
import {
    EXTMeshGPUInstancing,
    EXTMeshoptCompression,
    KHRDracoMeshCompression,
    KHRMaterialsClearcoat,
    KHRMeshQuantization,
} from "@gltf-transform/extensions";
import { draco, meshopt } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptEncoder } from "meshoptimizer";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import * as prettier from "prettier";
import sharp from "sharp";
import { Matrix4, Quaternion, Vector3 } from "three";
import { V4_INVERSE_BIND_MATRICES, V4_JOINT_NAMES } from "../../v4-skeleton";

const OUT = __dirname;
const KIT_ITEM_ID = "6b1f3c1e-5a43-4d0e-9a51-2f7c8e9d0a11";

// ------------------------------------------------------------- geometry

interface Geometry {
    positions: number[];
    normals: number[];
    uvs: number[];
    indices: number[];
}

/** An axis-aligned box centered at `center`. */
function box(size: [number, number, number], center = [0, 0, 0]): Geometry {
    const [sx, sy, sz] = size.map((s) => s / 2);
    const g: Geometry = { positions: [], normals: [], uvs: [], indices: [] };
    const faces: [number[], number[], number[]][] = [
        // normal, u axis, v axis
        [
            [1, 0, 0],
            [0, 0, -1],
            [0, 1, 0],
        ],
        [
            [-1, 0, 0],
            [0, 0, 1],
            [0, 1, 0],
        ],
        [
            [0, 1, 0],
            [1, 0, 0],
            [0, 0, -1],
        ],
        [
            [0, -1, 0],
            [1, 0, 0],
            [0, 0, 1],
        ],
        [
            [0, 0, 1],
            [1, 0, 0],
            [0, 1, 0],
        ],
        [
            [0, 0, -1],
            [-1, 0, 0],
            [0, 1, 0],
        ],
    ];
    const half = [sx, sy, sz];
    for (const [n, u, v] of faces) {
        const base = g.positions.length / 3;
        for (const [cu, cv] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ]) {
            for (let k = 0; k < 3; k++) {
                g.positions.push(
                    center[k] + (n[k] + u[k] * cu + v[k] * cv) * half[k],
                );
                g.normals.push(n[k]);
            }
            g.uvs.push((cu + 1) / 2, (1 - cv) / 2);
        }
        g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return g;
}

/** A capped-off open cylinder along an axis: `radial × rings × 2` triangles. */
function cylinder(
    radius: number,
    length: number,
    radial: number,
    rings: number,
    axis: "y" | "z",
    start = 0,
): Geometry {
    const g: Geometry = { positions: [], normals: [], uvs: [], indices: [] };
    for (let r = 0; r <= rings; r++) {
        const t = r / rings;
        for (let s = 0; s <= radial; s++) {
            const a = (s / radial) * Math.PI * 2;
            const c = Math.cos(a);
            const d = Math.sin(a);
            const along = start + t * length;
            if (axis === "y") {
                g.positions.push(c * radius, along, d * radius);
                g.normals.push(c, 0, d);
            } else {
                g.positions.push(c * radius, d * radius, along);
                g.normals.push(c, d, 0);
            }
            g.uvs.push(s / radial, t);
        }
    }
    for (let r = 0; r < rings; r++) {
        for (let s = 0; s < radial; s++) {
            const i = r * (radial + 1) + s;
            const j = i + radial + 1;
            g.indices.push(i, j, i + 1, i + 1, j, j + 1);
        }
    }
    return g;
}

function addMesh(
    doc: Document,
    name: string,
    g: Geometry,
    material: Material | null,
    extra: Record<string, Accessor> = {},
): Mesh {
    const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
    const acc = (type: "VEC2" | "VEC3", data: number[]) =>
        doc
            .createAccessor()
            .setType(type)
            .setArray(new Float32Array(data))
            .setBuffer(buffer);
    const prim = doc
        .createPrimitive()
        .setAttribute("POSITION", acc("VEC3", g.positions))
        .setAttribute("NORMAL", acc("VEC3", g.normals))
        .setAttribute("TEXCOORD_0", acc("VEC2", g.uvs))
        .setIndices(
            doc
                .createAccessor()
                .setType("SCALAR")
                .setArray(new Uint32Array(g.indices))
                .setBuffer(buffer),
        )
        .setMaterial(material);
    for (const [semantic, accessor] of Object.entries(extra)) {
        prim.setAttribute(semantic, accessor);
    }
    return doc.createMesh(name).addPrimitive(prim);
}

function newDoc(): {
    doc: Document;
    scene: ReturnType<Document["createScene"]>;
} {
    const doc = new Document();
    doc.createBuffer();
    doc.getRoot().getAsset().generator = "OpenMarch fixture generator";
    const scene = doc.createScene("Scene");
    doc.getRoot().setDefaultScene(scene);
    return { doc, scene };
}

function stamp(
    scene: ReturnType<Document["createScene"]>,
    fields: Record<string, unknown>,
) {
    scene.setExtras({ openmarch: fields });
}

/** A grip empty: `+Z` along the pole (here, world +Y). */
function grip(doc: Document, name: string, y: number): Node {
    const q = new Quaternion().setFromAxisAngle(
        new Vector3(1, 0, 0),
        -Math.PI / 2,
    );
    return doc
        .createNode(name)
        .setTranslation([0, y, 0])
        .setRotation(q.toArray() as [number, number, number, number]);
}

// ------------------------------------------------------------- writing

let io: NodeIO;

async function write(name: string, doc: Document): Promise<void> {
    await writeFile(path.join(OUT, name), await io.writeBinary(doc));
    console.log("wrote", name);
}

/** Re-packs a GLB after editing its JSON chunk (for deliberately bad files). */
function patchGlb(glb: Uint8Array, edit: (json: any) => void): Uint8Array {
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(
        new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)),
    );
    edit(json);
    let text = JSON.stringify(json);
    while (new TextEncoder().encode(text).length % 4) text += " ";
    const jsonBytes = new TextEncoder().encode(text);
    const rest = glb.subarray(20 + jsonLength);
    const out = new Uint8Array(20 + jsonBytes.length + rest.length);
    const outView = new DataView(out.buffer);
    outView.setUint32(0, 0x46546c67, true);
    outView.setUint32(4, 2, true);
    outView.setUint32(8, out.length, true);
    outView.setUint32(12, jsonBytes.length, true);
    outView.setUint32(16, 0x4e4f534a, true);
    out.set(jsonBytes, 20);
    out.set(rest, 20 + jsonBytes.length);
    return out;
}

// ------------------------------------------------------------- fixtures

/** A 6 ft flag: pole along +Y, silk with an artwork slot, both grips. */
function flag(opts: {
    scale?: number;
    zUp?: boolean;
    grips?: boolean;
    stamp?: boolean;
    radial?: number;
    rings?: number;
    lengthM?: number;
}) {
    const { doc, scene } = newDoc();
    const s = opts.scale ?? 1;
    const length = (opts.lengthM ?? 1.8288) * s;
    const pole = addMesh(
        doc,
        "Pole",
        cylinder(0.0127 * s, length, opts.radial ?? 12, opts.rings ?? 4, "y"),
        doc.createMaterial("PoleMetal"),
    );
    const silkMaterial = doc.createMaterial("Silk").setExtras({
        openmarch: {
            artworkSlot: { id: "silk", widthM: 0.9144, heightM: 1.3716 },
        },
    });
    const silk = addMesh(
        doc,
        "Silk",
        box(
            [0.9144 * s, 1.3716 * s, 0.002 * s],
            [0.4572 * s, length - 0.6858 * s, 0],
        ),
        silkMaterial,
    );
    const rootNode = doc.createNode("Flag");
    rootNode.addChild(doc.createNode("Pole").setMesh(pole));
    rootNode.addChild(doc.createNode("Silk").setMesh(silk));
    if (opts.grips ?? true) {
        rootNode.addChild(grip(doc, "OM_grip_R", 0.3 * s));
        rootNode.addChild(grip(doc, "OM_grip_L", 0.9 * s));
    }
    if (opts.zUp) rootNode.setRotation([Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    scene.addChild(rootNode);
    if (opts.stamp ?? true) {
        stamp(scene, {
            itemId: KIT_ITEM_ID,
            kind: "equipment",
            kitVersion: "1.0.0",
            // Declared in the file's own axes: along Z when exported Z-up.
            stretch: opts.zUp
                ? { z: [0.4 * s, 1.0 * s] }
                : { y: [0.4 * s, 1.0 * s] },
        });
    }
    return doc;
}

async function equipmentFixtures() {
    await write("equipment-clean-kit.glb", flag({}));
    await write("equipment-centimeters.glb", flag({ scale: 100 }));
    // Z-up: the pole lies along +Z, as a Blender export with Y-up off.
    await write("equipment-z-up.glb", flag({ zUp: true }));
    await write("equipment-no-grip.glb", flag({ grips: false }));
    // 64 × 24 × 2 = 3072 triangles plus the silk: over 2k, under 8k.
    await write("equipment-dense.glb", flag({ radial: 64, rings: 24 }));
    // 128 × 40 × 2 = 10240: over 4 × 2k.
    await write("equipment-over-4x.glb", flag({ radial: 128, rings: 40 }));
    // A 10 m "pole": no conversion lands in 0.3–3 m.
    await write("equipment-implausible.glb", flag({ lengthM: 10 }));
}

async function propFixtures() {
    // A riser with no kit stamp and no extras at all.
    {
        const { doc, scene } = newDoc();
        const mesh = addMesh(
            doc,
            "Riser",
            box([2.4, 0.6, 1.2], [0, 0.3, 0]),
            doc.createMaterial("Wood"),
        );
        scene.addChild(doc.createNode("Riser").setMesh(mesh));
        await write("prop-no-extras.glb", doc);
    }
    // A 2048 × 64 texture: over the Prop cap of 1024.
    {
        const { doc, scene } = newDoc();
        const width = 2048;
        const height = 64;
        const pixels = Buffer.alloc(width * height * 3);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 3;
                pixels[i] = x & 0xff;
                pixels[i + 1] = (x >> 3) & 0xff;
                pixels[i + 2] = y * 4;
            }
        }
        const png = await sharp(pixels, { raw: { width, height, channels: 3 } })
            .png()
            .toBuffer();
        const texture = doc
            .createTexture("Banner")
            .setImage(new Uint8Array(png))
            .setMimeType("image/png");
        const material = doc
            .createMaterial("Banner")
            .setBaseColorTexture(texture);
        const mesh = addMesh(
            doc,
            "Banner",
            box([2, 1, 0.05], [0, 0.5, 0]),
            material,
        );
        scene.addChild(doc.createNode("Banner").setMesh(mesh));
        stamp(scene, { kind: "prop" });
        await write("prop-big-texture.glb", doc);
    }
    // Draco and meshopt inputs.
    for (const [name, compress] of [
        ["prop-draco.glb", "draco"],
        ["prop-meshopt.glb", "meshopt"],
    ] as const) {
        const { doc, scene } = newDoc();
        const mesh = addMesh(
            doc,
            "Drum",
            cylinder(0.3, 0.5, 24, 2, "y"),
            doc.createMaterial("Shell"),
        );
        scene.addChild(doc.createNode("Drum").setMesh(mesh));
        stamp(scene, { kind: "prop" });
        if (compress === "draco") {
            doc.createExtension(KHRDracoMeshCompression).setRequired(true);
            await doc.transform(draco());
        } else {
            await doc.transform(
                meshopt({ encoder: MeshoptEncoder, level: "medium" }),
            );
        }
        await write(name, doc);
    }
    // Custom properties, an animation, a camera, a morph target, a second
    // scene and clearcoat: all stripped with a note.
    {
        const { doc, scene } = newDoc();
        const clearcoat = doc.createExtension(KHRMaterialsClearcoat);
        const material = doc
            .createMaterial("Lacquer")
            .setExtension(
                "KHR_materials_clearcoat",
                clearcoat.createClearcoat().setClearcoatFactor(1),
            )
            .setExtras({ blenderMaterialId: 7 });
        const mesh = addMesh(
            doc,
            "Cabinet",
            box([1, 1, 1], [0, 0.5, 0]),
            material,
        );
        const buffer = doc.getRoot().listBuffers()[0];
        const target = doc.createPrimitiveTarget("Open").setAttribute(
            "POSITION",
            doc
                .createAccessor()
                .setType("VEC3")
                .setArray(new Float32Array(24 * 3).fill(0.01))
                .setBuffer(buffer),
        );
        mesh.listPrimitives()[0].addTarget(target);
        mesh.setWeights([0]);
        const node = doc
            .createNode("Cabinet")
            .setMesh(mesh)
            .setExtras({ note: "hi" });
        scene.addChild(node);
        scene.addChild(
            doc
                .createNode("Camera")
                .setCamera(
                    doc
                        .createCamera("Cam")
                        .setType("perspective")
                        .setYFov(0.8)
                        .setZNear(0.1)
                        .setAspectRatio(1.5),
                ),
        );
        const anim = doc.createAnimation("Spin");
        const sampler = doc
            .createAnimationSampler()
            .setInput(
                doc
                    .createAccessor()
                    .setType("SCALAR")
                    .setArray(new Float32Array([0, 1]))
                    .setBuffer(buffer),
            )
            .setOutput(
                doc
                    .createAccessor()
                    .setType("VEC4")
                    .setArray(new Float32Array([0, 0, 0, 1, 0, 1, 0, 0]))
                    .setBuffer(buffer),
            );
        anim.addSampler(sampler).addChannel(
            doc
                .createAnimationChannel()
                .setTargetNode(node)
                .setTargetPath("rotation")
                .setSampler(sampler),
        );
        doc.createScene("Unused").addChild(
            doc.createNode("Spare").setMesh(mesh),
        );
        stamp(scene, { kind: "prop" });
        await write("prop-extras-and-content.glb", doc);
    }
    // GPU instancing: expanded into plain nodes.
    {
        const { doc, scene } = newDoc();
        const ext = doc.createExtension(EXTMeshGPUInstancing).setRequired(true);
        const buffer = doc.getRoot().listBuffers()[0];
        const mesh = addMesh(
            doc,
            "Cone",
            box([0.3, 0.5, 0.3], [0, 0.25, 0]),
            doc.createMaterial("Orange"),
        );
        const instanced = ext.createInstancedMesh().setAttribute(
            "TRANSLATION",
            doc
                .createAccessor()
                .setType("VEC3")
                .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]))
                .setBuffer(buffer),
        );
        scene.addChild(
            doc
                .createNode("Cones")
                .setMesh(mesh)
                .setExtension("EXT_mesh_gpu_instancing", instanced),
        );
        stamp(scene, { kind: "prop" });
        await write("prop-instanced.glb", doc);
    }
    // A required extension outside the allow-list.
    {
        const { doc, scene } = newDoc();
        const mesh = addMesh(
            doc,
            "Box",
            box([1, 1, 1]),
            doc.createMaterial("Plain"),
        );
        scene.addChild(doc.createNode("Box").setMesh(mesh));
        const glb = patchGlb(await io.writeBinary(doc), (json) => {
            json.extensionsUsed = ["KHR_texture_basisu"];
            json.extensionsRequired = ["KHR_texture_basisu"];
        });
        await writeFile(path.join(OUT, "prop-required-extension.glb"), glb);
        console.log("wrote prop-required-extension.glb");
    }
    // A validator error: an accessor that runs past its buffer view.
    {
        const { doc, scene } = newDoc();
        const mesh = addMesh(
            doc,
            "Box",
            box([1, 1, 1]),
            doc.createMaterial("Plain"),
        );
        scene.addChild(doc.createNode("Box").setMesh(mesh));
        const glb = patchGlb(await io.writeBinary(doc), (json) => {
            json.accessors[0].count = 10_000;
        });
        await writeFile(path.join(OUT, "invalid.glb"), glb);
        console.log("wrote invalid.glb");
    }
    // A Base floor exported Z-up (lying in XY), bigger than WGI's maximum.
    {
        const { doc, scene } = newDoc();
        const mesh = addMesh(
            doc,
            "Floor",
            box([25, 34, 0.01]),
            doc.createMaterial("Tarp"),
        );
        scene.addChild(doc.createNode("Floor").setMesh(mesh));
        stamp(scene, { kind: "baseFloor", stretch: { x: [-10, 10] } });
        await write("floor-z-up.glb", doc);
    }
    // A .gltf with an external .bin and .png.
    {
        const { doc, scene } = newDoc();
        const png = await sharp({
            create: {
                width: 64,
                height: 32,
                channels: 3,
                background: "#3366cc",
            },
        })
            .png()
            .toBuffer();
        // Not a solid color, so prune keeps it as a texture.
        const noisy = await sharp(png)
            .composite([
                {
                    input: Buffer.from(
                        '<svg width="64" height="32"><circle cx="16" cy="16" r="10" fill="#fff"/></svg>',
                    ),
                },
            ])
            .png()
            .toBuffer();
        const texture = doc
            .createTexture("Logo")
            .setImage(new Uint8Array(noisy))
            .setMimeType("image/png")
            .setURI("logo.png");
        doc.getRoot().listBuffers()[0].setURI("model.bin");
        const mesh = addMesh(
            doc,
            "Sign",
            box([1.2, 0.6, 0.05], [0, 0.3, 0]),
            doc.createMaterial("Sign").setBaseColorTexture(texture),
        );
        scene.addChild(doc.createNode("Sign").setMesh(mesh));
        stamp(scene, { kind: "prop" });
        const { json, resources } = await io.writeJSON(doc);
        // Formatted as the repository's Prettier would, so checks stay clean.
        const file = path.join(OUT, "model.gltf");
        const text = await prettier.format(JSON.stringify(json), {
            ...(await prettier.resolveConfig(file)),
            filepath: file,
        });
        await writeFile(file, text);
        for (const [uri, data] of Object.entries(resources)) {
            await writeFile(path.join(OUT, uri), data);
        }
        console.log("wrote model.gltf", Object.keys(resources));
    }
}

// ------------------------------------------------------------- garments

const V4_REST = V4_INVERSE_BIND_MATRICES.map((m) =>
    new Matrix4().fromArray([...m]).invert(),
);

/**
 * A v4 armature: the 23 joints flat under one node, each at its v4 rest
 * transform `pre · rest · post`, with matching inverse bind matrices.
 */
function v4Skin(
    doc: Document,
    parent: Node,
    opts: {
        pre?: Matrix4;
        post?: Matrix4;
        offset?: number;
        joints?: readonly string[];
    } = {},
): Skin {
    const buffer = doc.getRoot().listBuffers()[0];
    const names = opts.joints ?? V4_JOINT_NAMES;
    const skin = doc.createSkin("Armature");
    const ibm: number[] = [];
    names.forEach((name, i) => {
        const rest = (
            V4_REST[V4_JOINT_NAMES.indexOf(name as never)] ?? new Matrix4()
        ).clone();
        if (opts.offset && i === 1) rest.elements[13] += opts.offset;
        const world = (opts.pre ?? new Matrix4())
            .clone()
            .multiply(rest)
            .multiply(opts.post ?? new Matrix4());
        const node = doc.createNode(name).setMatrix(world.toArray() as never);
        parent.addChild(node);
        skin.addJoint(node);
        ibm.push(...world.clone().invert().toArray());
    });
    skin.setInverseBindMatrices(
        doc
            .createAccessor()
            .setType("MAT4")
            .setArray(new Float32Array(ibm))
            .setBuffer(buffer),
    );
    return skin;
}

/** A torso tube from the hips to the chest, weighted to the spine joints. */
function tube(
    doc: Document,
    name: string,
    opts: {
        radius?: number;
        part?: boolean;
        quantize?: boolean;
        extraInfluences?: boolean;
        transform?: Matrix4;
        jointCount?: number;
    } = {},
): Mesh {
    const g = cylinder(opts.radius ?? 0.17, 0.5, 16, 6, "y", 0.9);
    const buffer = doc.getRoot().listBuffers()[0];
    const count = g.positions.length / 3;
    const joints = new Uint8Array(count * 4);
    const weights = new Float32Array(count * 4);
    const joints1 = new Uint8Array(count * 4);
    const weights1 = new Float32Array(count * 4);
    const top = (opts.jointCount ?? 23) - 1;
    for (let i = 0; i < count; i++) {
        const t = (g.positions[i * 3 + 1] - 0.9) / 0.5;
        if (top < 3) {
            // A small rig: everything on joint 1.
            joints.set([1, 0, 0, 0], i * 4);
            weights.set([1, 0, 0, 0], i * 4);
            continue;
        }
        // DEF-spine (1), DEF-spine.001 (2), DEF-spine.002 (3).
        joints.set([1, 2, 3, 0], i * 4);
        if (opts.extraInfluences) {
            // Six influences across two sets, summing to 1.
            weights.set([0.3 * (1 - t), 0.3, 0.3 * t, 0.2], i * 4);
            joints1.set([4, 13, 0, 0], i * 4);
            weights1.set([0.12, 0.08, 0, 0], i * 4);
        } else {
            weights.set([0.5 * (1 - t), 0.5, 0.5 * t, 0], i * 4);
        }
    }
    if (opts.transform) {
        const v = new Vector3();
        const n = new Matrix4().extractRotation(opts.transform);
        for (let i = 0; i < count; i++) {
            v.fromArray(g.positions, i * 3)
                .applyMatrix4(opts.transform)
                .toArray(g.positions, i * 3);
            v.fromArray(g.normals, i * 3)
                .applyMatrix4(n)
                .normalize()
                .toArray(g.normals, i * 3);
        }
    }
    const extra: Record<string, Accessor> = {
        JOINTS_0: doc
            .createAccessor()
            .setType("VEC4")
            .setArray(joints)
            .setBuffer(buffer),
        WEIGHTS_0: doc
            .createAccessor()
            .setType("VEC4")
            .setArray(weights)
            .setBuffer(buffer),
    };
    if (opts.extraInfluences) {
        extra.JOINTS_1 = doc
            .createAccessor()
            .setType("VEC4")
            .setArray(joints1)
            .setBuffer(buffer);
        extra.WEIGHTS_1 = doc
            .createAccessor()
            .setType("VEC4")
            .setArray(weights1)
            .setBuffer(buffer);
    }
    if (opts.part ?? true) {
        extra._PART = doc
            .createAccessor()
            .setType("SCALAR")
            .setArray(new Float32Array(count).fill(1)) // 1: jacket
            .setBuffer(buffer);
    }
    const mesh = addMesh(
        doc,
        name,
        g,
        doc.createMaterial(`${name}Cloth`),
        extra,
    );
    if (opts.quantize) {
        doc.createExtension(KHRMeshQuantization).setRequired(true);
        const prim = mesh.listPrimitives()[0];
        const pos = prim.getAttribute("POSITION")!;
        const q = new Int16Array(count * 3);
        for (let i = 0; i < count * 3; i++)
            q[i] = Math.round(pos.getArray()![i] * 1000);
        prim.setAttribute(
            "POSITION",
            doc.createAccessor().setType("VEC3").setArray(q).setBuffer(buffer),
        );
    }
    return mesh;
}

function garment(opts: {
    rigged?: boolean;
    fits?: (string | null)[];
    part?: boolean;
    quantize?: boolean;
    extraInfluences?: boolean;
    nodeScale?: number;
    offset?: number;
    joints?: readonly string[];
    conversion?: { pre: Matrix4; post: Matrix4; geometry: Matrix4 };
}) {
    const { doc, scene } = newDoc();
    const exportNode = doc.createNode("OpenMarch_Export");
    scene.addChild(exportNode);
    const skin =
        opts.rigged === false
            ? null
            : v4Skin(doc, exportNode, {
                  pre: opts.conversion?.pre,
                  post: opts.conversion?.post,
                  offset: opts.offset,
                  joints: opts.joints,
              });
    const fits = opts.fits ?? [null];
    fits.forEach((fit, i) => {
        const mesh = tube(doc, `Jacket${i}`, {
            radius: 0.17 + i * 0.02,
            part: opts.part,
            quantize: opts.quantize,
            extraInfluences: opts.extraInfluences,
            transform: opts.conversion?.geometry,
            jointCount: opts.joints?.length,
        });
        const node = doc.createNode(`Jacket${i}`).setMesh(mesh).setSkin(skin);
        if (fit) node.setExtras({ openmarch: { fit } });
        if (opts.nodeScale)
            node.setScale([opts.nodeScale, opts.nodeScale, opts.nodeScale]);
        exportNode.addChild(node);
    });
    stamp(scene, { kind: "garment", kitVersion: "1.0.0" });
    return doc;
}

async function garmentFixtures() {
    await write(
        "garment-clean.glb",
        garment({ fits: [null, "neutral-broad"] }),
    );
    await write("garment-not-rigged.glb", garment({ rigged: false }));
    await write(
        "garment-wrong-joints.glb",
        garment({ joints: ["root", "DEF-spine", "Bone.003", "DEF-spine.002"] }),
    );
    await write("garment-rest-pose.glb", garment({ offset: 0.05 }));
    await write("garment-quantized.glb", garment({ quantize: true }));
    await write("garment-transforms.glb", garment({ nodeScale: 2 }));
    await write("garment-no-part.glb", garment({ part: false }));
    await write("garment-no-median.glb", garment({ fits: ["neutral-slim"] }));
    await write(
        "garment-unknown-fit.glb",
        garment({ fits: [null, "neutral-wide"] }),
    );
    await write(
        "garment-duplicate-fit.glb",
        garment({ fits: [null, null, "neutral-broad"] }),
    );
    await write("garment-influences.glb", garment({ extraInfluences: true }));
    // Exported in centimeters with Y-up off: converting by ×0.01 and
    // rotating to Y-up lands exactly on the v4 rest pose.
    const m = new Matrix4()
        .makeScale(0.01, 0.01, 0.01)
        .multiply(new Matrix4().makeRotationX(-Math.PI / 2));
    const mi = m.clone().invert();
    await write(
        "garment-cm-z-up.glb",
        garment({
            conversion: {
                pre: mi,
                post: new Matrix4().makeScale(0.01, 0.01, 0.01),
                geometry: mi,
            },
        }),
    );
    // A prop with a skin: other rigs are rejected.
    {
        const doc = garment({ joints: ["root", "DEF-spine"] });
        doc.getRoot()
            .getDefaultScene()!
            .setExtras({ openmarch: { kind: "prop" } });
        await write("prop-rigged.glb", doc);
    }
}

async function main() {
    io = new NodeIO()
        .registerExtensions([
            KHRDracoMeshCompression,
            EXTMeshoptCompression,
            EXTMeshGPUInstancing,
            KHRMaterialsClearcoat,
            KHRMeshQuantization,
        ])
        .registerDependencies({
            "draco3d.encoder": await draco3d.createEncoderModule(),
            "draco3d.decoder": await draco3d.createDecoderModule(),
            "meshopt.encoder": MeshoptEncoder,
        });
    await MeshoptEncoder.ready;
    await equipmentFixtures();
    await propFixtures();
    await garmentFixtures();
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});

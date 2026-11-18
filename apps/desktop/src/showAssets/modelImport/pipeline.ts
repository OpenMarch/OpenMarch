// cspell:words dedup khronos meshopt uninstance basisu precheck ndarray meshoptimizer's
/**
 * The model import step (fork #998; ADR 0010 amendment 2026-11-15; props-spec.md sections 2 and
 * 3): the picked `.glb`, or `.gltf` and its files, in; a clean asset or the reasons it can't be
 * one, out. It runs once, in the import worker, and returns finished bytes; the editor writes
 * them to the show (`saveImportedModel.ts`).
 *
 * 1. Refuse what can't work, before decoding: too many bytes, a URI outside the picked files,
 *    an unsupported required extension, an image too large to decode, more than 4× the
 *    triangle cap; then the Khronos validator's errors.
 * 2. Normalize: meters, +Y up, the front toward the audience (+Z), the pivot at the bottom
 *    center. Unit fixes, the tilt and the turn are choices, pre-selected and never
 *    silent.
 * 3. Fit the budget: simplify past the triangle cap (a pre-selected choice), shrink textures to
 *    the cap, and make a distant version.
 * 4. Derive what 2D needs: the plan from above (the built-ins' drawing), the stand point and a
 *    thumbnail.
 * 5. Prefill credits from the file.
 *
 * Calling again with the user's choices gives the final output; the same files and choices give
 * the same bytes.
 */
import {
    Logger,
    PropertyType,
    WebIO,
    GLB_BUFFER,
    type Document,
    type Material,
    type Node,
    type Scene,
    type Texture,
} from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
    cloneDocument,
    dedup,
    getBounds,
    prune,
    simplify,
    uninstance,
    weld,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import { planFromAbove } from "@/view3d/core/pit/planFromAbove";
import { creditsOf, titleOf } from "./credits";
import { openPickedFiles, RefusedError, type OpenedModel } from "./files";
import { isTilt, tiltQuaternion, UPRIGHT, Z_UP_TILT } from "./orientation";
import type { ImageCodec } from "./imageCodec";
import { precheck } from "./precheck";
import {
    DETAILED_TRIANGLE_CAP,
    DISTANT_SIMPLIFY_FROM,
    DISTANT_TEXTURE_CAP,
    DISTANT_TRIANGLE_CAP,
    DISTANT_TRIANGLE_RATIO,
    FLAT_RATIO,
    IMAGE_TYPES,
    MAX_IMPORT_BYTES,
    MODEL_IMPORT_VERSION,
    OUTPUT_EXTENSIONS,
    PLAUSIBLE_SIZE_M,
    TEXTURE_CAP,
    TRIANGLE_CAP,
    TRIANGLE_HARD_LIMIT,
    UNIT_FIXES,
    Z_UP_FACTOR,
} from "./rules";
import {
    primitiveTriangles,
    sceneNodes,
    sceneOf,
    sceneTriangles,
    topAt,
    worldTriangles,
} from "./sceneTriangles";
import { renderThumbnail } from "./thumbnail";
import type {
    Choice,
    DetailLevel,
    Fix,
    ModelImportChoices,
    ModelImportReport,
    ModelImportResult,
    ModelSidecar,
    PickedFile,
    Turn,
    UnitFix,
    Vec3,
} from "./types";
import { validateModel } from "./validate";

export interface ModelImportEnv {
    images: ImageCodec;
    /** Loads Draco's decoder (WebAssembly), only for a file that needs it */
    dracoDecoder: () => Promise<unknown>;
}

const DECODED_EXTENSIONS = new Set([
    "KHR_draco_mesh_compression",
    "EXT_meshopt_compression",
    "EXT_mesh_gpu_instancing",
]);

export async function importModel(
    files: readonly PickedFile[],
    choices: ModelImportChoices,
    env: ModelImportEnv,
): Promise<ModelImportResult> {
    const report: ModelImportReport = {
        cantImport: [],
        needsChoice: [],
        fixedForYou: [],
        notes: [],
    };
    try {
        const opened = await openAndCheck(files, report);
        if (!opened) return { ok: false, report };
        const read = await readClean(opened, env, report);
        if (!read) return { ok: false, report };
        const { io, doc, scene } = read;

        const { turn, root } = normalize(doc, scene, choices, report);
        await doc.transform(weld());
        const detail = await fitTriangles(doc, scene, choices, report);
        // After simplifying, which can move the lowest point
        placeOnGround(scene, root, report);
        stripExtras(doc);
        await shrinkTextures(doc, TEXTURE_CAP, env.images, report);
        await doc.transform(
            dedup({
                propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE],
            }),
            // Solid-color textures stay: finding them needs ndarray-pixels, which the worker
            // leaves out (it calls Function() as it loads)
            prune({ keepAttributes: true, keepSolidTextures: true }),
        );

        const model = await io.writeBinary(doc);
        // A level heavier than Light keeps a Light copy beside it, for devices that can't draw it
        const light =
            detail.row && detail.level !== "light"
                ? await makeLight(io, doc)
                : null;
        if (detail.row) detail.row.lightTriangles = light?.triangles ?? null;
        const distant = await makeDistant(io, doc, env.images);
        const derived = await derive(doc, env.images);
        const sidecar: ModelSidecar = {
            format: "openmarch-model/1",
            importVersion: MODEL_IMPORT_VERSION,
            sizeM: derived.sizeM,
            facing: { front: "+z", turnDeg: turn },
            plan: derived.plan,
            stand: derived.stand,
            triangles: sceneTriangles(sceneOf(doc)),
            distantTriangles: distant.triangles,
            detail: detail.level,
            ...(light ? { lightTriangles: light.triangles } : {}),
            importNotes: {
                needsChoice: report.needsChoice,
                fixedForYou: report.fixedForYou,
                notes: report.notes,
            },
        };
        return {
            ok: true,
            report,
            model: {
                name:
                    titleOf(opened.json) ??
                    opened.name.replace(/\.(glb|gltf)$/i, ""),
                parts: {
                    model,
                    distant: distant.bytes,
                    thumbnail: derived.thumbnail,
                    ...(light ? { light: light.bytes } : {}),
                },
                sidecar,
                credits: creditsOf(opened.json),
            },
        };
    } catch (error) {
        if (!(error instanceof RefusedError)) throw error;
        report.cantImport.push(error.refusal);
        return { ok: false, report };
    }
}

/**
 * The checks before decoding, then the validator: the opened model, or null with the refusals
 * in `report`.
 */
async function openAndCheck(
    files: readonly PickedFile[],
    report: ModelImportReport,
): Promise<OpenedModel | null> {
    const bytes = files.reduce((n, f) => n + f.bytes.byteLength, 0);
    if (bytes > MAX_IMPORT_BYTES) {
        report.cantImport.push({
            code: "tooLarge",
            bytes,
            limit: MAX_IMPORT_BYTES,
        });
        return null;
    }
    const opened = openPickedFiles(files);
    const checked = precheck(opened);
    if (checked.refusals.length) {
        report.cantImport.push(...checked.refusals);
        return null;
    }
    const validation = await validateModel(opened);
    if (validation.refusal) {
        report.cantImport.push(validation.refusal);
        return null;
    }
    if (validation.note) report.notes.push(validation.note);
    return opened;
}

/**
 * The document, decoded, with one scene and only what the stored GLB keeps; null with a
 * refusal in `report` for a rigged model or one with nothing to draw.
 */
async function readClean(
    opened: OpenedModel,
    env: ModelImportEnv,
    report: ModelImportReport,
): Promise<{ io: WebIO; doc: Document; scene: Scene } | null> {
    const { io, doc } = await readDocument(opened, env, report);
    // Draco and meshopt size their output from the compressed data, not the JSON the precheck
    // counted, so the decoded meshes are counted again: every mesh, used or not
    const decoded = doc
        .getRoot()
        .listMeshes()
        .reduce(
            (n, mesh) =>
                n +
                mesh
                    .listPrimitives()
                    .reduce((m, prim) => m + primitiveTriangles(prim), 0),
            0,
        );
    const limit = TRIANGLE_HARD_LIMIT;
    if (decoded > limit) {
        report.cantImport.push({
            code: "tooManyTriangles",
            triangles: decoded,
            cap: TRIANGLE_CAP,
            limit,
        });
        return null;
    }
    const scene = keepOneScene(doc, report);
    if (sceneNodes(scene).some((n) => n.getSkin() && n.getMesh())) {
        report.cantImport.push({ code: "rigged" });
        return null;
    }
    await dropExtensions(doc, opened, report);
    if (sceneTriangles(scene) > limit) {
        report.cantImport.push({
            code: "tooManyTriangles",
            triangles: sceneTriangles(scene),
            cap: TRIANGLE_CAP,
            limit,
        });
        return null;
    }
    if (sceneTriangles(scene) === 0) {
        report.cantImport.push({ code: "noGeometry" });
        return null;
    }
    const bounds = getBounds(scene);
    if (![...bounds.min, ...bounds.max].every(Number.isFinite)) {
        report.cantImport.push({
            code: "unreadable",
            reason: "the model's positions aren't finite numbers",
        });
        return null;
    }
    return { io, doc, scene };
}

// ------------------------------------------------------------------ reading

async function readDocument(
    opened: OpenedModel,
    env: ModelImportEnv,
    report: ModelImportReport,
): Promise<{ io: WebIO; doc: Document }> {
    const used = stringList(opened.json.extensionsUsed);
    await MeshoptDecoder.ready;
    const dependencies: Record<string, unknown> = {
        "meshopt.decoder": MeshoptDecoder,
    };
    if (used.includes("KHR_draco_mesh_compression"))
        dependencies["draco3d.decoder"] = await env.dracoDecoder();
    const io = new WebIO()
        .setLogger(new Logger(Logger.Verbosity.ERROR))
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies(dependencies);
    // Never `read(uri)`: every resource comes from the picked files
    const resources: Record<string, Uint8Array<ArrayBuffer>> = {};
    for (const [uri, bytes] of Object.entries(opened.resources))
        resources[uri] = bytes as Uint8Array<ArrayBuffer>;
    if (opened.bin)
        resources[GLB_BUFFER] = opened.bin as Uint8Array<ArrayBuffer>;
    let doc: Document;
    try {
        doc = await io.readJSON({
            json: structuredClone(opened.json) as never,
            resources,
        });
    } catch (error) {
        throw new RefusedError({
            code: "unreadable",
            reason: error instanceof Error ? error.message : String(error),
        });
    }
    if (used.includes("KHR_draco_mesh_compression"))
        report.fixedForYou.push({ code: "dracoDecoded" });
    if (used.includes("EXT_meshopt_compression"))
        report.fixedForYou.push({ code: "meshoptDecoded" });
    return { io, doc };
}

/** The default scene; other scenes, animations, cameras and morph targets go. */
function keepOneScene(doc: Document, report: ModelImportReport): Scene {
    const root = doc.getRoot();
    let scene = root.getDefaultScene() ?? root.listScenes()[0];
    if (!scene) {
        scene = doc.createScene("Scene");
        for (const node of root.listNodes())
            if (!node.getParentNode()) scene.addChild(node);
    }
    root.setDefaultScene(scene);
    const otherScenes = root.listScenes().filter((s) => s !== scene);
    const animations = root.listAnimations();
    const cameras = root.listCameras();
    let morphTargets = 0;
    for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives())
            for (const target of prim.listTargets()) {
                target.dispose();
                morphTargets++;
            }
        if (mesh.getWeights().length) mesh.setWeights([]);
    }
    for (const node of root.listNodes())
        if (node.getWeights().length) node.setWeights([]);
    otherScenes.forEach((s) => s.dispose());
    animations.forEach((a) => a.dispose());
    cameras.forEach((c) => c.dispose());
    if (
        otherScenes.length ||
        animations.length ||
        cameras.length ||
        morphTargets
    )
        report.fixedForYou.push({
            code: "contentDropped",
            animations: animations.length,
            cameras: cameras.length,
            morphTargets,
            scenes: otherScenes.length,
        });
    return scene;
}

/** Instances become plain nodes; extensions bare `GLTFLoader` can't use go. */
async function dropExtensions(
    doc: Document,
    opened: OpenedModel,
    report: ModelImportReport,
): Promise<void> {
    const used = stringList(opened.json.extensionsUsed);
    if (used.includes("EXT_mesh_gpu_instancing")) {
        await doc.transform(uninstance());
        report.fixedForYou.push({ code: "instancesExpanded" });
    }
    for (const ext of doc.getRoot().listExtensionsUsed())
        if (!OUTPUT_EXTENSIONS.has(ext.extensionName)) ext.dispose();
    // A KTX2 texture can't be shrunk or drawn without a transcoder, so it goes and its material
    // draws without it. Only an optional KTX2 texture reaches here: a required one was refused
    for (const texture of doc.getRoot().listTextures())
        if (!IMAGE_TYPES.has(texture.getMimeType())) texture.dispose();
    const dropped = used.filter(
        (e) => !OUTPUT_EXTENSIONS.has(e) && !DECODED_EXTENSIONS.has(e),
    );
    if (dropped.length)
        report.fixedForYou.push({
            code: "extensionsDropped",
            extensions: dropped,
        });
}

// ------------------------------------------------------------------ normalizing

const isPlausible = (largestM: number) =>
    largestM >= PLAUSIBLE_SIZE_M.min && largestM <= PLAUSIBLE_SIZE_M.max;

/**
 * Meters, +Y up, the front toward +Z: one new root node scales and turns the scene
 * (`placeOnGround` moves it later). Returns the turn applied and the node.
 */
function normalize(
    doc: Document,
    scene: Scene,
    choices: ModelImportChoices,
    report: ModelImportReport,
): { turn: Turn; root: Node } {
    const before = getBounds(scene);
    const size = before.max.map((v, i) => v - before.min[i]) as Vec3;
    const largest = Math.max(...size);

    // Units: a fix is offered only when the size is clearly off
    const offered = isPlausible(largest)
        ? []
        : UNIT_FIXES.filter((f) => isPlausible(largest * f.factor));
    let unit: UnitFix = choices.unitFix ?? "none";
    if (offered.length || choices.unitFix !== undefined) {
        const preselected = offered[0]?.unit ?? "none";
        unit = choices.unitFix ?? preselected;
        report.needsChoice.push({
            code: "unitFix",
            largestM: largest,
            options: ["none", ...offered.map((f) => f.unit)],
            preselected,
            applied: unit,
        });
    }
    const factor = UNIT_FIXES.find((f) => f.unit === unit)?.factor ?? 1;
    if (!isPlausible(largest * factor))
        report.notes.push({
            code: "sizeOutOfRange",
            largestM: largest * factor,
            minM: PLAUSIBLE_SIZE_M.min,
            maxM: PLAUSIBLE_SIZE_M.max,
        });

    // Z-up: suspected when the model stands tallest along Z; a flat one gets no guess. Tipping
    // is always offered: a file can lie on any side, and a long one (a car) is never suspected
    const [x, y, z] = size;
    const flat = Math.min(...size) < FLAT_RATIO * largest;
    const zUpSuspected = !flat && z > x && z > y && z > y * Z_UP_FACTOR;
    const preselectedTilt = zUpSuspected ? Z_UP_TILT : UPRIGHT;
    const tilt =
        choices.tilt && isTilt(choices.tilt) ? choices.tilt : preselectedTilt;
    report.needsChoice.push({
        code: "tilt",
        preselected: preselectedTilt,
        applied: tilt,
        zUpSuspected,
    });

    // The front: glTF's +Z unless the user turns it; always offered, since no file says
    const turn = choices.turn ?? 0;
    report.needsChoice.push({ code: "turn", preselected: 0, applied: turn });

    const root = doc.createNode("OM_import_root");
    root.setScale([factor, factor, factor]);
    // Turn about +Y (counter-clockwise from above), after standing it up
    const half = (turn * Math.PI) / 360;
    const yaw: [number, number, number, number] = [
        0,
        Math.sin(half),
        0,
        Math.cos(half),
    ];
    root.setRotation(multiplyQuat(yaw, tiltQuaternion(tilt)));
    for (const child of scene.listChildren()) {
        scene.removeChild(child);
        root.addChild(child);
    }
    scene.addChild(root);
    return { turn, root };
}

/** Moves the pivot to the bottom center of the footprint: the origin, on the ground. */
function placeOnGround(
    scene: Scene,
    root: Node,
    report: ModelImportReport,
): void {
    const { min, max } = getBounds(scene);
    const pivot: Vec3 = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
    root.setTranslation([-pivot[0], -pivot[1], -pivot[2]]);
    if (Math.hypot(...pivot) > 0.001)
        report.fixedForYou.push({
            code: "pivotMoved",
            offsetM: pivot.map((v) => -v) as Vec3,
        });
}

function multiplyQuat(
    a: readonly number[],
    b: readonly number[],
): [number, number, number, number] {
    const [ax, ay, az, aw] = a;
    const [bx, by, bz, bw] = b;
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ];
}

// ------------------------------------------------------------------ the budget

/**
 * Brings the model to the chosen level (#1091): Light (pre-selected) simplifies to
 * `TRIANGLE_CAP`, Detailed to `DETAILED_TRIANGLE_CAP`, Original keeps every triangle. A model
 * within the Light cap has nothing to choose. Notes what a simplification couldn't reach.
 */
async function fitTriangles(
    doc: Document,
    scene: Scene,
    choices: ModelImportChoices,
    report: ModelImportReport,
): Promise<{
    level: DetailLevel;
    row: Extract<Choice, { code: "detail" }> | null;
}> {
    const triangles = sceneTriangles(scene);
    if (triangles <= TRIANGLE_CAP) return { level: "original", row: null };
    const levels: DetailLevel[] =
        triangles > DETAILED_TRIANGLE_CAP
            ? ["light", "detailed", "original"]
            : ["light", "original"];
    const asked = choices.detail ?? "light";
    const applied = levels.includes(asked) ? asked : "light";
    const row: Extract<Choice, { code: "detail" }> = {
        code: "detail",
        triangles,
        levels,
        preselected: "light",
        applied,
        appliedTriangles: triangles,
        lightTriangles: null,
    };
    report.needsChoice.push(row);
    const target =
        applied === "light"
            ? TRIANGLE_CAP
            : applied === "detailed"
              ? DETAILED_TRIANGLE_CAP
              : null;
    if (target !== null) {
        row.appliedTriangles = await simplifyTo(doc, scene, target);
        if (row.appliedTriangles > target)
            report.notes.push({
                code: "overTriangleCap",
                triangles: row.appliedTriangles,
                cap: target,
            });
    }
    return { level: applied, row };
}

/** The Light copy kept beside a heavier level: the finished model, simplified to the cap. */
async function makeLight(
    io: WebIO,
    doc: Document,
): Promise<{ bytes: Uint8Array; triangles: number }> {
    const light = cloneDocument(doc);
    const scene = sceneOf(light);
    await simplifyTo(light, scene, TRIANGLE_CAP);
    await light.transform(
        prune({ keepAttributes: true, keepSolidTextures: true }),
    );
    return {
        bytes: await io.writeBinary(light),
        triangles: sceneTriangles(scene),
    };
}

/**
 * meshoptimizer's simplifier toward `target` triangles: the ratio first, then a wider error
 * limit until it gets there (spike #995). Returns the triangles left.
 */
async function simplifyTo(
    doc: Document,
    scene: Scene,
    target: number,
): Promise<number> {
    await MeshoptSimplifier.ready;
    const start = sceneTriangles(scene);
    let now = start;
    for (const error of [0.01, 0.05, 0.2, 1]) {
        if (now <= target) break;
        await doc.transform(
            simplify({
                simplifier: MeshoptSimplifier,
                ratio: Math.min(1, (target / now) * 0.95),
                error,
            }),
        );
        now = sceneTriangles(scene);
    }
    return now;
}

function stripExtras(doc: Document): void {
    const root = doc.getRoot();
    root.setExtras({});
    for (const list of [
        root.listScenes(),
        root.listNodes(),
        root.listMeshes(),
        root.listMaterials(),
        root.listTextures(),
        root.listAccessors(),
        root.listBuffers(),
    ])
        for (const property of list) property.setExtras({});
    for (const mesh of root.listMeshes())
        for (const prim of mesh.listPrimitives()) prim.setExtras({});
}

/** Shrinks every texture longer than `cap` on an edge, keeping its format and aspect. */
async function shrinkTextures(
    doc: Document,
    cap: number,
    images: ImageCodec,
    report: ModelImportReport | null,
): Promise<void> {
    const shrunk: Extract<Fix, { code: "texturesShrunk" }>["textures"] = [];
    for (const [index, texture] of doc.getRoot().listTextures().entries()) {
        const size = texture.getSize();
        const image = texture.getImage();
        if (!size || !image || Math.max(size[0], size[1]) <= cap) continue;
        const k = cap / Math.max(size[0], size[1]);
        const to: [number, number] = [
            Math.max(1, Math.round(size[0] * k)),
            Math.max(1, Math.round(size[1] * k)),
        ];
        texture.setImage(
            await images.resize(image, texture.getMimeType(), to[0], to[1]),
        );
        shrunk.push({
            name: textureName(texture, index),
            from: [size[0], size[1]],
            to,
        });
    }
    if (shrunk.length && report)
        report.fixedForYou.push({
            code: "texturesShrunk",
            cap,
            textures: shrunk,
        });
}

const textureName = (texture: Texture, index: number) =>
    texture.getName() || texture.getURI() || `texture ${index + 1}`;

/** The distant version: simplified hard, with small textures. */
async function makeDistant(
    io: WebIO,
    doc: Document,
    images: ImageCodec,
): Promise<{ bytes: Uint8Array; triangles: number }> {
    const distant = cloneDocument(doc);
    const scene = sceneOf(distant);
    const triangles = sceneTriangles(scene);
    if (triangles >= DISTANT_SIMPLIFY_FROM) {
        const target = Math.max(
            DISTANT_SIMPLIFY_FROM / 4,
            Math.min(
                DISTANT_TRIANGLE_CAP,
                Math.floor(triangles * DISTANT_TRIANGLE_RATIO),
            ),
        );
        await simplifyTo(distant, scene, target);
    }
    await shrinkTextures(distant, DISTANT_TEXTURE_CAP, images, null);
    await distant.transform(
        prune({ keepAttributes: true, keepSolidTextures: true }),
    );
    return {
        bytes: await io.writeBinary(distant),
        triangles: sceneTriangles(scene),
    };
}

// ------------------------------------------------------------------ 2D and thumbnail

async function derive(doc: Document, images: ImageCodec) {
    const scene = sceneOf(doc);
    const { min, max } = getBounds(scene);
    const triangles = worldTriangles(scene);
    const top = topAt(triangles, 0, 0);
    const colors = new Map<Material | null, [number, number, number]>();
    for (const { material } of triangles)
        if (!colors.has(material))
            colors.set(material, await materialColor(material, images));
    const round = (v: number) => Math.round(v * 1e6) / 1e6;
    return {
        sizeM: {
            width: round(max[0] - min[0]),
            height: round(max[1] - min[1]),
            depth: round(max[2] - min[2]),
        },
        plan: planFromAbove(
            triangles.map((t) => t.positions),
            { slivers: true },
        ),
        stand:
            top === null
                ? null
                : { atM: [0, 0] as [number, number], topM: round(top) },
        thumbnail: await renderThumbnail(
            triangles.map((t) => ({
                positions: t.positions,
                color: colors.get(t.material)!,
            })),
        ),
    };
}

/** A material's average color as drawn, sRGB 0 to 1: its base color times its texture's average. */
async function materialColor(
    material: Material | null,
    images: ImageCodec,
): Promise<[number, number, number]> {
    if (!material) return [0.8, 0.8, 0.8];
    const factor = material.getBaseColorFactor();
    let tint = [1, 1, 1];
    const texture = material.getBaseColorTexture();
    const image = texture?.getImage();
    if (texture && image) {
        try {
            const [r, g, b] = await images.averageColor(
                image,
                texture.getMimeType(),
            );
            tint = [r, g, b].map(toLinear);
        } catch {
            // A texture the codec can't read only loses its tint
        }
    }
    return [0, 1, 2].map((i) => toSrgb(factor[i] * tint[i])) as [
        number,
        number,
        number,
    ];
}

const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number) =>
    c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

function stringList(v: unknown): string[] {
    return Array.isArray(v)
        ? v.filter((e): e is string => typeof e === "string")
        : [];
}

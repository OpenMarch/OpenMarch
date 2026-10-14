// cspell:words dedup khronos meshopt uninstance
/**
 * The model import pipeline (package C1.7; ADR 0002 D-13; props-spec.md
 * section 2 "Import pipeline" and section 3 "Models"). A GLB or glTF in; a
 * plain normalized GLB, an OpenMarch sidecar and an import report out. It
 * runs once, in Node (main or a utility process), so the 3D View keeps
 * loading with bare `GLTFLoader` and no decoders.
 *
 * Steps: validate (errors block); reject `extensionsRequired` outside the
 * allow-list; decode Draco and meshopt; measure; read `OM_*` nodes and
 * `extras.openmarch`; convert or flag (units, Y-up, triangles, textures,
 * Garment rigs); dedup, prune and weld; write the GLB and sidecar.
 *
 * Nothing is converted silently: every conversion is a pre-selected choice in
 * the report, and `ModelImportChoices` overrides it. Calling again with the
 * user's choices gives the final output. No IPC here: the channels are
 * package C1.9.
 */
import {
    Document,
    Logger,
    NodeIO,
    PropertyType,
    type Material,
    type Mesh,
    type Node,
    type Scene,
} from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
    compressTexture,
    dedup,
    prune,
    simplifyPrimitive,
    uninstance,
    weld,
} from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import { Matrix4, Quaternion, Vector3 } from "three";
import {
    conversionsIntoRange,
    equipmentWgiNote,
    floorWgiNote,
    isPlausibleSize,
    MODEL_UNIT_CONVERSIONS,
    PLAUSIBLE_SIZE,
} from "@/view3d/core/sizes";
import {
    checkResources,
    ContainerError,
    parseContainer,
    readModelFile,
    resourcesByPath,
    type RawGltf,
} from "./container";
import { checkGarment, normalizeGarment } from "./garment";
import { validateModel } from "./validate";
import {
    meshTriangles,
    measureDocument,
    measureMaterials,
    sceneNodes,
    worldMatrix,
} from "./measure";
import {
    readOpenMarchMetadata,
    type OpenMarchMetadata,
} from "./openmarch-metadata";
import {
    ALLOWED_REQUIRED_EXTENSIONS,
    FLAT_RATIO,
    GARMENT_BODY_TYPES,
    MODEL_KINDS,
    MODEL_PIPELINE_VERSION,
    OUTPUT_EXTENSIONS,
    SIMPLIFY_ERROR,
    TEXTURE_CAPS,
    TRIANGLE_CAPS,
    TRIANGLE_REJECT_FACTOR,
    Z_UP_FACTOR,
} from "./rules";
import {
    MODEL_SIDECAR_FORMAT,
    ModelSidecarSchema,
    type AttachPoint,
    type ArtworkSlot,
    type ChoiceRow,
    type FixRow,
    type GripChoice,
    type MaterialInfo,
    type ModelFileInput,
    type ModelImportChoices,
    type ModelImportOptions,
    type ModelImportReport,
    type ModelImportResult,
    type ModelImportStage,
    type ModelKind,
    type ModelSidecar,
    type NoteRow,
    type Quat,
    type StretchZones,
    type UnitChoice,
    type Vec3,
} from "./types";

const DECODED_EXTENSIONS = new Set([
    "KHR_draco_mesh_compression",
    "EXT_meshopt_compression",
    "EXT_mesh_gpu_instancing",
]);

let ioPromise: Promise<NodeIO> | null = null;

/** One NodeIO with the Draco and meshopt decoders, made on first use. */
function getIO(): Promise<NodeIO> {
    ioPromise ??= (async () => {
        await MeshoptDecoder.ready;
        await MeshoptSimplifier.ready;
        return new NodeIO()
            .setLogger(new Logger(Logger.Verbosity.WARN))
            .registerExtensions(ALL_EXTENSIONS)
            .registerDependencies({
                "draco3d.decoder": await draco3d.createDecoderModule(),
                "meshopt.decoder": MeshoptDecoder,
            });
    })();
    return ioPromise;
}

/** Reads a picked file (and a `.gltf`'s resources) and imports it. */
export async function importModelFile(
    filePath: string,
    options: ModelImportOptions = {},
): Promise<ModelImportResult> {
    const stage = stageReporter(options.onStage);
    stage("reading");
    return run(await readModelFile(filePath), options, stage);
}

export async function importModel(
    input: ModelFileInput,
    options: ModelImportOptions = {},
): Promise<ModelImportResult> {
    const stage = stageReporter(options.onStage);
    stage("reading");
    return run(input, options, stage);
}

type StageReporter = (stage: ModelImportStage) => void;

/** Calls `onStage`, ignoring whatever it throws or rejects with. */
function stageReporter(onStage: ModelImportOptions["onStage"]): StageReporter {
    return (stage) => {
        if (!onStage) return;
        try {
            const returned: unknown = onStage(stage);
            if (returned instanceof Promise) returned.catch(() => {});
        } catch {
            // Progress is best effort: never fail an import over it.
        }
    };
}

async function run(
    input: ModelFileInput,
    options: ModelImportOptions,
    stage: StageReporter,
): Promise<ModelImportResult> {
    const report = emptyReport();
    const opened = await openFile(input, report, stage);
    if (!opened) return rejected(report);
    stage("decoding");
    const ctx = await decode(input, opened, report);
    if (!ctx) return rejected(report);

    const kind = resolveKind(ctx, options.kind);
    if (!kind) {
        report.status = "needs-kind";
        return { report, output: null };
    }
    stage("checking");
    const plan = planConversion(ctx, kind, options.choices ?? {});
    if (report.cantImport.length) return rejected(report);

    stage("converting");
    await convert(ctx, plan);
    const described = describe(ctx, plan);
    await clean(ctx, kind);
    stage("writing");
    return write(ctx, plan, described);
}

// ------------------------------------------------------------------ stages

interface OpenedFile {
    format: "glb" | "gltf";
    json: RawGltf;
    resources: Readonly<Record<string, Uint8Array>>;
}

interface Context {
    report: ModelImportReport;
    io: NodeIO;
    doc: Document;
    scene: Scene;
    json: RawGltf;
    meta: OpenMarchMetadata;
    /** Properties by their index in the source file, before any change. */
    raw: { nodes: Node[]; materials: Material[]; meshes: Mesh[] };
}

interface Plan {
    kind: ModelKind;
    choices: ModelImportChoices;
    units: UnitChoice;
    rotate: boolean;
    factor: number;
    conversion: Matrix4;
    nodesByFit: Map<string, Node[]> | null;
    worst: number;
    cap: number;
}

interface Described {
    grips: { right: AttachPoint | null; left: AttachPoint | null };
    attachPoints: Record<string, AttachPoint>;
    stretch: StretchZones | null;
}

function emptyReport(): ModelImportReport {
    return {
        pipelineVersion: MODEL_PIPELINE_VERSION,
        status: "rejected",
        kind: null,
        kindSource: null,
        cantImport: [],
        needsChoice: [],
        fixedForYou: [],
        notes: [],
        badges: [],
        source: null,
        output: null,
        materials: [],
        metadata: { generator: null, copyright: null },
    };
}

function rejected(report: ModelImportReport): ModelImportResult {
    report.status = "rejected";
    return { report, output: null };
}

/** Container, resources, the extension allow-list and the validator. */
async function openFile(
    input: ModelFileInput,
    report: ModelImportReport,
    stage: StageReporter,
): Promise<OpenedFile | null> {
    let format: "glb" | "gltf";
    let json: RawGltf;
    let resources = input.resources ?? {};
    try {
        ({ format, json } = parseContainer(input.bytes));
        // A GLB is read on its own, so any URI it names is refused or missing.
        checkResources(json, resources, input.refusedResources);
        if (format === "gltf") {
            resources = resourcesByPath(
                json,
                resources,
                input.refusedResources,
            );
        }
    } catch (error) {
        if (!(error instanceof ContainerError)) throw error;
        report.cantImport.push(
            error.code === "unreadable"
                ? { code: "unreadable", reason: error.message }
                : { code: error.code, uri: error.uri ?? "" },
        );
        return null;
    }
    report.metadata = {
        generator: stringOrNull(json.asset?.generator),
        copyright: stringOrNull(json.asset?.copyright),
    };

    stage("validating");
    // Required extensions, from the raw JSON: r186 GLTFLoader only warns.
    const disallowed = stringList(json.extensionsRequired).filter(
        (e) => !ALLOWED_REQUIRED_EXTENSIONS.has(e),
    );
    if (disallowed.length) {
        report.cantImport.push({
            code: "requiredExtension",
            extensions: disallowed,
        });
    }

    // Khronos validator: errors block, warnings are a quiet note.
    const validation = await validateModel(input.bytes, format, resources);
    if (validation.errorCount > 0) {
        report.cantImport.push({
            code: "validatorErrors",
            count: validation.errorCount,
            messages: validation.errors,
        });
    }
    if (validation.warningCount > 0) {
        report.notes.push({
            code: "validatorWarnings",
            count: validation.warningCount,
        });
    }
    return report.cantImport.length ? null : { format, json, resources };
}

/** Reads (decoding Draco and meshopt), strips what can't stay, measures. */
async function decode(
    input: ModelFileInput,
    { format, json, resources }: OpenedFile,
    report: ModelImportReport,
): Promise<Context | null> {
    const io = await getIO();
    let doc: Document;
    try {
        doc =
            format === "glb"
                ? await io.readBinary(input.bytes)
                : await io.readJSON({
                      json: structuredClone(json) as never,
                      resources: Object.fromEntries(
                          Object.entries(resources).map(([uri, data]) => [
                              uri,
                              new Uint8Array(data),
                          ]),
                      ),
                  });
    } catch (error) {
        report.cantImport.push({
            code: "unreadable",
            reason: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
    const root = doc.getRoot();
    const meta = readOpenMarchMetadata(json);
    report.notes.push(...meta.notes);
    const raw = {
        nodes: root.listNodes(),
        materials: root.listMaterials(),
        meshes: root.listMeshes(),
    };

    const scene = pickScene(doc, json);
    stripContent(doc, scene, report);
    await stripExtensions(doc, json, report);

    report.source = measureDocument(doc, scene);
    const ctx = { report, io, doc, scene, json, meta, raw };
    report.materials = materialRows(ctx);
    if (report.source.triangles === 0) {
        report.cantImport.push({ code: "noGeometry" });
        return null;
    }
    return ctx;
}

/** From a picker, else the Starter kit stamp, else a required choice. */
function resolveKind(
    { meta, report }: Context,
    fromPicker: ModelKind | undefined,
): ModelKind | null {
    const stamped = meta.stamp.kind;
    const stampKind = (MODEL_KINDS as readonly string[]).includes(stamped ?? "")
        ? (stamped as ModelKind)
        : null;
    if (stamped && !stampKind) {
        report.notes.push({ code: "unknownStampKind", value: stamped });
    }
    const kind = fromPicker ?? stampKind;
    report.kindSource = fromPicker ? "option" : stampKind ? "stamp" : null;
    report.kind = kind;
    if (!kind) {
        report.needsChoice.push({
            code: "kind",
            options: MODEL_KINDS,
            preselected: null,
        });
    }
    return kind;
}

/** The checks that need the kind: rigs, units, Y-up, Garments, triangles. */
function planConversion(
    ctx: Context,
    kind: ModelKind,
    choices: ModelImportChoices,
): Plan {
    const { report, scene, meta, raw } = ctx;

    // Rigs: only Garments, and Garments only rigged.
    const skinned = sceneNodes(scene).some((n) => n.getSkin() && n.getMesh());
    if (skinned && kind !== "garment") {
        report.cantImport.push({ code: "rigNotAllowed", kind });
    }

    // Units and Y-up: pre-selected, never silent.
    const size = report.source!.bounds!.size;
    const units = unitChoice(
        kind,
        Math.max(...size),
        choices.unitConversion,
        report,
    );
    const rotate = rotateChoice(kind, size, choices.rotateToYUp, report);
    const factor =
        MODEL_UNIT_CONVERSIONS.find((c) => c.unit === units)?.factor ?? 1;
    const conversion = new Matrix4().makeScale(factor, factor, factor);
    if (rotate) conversion.multiply(new Matrix4().makeRotationX(-Math.PI / 2));
    if (units !== "none") report.badges.push("scaled");

    // Garment rigs, compared after the conversion.
    let nodesByFit: Map<string, Node[]> | null = null;
    if (kind === "garment") {
        const check = checkGarment(scene, conversion, (node) =>
            meta.fitsByNode.get(raw.nodes.indexOf(node)),
        );
        report.cantImport.push(...check.rejections);
        report.notes.push(...check.notes);
        nodesByFit = check.nodesByFit;
    }

    // Triangle cap: per fit for Garments; over 4× is the one hard limit.
    const cap = TRIANGLE_CAPS[kind];
    const worst = nodesByFit
        ? Math.max(0, ...Object.values(fitTriangles(nodesByFit)))
        : report.source!.triangles;
    const limit = cap * TRIANGLE_REJECT_FACTOR;
    if (worst > limit) {
        report.cantImport.push({
            code: "overTriangleCap",
            triangles: worst,
            cap,
            limit,
        });
    }
    return {
        kind,
        choices,
        units,
        rotate,
        factor,
        conversion,
        nodesByFit,
        worst,
        cap,
    };
}

/** Applies the conversion, welds, and simplifies when chosen. */
async function convert(ctx: Context, plan: Plan): Promise<void> {
    const { doc, scene, report } = ctx;
    if (plan.kind === "garment") {
        const { renormalized } = normalizeGarment(doc, scene, plan.conversion);
        if (renormalized > 0) {
            report.fixedForYou.push({
                code: "influencesRenormalized",
                vertices: renormalized,
            });
        }
    } else if (plan.units !== "none" || plan.rotate) {
        applyToRoots(scene, plan.conversion);
    }

    await doc.transform(weld());
    if (plan.worst <= plan.cap) return;
    const simplify = plan.choices.simplify ?? true;
    const row: Extract<ChoiceRow, { code: "simplify" }> = {
        code: "simplify",
        triangles: plan.worst,
        cap: plan.cap,
        simplifiedTriangles: null,
        preselected: true,
        applied: simplify,
    };
    report.needsChoice.push(row);
    if (!simplify) return;
    simplifyTo(doc, plan.cap / plan.worst);
    const after = plan.nodesByFit
        ? Math.max(...Object.values(fitTriangles(plan.nodesByFit)))
        : measureDocument(doc, scene).triangles;
    row.simplifiedTriangles = after;
    report.badges.push("simplified");
    if (after > plan.cap) {
        report.notes.push({
            code: "stillOverTriangleCap",
            triangles: after,
            cap: plan.cap,
        });
    }
}

/** Grips, attach points, stretch zones and size notes, in output meters. */
function describe(ctx: Context, plan: Plan): Described {
    const { doc, scene, meta, raw, report } = ctx;
    const { kind, choices } = plan;
    const bounds = measureDocument(doc, scene).bounds!;
    // Re-measured in output meters, before cleaning drops anything.
    report.materials = materialRows(ctx);
    const nodeOf = (name: string) =>
        meta.omNodes.find((n) => n.name === name)?.index;
    const pointOf = (index: number | undefined): AttachPoint | null =>
        index === undefined ? null : attachPoint(raw.nodes[index]);

    const grips = {
        right: pointOf(nodeOf("OM_grip_R")),
        left: pointOf(nodeOf("OM_grip_L")),
    };
    if (kind === "equipment" && !grips.right) {
        const preselected = fallbackGrip(bounds);
        const applied = choices.grip === undefined ? preselected : choices.grip;
        report.needsChoice.push({
            code: "missingGrip",
            preselected,
            applied,
            misnamed: meta.misnamed.filter((n) => /^OM.grip/i.test(n)),
        });
        if (applied) {
            const rotation = longestAxisRotation(bounds.size);
            grips.right = { position: applied.right, rotation };
            grips.left ??= applied.left
                ? { position: applied.left, rotation }
                : null;
        }
    }
    const attachPoints: Record<string, AttachPoint> = {};
    for (const { index, name } of meta.omNodes) {
        if (name === "OM_grip_R" || name === "OM_grip_L") continue;
        attachPoints[name] = attachPoint(raw.nodes[index]);
    }

    // Stretch zones move with the conversion; none is a lasting note.
    const stretch = meta.stretch
        ? convertStretch(meta.stretch, plan.factor, plan.rotate)
        : null;
    if (kind !== "garment" && !(stretch?.x || stretch?.y || stretch?.z)) {
        report.notes.push({ code: "noStretchZones" });
        report.badges.push("noStretchZones");
    }
    if (!meta.hasOpenMarchData && !choices.slots?.length) {
        report.notes.push({ code: "customPropertiesOff" });
    }
    sizeNotes(kind, bounds.size, report);
    return { grips, attachPoints, stretch };
}

function sizeNotes(kind: ModelKind, size: Vec3, report: ModelImportReport) {
    const largest = Math.max(...size);
    if (!isPlausibleSize(kind, largest)) {
        const { minM, maxM } = PLAUSIBLE_SIZE[kind];
        report.notes.push({
            code: "sizeOutOfRange",
            largestM: largest,
            minM,
            maxM,
        });
    }
    const wgi =
        kind === "equipment"
            ? equipmentWgiNote(largest)
            : kind === "baseFloor"
              ? floorWgiNote(size[0], size[2])
              : null;
    if (wgi) report.notes.push({ code: "wgi", wgi: wgi.code });
}

/** Extras out, textures down to the cap, dedup and prune. */
async function clean(ctx: Context, kind: ModelKind): Promise<void> {
    const { doc, meta, report } = ctx;
    stripExtras(doc);
    if (meta.hasForeignExtras)
        report.fixedForYou.push({ code: "extrasStripped" });
    await downsizeTextures(doc, TEXTURE_CAPS[kind], report);
    // Materials and meshes stay apart: two slots may look alike, and a slot
    // may sit on one of two identical meshes (their accessors are still
    // shared). UVs and `_PART` stay even with no texture: slots and paint
    // need them.
    await doc.transform(
        dedup({
            propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE],
        }),
        prune({ keepAttributes: true, keepLeaves: false }),
    );
}

/** Slots against the cleaned document, then the GLB and sidecar. */
async function write(
    ctx: Context,
    plan: Plan,
    described: Described,
): Promise<ModelImportResult> {
    const { doc, io, meta, raw, report } = ctx;
    const slots = collectSlots(
        meta,
        raw.materials,
        raw.meshes,
        plan.choices,
        doc,
    );
    report.notes.push(...slots.notes);

    const glb = await io.writeBinary(doc);
    const root = doc.getRoot();
    const outputMaterials = root.listMaterials();
    for (const row of report.materials) {
        const index = outputMaterials.indexOf(raw.materials[row.index]);
        row.outputIndex = index >= 0 ? index : null;
    }
    const measured = measureDocument(
        doc,
        root.getDefaultScene() ?? root.listScenes()[0],
        plan.nodesByFit ? fitTriangles(plan.nodesByFit) : null,
    );
    report.output = measured;
    report.status = "ready";

    let garment: ModelSidecar["garment"] = null;
    if (plan.nodesByFit) {
        const meshes = root.listMeshes();
        const fits = GARMENT_BODY_TYPES.filter((t) => plan.nodesByFit!.has(t));
        const meshesByFit: NonNullable<ModelSidecar["garment"]>["meshesByFit"] =
            {};
        for (const fit of fits) {
            meshesByFit[fit] = [
                ...new Set(
                    plan.nodesByFit
                        .get(fit)!
                        .map((n) => meshes.indexOf(n.getMesh()!)),
                ),
            ].filter((i) => i >= 0);
        }
        garment = { fits, meshesByFit };
    }

    const sidecar = ModelSidecarSchema.parse({
        format: MODEL_SIDECAR_FORMAT,
        pipelineVersion: MODEL_PIPELINE_VERSION,
        kind: plan.kind,
        bounds: measured.bounds!,
        triangles: measured.triangles,
        drawCalls: measured.drawCalls,
        grips: described.grips,
        attachPoints: described.attachPoints,
        artworkSlots: slots.slots,
        stretch: described.stretch,
        stamp: meta.stamp,
        garment,
        metadata: {
            generator: report.metadata.generator,
            copyright: report.metadata.copyright,
        },
        importNotes: {
            needsChoice: report.needsChoice,
            fixedForYou: report.fixedForYou,
            notes: report.notes,
            badges: report.badges,
        },
    });
    const sidecarBytes = new TextEncoder().encode(JSON.stringify(sidecar));
    return { report, output: { glb, sidecar, sidecarBytes } };
}

// ------------------------------------------------------------------ steps

function stringOrNull(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null;
}

function stringList(v: unknown): string[] {
    return Array.isArray(v)
        ? v.filter((e): e is string => typeof e === "string")
        : [];
}

/** The default scene; the others are dropped (counted in contentStripped). */
function pickScene(doc: Document, json: RawGltf): Scene {
    const root = doc.getRoot();
    const scenes = root.listScenes();
    let scene =
        root.getDefaultScene() ??
        scenes[typeof json.scene === "number" ? json.scene : 0];
    if (!scene) {
        scene = doc.createScene("Scene");
        for (const node of root.listNodes()) {
            if (!node.getParentNode()) scene.addChild(node);
        }
    }
    root.setDefaultScene(scene);
    return scene;
}

function stripContent(doc: Document, scene: Scene, report: ModelImportReport) {
    const root = doc.getRoot();
    const otherScenes = root.listScenes().filter((s) => s !== scene);
    const animations = root.listAnimations();
    const cameras = root.listCameras();
    let morphTargets = 0;
    for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            for (const target of prim.listTargets()) {
                target.dispose();
                morphTargets++;
            }
        }
        if (mesh.getWeights().length) mesh.setWeights([]);
    }
    for (const node of root.listNodes()) {
        if (node.getWeights().length) node.setWeights([]);
    }
    otherScenes.forEach((s) => s.dispose());
    animations.forEach((a) => a.dispose());
    cameras.forEach((c) => c.dispose());
    if (
        otherScenes.length ||
        animations.length ||
        cameras.length ||
        morphTargets
    ) {
        report.fixedForYou.push({
            code: "contentStripped",
            animations: animations.length,
            cameras: cameras.length,
            morphTargets,
            scenes: otherScenes.length,
        });
    }
}

async function stripExtensions(
    doc: Document,
    json: RawGltf,
    report: ModelImportReport,
): Promise<void> {
    const used = stringList(json.extensionsUsed);
    if (used.includes("KHR_draco_mesh_compression")) {
        report.fixedForYou.push({ code: "dracoDecoded" });
    }
    if (used.includes("EXT_meshopt_compression")) {
        report.fixedForYou.push({ code: "meshoptDecoded" });
    }
    if (used.includes("EXT_mesh_gpu_instancing")) {
        // Expanded into plain nodes before the extension goes.
        await doc.transform(uninstance());
        report.fixedForYou.push({ code: "instancesExpanded" });
    }
    for (const ext of doc.getRoot().listExtensionsUsed()) {
        if (!OUTPUT_EXTENSIONS.has(ext.extensionName)) ext.dispose();
    }
    const stripped = used.filter(
        (e) => !OUTPUT_EXTENSIONS.has(e) && !DECODED_EXTENSIONS.has(e),
    );
    if (stripped.length) {
        report.fixedForYou.push({
            code: "extensionsStripped",
            extensions: stripped,
        });
    }
}

function unitChoice(
    kind: ModelKind,
    largestM: number,
    chosen: UnitChoice | undefined,
    report: ModelImportReport,
): UnitChoice {
    const offered = conversionsIntoRange(kind, largestM);
    if (offered.length === 0) return chosen ?? "none";
    const preselected = offered[0].unit;
    const applied = chosen ?? preselected;
    report.needsChoice.push({
        code: "unitConversion",
        largestM,
        options: ["none", ...offered.map((c) => c.unit)],
        preselected,
        applied,
    });
    return applied;
}

/** Whether a Prop is a sheet or a tarp, which Y-up can't be guessed for. */
function isFlat(size: Vec3): boolean {
    return Math.min(...size) < FLAT_RATIO * Math.max(...size);
}

function rotateChoice(
    kind: ModelKind,
    size: Vec3,
    chosen: boolean | undefined,
    report: ModelImportReport,
): boolean {
    const [x, y, z] = size;
    // A flat Prop (a sign, a backdrop) may stand or lie: no guess either way.
    if (kind === "prop" && isFlat(size)) return chosen ?? false;
    const floor = kind === "floorProp" || kind === "baseFloor";
    // A floor lying Z-up has Z as its thinnest side, not Y: offered, not
    // checked. Anything else exported Z-up stands tallest along Z.
    const suspected = floor
        ? z < y && z <= x
        : z > x && z > y && z > y * Z_UP_FACTOR;
    if (!suspected) return chosen ?? false;
    const preselected = !floor;
    const applied = chosen ?? preselected;
    report.needsChoice.push({ code: "rotateToYUp", preselected, applied });
    return applied;
}

/** Left-multiplies each root node's transform: the whole scene converts. */
function applyToRoots(scene: Scene, conversion: Matrix4): void {
    for (const node of scene.listChildren()) {
        const local = new Matrix4().fromArray(node.getMatrix());
        node.setMatrix(conversion.clone().multiply(local).toArray() as never);
    }
}

function fitTriangles(nodesByFit: Map<string, Node[]>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [fit, nodes] of nodesByFit) {
        out[fit] = nodes.reduce((s, n) => s + meshTriangles(n.getMesh()!), 0);
    }
    return out;
}

function simplifyTo(doc: Document, ratio: number): void {
    for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            if (prim.getMode() !== 4) continue;
            simplifyPrimitive(prim, {
                simplifier: MeshoptSimplifier,
                ratio: Math.min(1, ratio * 0.95),
                error: SIMPLIFY_ERROR,
            });
        }
    }
}

function attachPoint(node: Node): AttachPoint {
    const position = new Vector3();
    const rotation = new Quaternion();
    worldMatrix(node).decompose(position, rotation, new Vector3());
    return {
        position: position.toArray() as Vec3,
        rotation: rotation.normalize().toArray() as Quat,
    };
}

/**
 * The pre-selected grip when a model has no `OM_grip_R`: on the longest side,
 * a quarter of the way from its low end, centered across. The review lets
 * the user click a better point (C1.10). Grips live in the sidecar; the
 * model is never re-centered on them (owner decision Q37, 2026-10-11).
 */
function fallbackGrip(bounds: {
    min: Vec3;
    max: Vec3;
    size: Vec3;
}): GripChoice {
    const axis = bounds.size.indexOf(Math.max(...bounds.size));
    const right = bounds.min.map((lo, i) =>
        i === axis ? lo + bounds.size[i] * 0.25 : lo + bounds.size[i] / 2,
    ) as Vec3;
    return { right, left: null };
}

/** The rotation that points the grip frame's +Z along the longest side. */
function longestAxisRotation(size: Vec3): Quat {
    const axis = size.indexOf(Math.max(...size));
    const s = Math.SQRT1_2;
    if (axis === 0) return [0, s, 0, s];
    if (axis === 1) return [-s, 0, 0, s];
    return [0, 0, 0, 1];
}

function convertStretch(
    zones: StretchZones,
    factor: number,
    rotate: boolean,
): StretchZones {
    const scale = (z: [number, number] | null): [number, number] | null =>
        z ? [z[0] * factor, z[1] * factor] : null;
    const scaled = { x: scale(zones.x), y: scale(zones.y), z: scale(zones.z) };
    if (!rotate) return scaled;
    // Rotating Z-up to Y-up maps (x, y, z) to (x, z, -y).
    return {
        x: scaled.x,
        y: scaled.z,
        z: scaled.y ? [-scaled.y[1], -scaled.y[0]] : null,
    };
}

function stripExtras(doc: Document): void {
    const root = doc.getRoot();
    root.setExtras({});
    const lists = [
        root.listScenes(),
        root.listNodes(),
        root.listMeshes(),
        root.listMaterials(),
        root.listTextures(),
        root.listSkins(),
        root.listAccessors(),
        root.listBuffers(),
    ];
    for (const list of lists) {
        for (const property of list) property.setExtras({});
    }
    for (const mesh of root.listMeshes()) {
        mesh.listPrimitives().forEach((p) => p.setExtras({}));
    }
}

async function downsizeTextures(
    doc: Document,
    cap: number,
    report: ModelImportReport,
): Promise<void> {
    const textures: Extract<FixRow, { code: "texturesDownsized" }>["textures"] =
        [];
    let sharp: unknown = null;
    for (const texture of doc.getRoot().listTextures()) {
        const size = texture.getSize();
        if (!size || Math.max(size[0], size[1]) <= cap) continue;
        sharp ??= (await import("sharp")).default;
        await compressTexture(texture, {
            encoder: sharp,
            resize: [cap, cap],
        });
        const after = texture.getSize() ?? size;
        textures.push({
            name: texture.getName() || texture.getURI() || "texture",
            from: [size[0], size[1]],
            to: [after[0], after[1]],
        });
    }
    if (textures.length) {
        report.fixedForYou.push({ code: "texturesDownsized", cap, textures });
    }
}

/**
 * The source materials as the review lists them (Q67), measured where the
 * scene draws them now. `outputIndex` is filled once the GLB is written.
 */
function materialRows({ scene, meta, raw }: Context): MaterialInfo[] {
    const extents = measureMaterials(scene, raw.materials);
    const fileSlot = new Map<number, string>();
    for (const slot of meta.slots) {
        if ("material" in slot.target) {
            if (!fileSlot.has(slot.target.material))
                fileSlot.set(slot.target.material, slot.id);
            continue;
        }
        for (const prim of raw.meshes[slot.target.mesh]?.listPrimitives() ??
            []) {
            const i = raw.materials.indexOf(prim.getMaterial()!);
            if (i >= 0 && !fileSlot.has(i)) fileSlot.set(i, slot.id);
        }
    }
    return raw.materials.map((material, index) => ({
        index,
        name: material.getName() || null,
        outputIndex: null,
        sizeM: extents[index].size,
        areaM2: extents[index].area,
        hasUVs: extents[index].hasUVs,
        fileSlot: fileSlot.get(index) ?? null,
    }));
}

function collectSlots(
    meta: OpenMarchMetadata,
    rawMaterials: Material[],
    rawMeshes: Mesh[],
    choices: ModelImportOptions["choices"] & object,
    doc: Document,
): { slots: ArtworkSlot[]; notes: NoteRow[] } {
    const notes: NoteRow[] = [];
    const slots: ArtworkSlot[] = [];
    const root = doc.getRoot();
    const materials = root.listMaterials();
    const meshes = root.listMeshes();
    const declared = [
        ...meta.slots,
        ...(choices.slots ?? []).map((s) => ({
            target: { material: s.material },
            id: s.id,
            widthM: s.widthM,
            heightM: s.heightM,
        })),
    ];
    const ids = new Set<string>();
    for (const slot of declared) {
        if (ids.has(slot.id)) continue;
        ids.add(slot.id);
        let target: ArtworkSlot["target"] | null = null;
        let hasUVs = false;
        if ("material" in slot.target) {
            const material = rawMaterials[slot.target.material];
            const index = material ? materials.indexOf(material) : -1;
            if (index >= 0) {
                target = { material: index };
                const prims = meshes
                    .flatMap((m) => m.listPrimitives())
                    .filter((p) => p.getMaterial() === material);
                hasUVs =
                    prims.length > 0 &&
                    prims.every((p) => p.getAttribute("TEXCOORD_0"));
            }
        } else {
            const mesh = rawMeshes[slot.target.mesh];
            const index = mesh ? meshes.indexOf(mesh) : -1;
            if (index >= 0) {
                target = { mesh: index };
                hasUVs = mesh
                    .listPrimitives()
                    .every((p) => p.getAttribute("TEXCOORD_0"));
            }
        }
        if (!target) {
            notes.push({ code: "slotDropped", slot: slot.id });
            continue;
        }
        if (!hasUVs) notes.push({ code: "slotWithoutUVs", slot: slot.id });
        slots.push({
            id: slot.id,
            widthM: slot.widthM,
            heightM: slot.heightM,
            target,
            hasUVs,
        });
    }
    return { slots, notes };
}

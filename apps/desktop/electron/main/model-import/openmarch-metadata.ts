/**
 * The OpenMarch convention, read from the raw glTF JSON (ADR 0002 D-13,
 * props-spec.md section 2 "Convention"):
 *
 * - `OM_*` empties: `OM_grip_R` (the instrument-frame origin, +Z along the
 *   pole or bell), `OM_grip_L`, and other attach points. Names use only
 *   `[A-Za-z0-9_]`.
 * - `extras.openmarch.artworkSlot {id, widthM, heightM}` on materials or
 *   meshes.
 * - Model-level `extras.openmarch`: `stretch {x, y, z}` (a 3D 9-slice, each
 *   axis `[a, b]` in meters or null), and the Starter kit stamps `itemId`,
 *   `kind` and `kitVersion`. Read from the default scene, its root nodes and
 *   `asset`, where Blender writes scene and object custom properties.
 * - Garment fits: `extras.openmarch.fit: "<body type>"` on a mesh node or its
 *   mesh (the node's wins); a mesh with no `fit` is the median fit (owner
 *   decision Q36, 2026-10-11). The Starter kit add-on writes exactly this
 *   tag. Body-type names are checked against `GARMENT_BODY_TYPES` in
 *   `garment.ts`, which rejects unknown ones.
 *
 * Pure: no gltf-transform, so the rules are easy to test on hand-written JSON.
 */
import type { RawGltf } from "./container";
import type { NoteRow, StretchZones } from "./types";
import { LicenseIdSchema } from "../library/types";

const OM_NAME = /^OM_[A-Za-z0-9_]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RawSlot {
    target: { material: number } | { mesh: number };
    id: string;
    widthM: number;
    heightM: number;
}

export interface OpenMarchMetadata {
    /** Validly named `OM_*` nodes, by raw node index. */
    omNodes: { index: number; name: string }[];
    /** Names that look like `OM_*` but break the naming rule. */
    misnamed: string[];
    stamp: {
        itemId: string | null;
        kind: string | null;
        kitVersion: string | number | null;
    };
    stretch: StretchZones | null;
    /** The Starter kit's export license (an SPDX id or `LicenseRef-*`), to pre-fill the review. */
    license: string | null;
    slots: RawSlot[];
    /** Declared fits by raw node index (from the node or its mesh). */
    fitsByNode: Map<number, string>;
    /** Any `OM_*` node or `extras.openmarch` at all. */
    hasOpenMarchData: boolean;
    /** Any `extras` beyond `openmarch`: custom properties the app ignores. */
    hasForeignExtras: boolean;
    notes: NoteRow[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
    !!v && typeof v === "object" && !Array.isArray(v);

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function openmarchOf(entry: unknown): Obj | null {
    if (!isObj(entry) || !isObj(entry.extras)) return null;
    const om = entry.extras.openmarch;
    return isObj(om) ? om : null;
}

export function readOpenMarchMetadata(json: RawGltf): OpenMarchMetadata {
    const notes: NoteRow[] = [];
    const { omNodes, misnamed } = readOmNodes(list(json.nodes));
    const { stamp, stretch, license } = readModelLevel(json, notes);
    const slots = readSlots(json, notes);
    const fitsByNode = readFits(json, notes);
    const { openmarch, foreign } = scanExtras(json);
    return {
        omNodes,
        misnamed,
        stamp,
        stretch,
        license,
        slots,
        fitsByNode,
        hasOpenMarchData: omNodes.length > 0 || openmarch,
        hasForeignExtras: foreign,
        notes,
    };
}

function readOmNodes(
    nodes: unknown[],
): Pick<OpenMarchMetadata, "omNodes" | "misnamed"> {
    const omNodes: OpenMarchMetadata["omNodes"] = [];
    const misnamed: string[] = [];
    nodes.forEach((node, index) => {
        const name = isObj(node) ? node.name : undefined;
        if (typeof name !== "string" || !/^OM[_.\-\s]/i.test(name)) return;
        if (OM_NAME.test(name)) omNodes.push({ index, name });
        else misnamed.push(name);
    });
    return { omNodes, misnamed };
}

/** Where model-level `extras.openmarch` may be: asset, scene, root nodes. */
function modelLevelSources(json: RawGltf): { where: string; om: Obj }[] {
    const nodes = list(json.nodes);
    const sceneIndex = typeof json.scene === "number" ? json.scene : 0;
    const scene = list(json.scenes)[sceneIndex];
    const sources: { where: string; om: Obj }[] = [];
    const add = (where: string, entry: unknown) => {
        const om = openmarchOf(entry);
        if (om) sources.push({ where, om });
    };
    add("asset", json.asset);
    add(`scenes/${sceneIndex}`, scene);
    for (const n of list(isObj(scene) ? scene.nodes : undefined)) {
        if (typeof n === "number") add(`nodes/${n}`, nodes[n]);
    }

    return sources;
}

/** Model-level data: from `asset`, the default scene and its root nodes. */
function readModelLevel(
    json: RawGltf,
    notes: NoteRow[],
): Pick<OpenMarchMetadata, "stamp" | "stretch" | "license"> {
    const sources = modelLevelSources(json);
    // The first source to set a key wins; a different value elsewhere is noted.
    const first = (key: string) => {
        let found: { where: string; value: unknown } | null = null;
        for (const { where, om } of sources) {
            if (!(key in om)) continue;
            if (!found) found = { where, value: om[key] };
            else if (JSON.stringify(found.value) !== JSON.stringify(om[key])) {
                notes.push({
                    code: "invalidOpenMarchData",
                    where,
                    reason: `conflicting ${key}; using ${found.where}`,
                });
            }
        }
        return found;
    };
    const read = <T>(
        key: string,
        accept: (v: unknown) => T | null,
        reason: string,
    ): T | null => {
        const found = first(key);
        if (!found) return null;
        const value = accept(found.value);
        if (value === null) {
            notes.push({
                code: "invalidOpenMarchData",
                where: found.where,
                reason,
            });
        }
        return value;
    };

    return {
        stamp: {
            itemId: read(
                "itemId",
                (v) =>
                    typeof v === "string" && UUID.test(v)
                        ? v.toLowerCase()
                        : null,
                "itemId is not a UUID",
            ),
            kind: read(
                "kind",
                (v) => (typeof v === "string" ? v : null),
                "kind is not a string",
            ),
            kitVersion: read(
                "kitVersion",
                (v) =>
                    typeof v === "string" ||
                    (typeof v === "number" && isFinite(v))
                        ? v
                        : null,
                "kitVersion is not a string or number",
            ),
        },
        stretch: read(
            "stretch",
            parseStretch,
            "stretch must be {x, y, z} of [a, b] with a < b, or null",
        ),
        license: read(
            "license",
            (v) =>
                LicenseIdSchema.safeParse(v).success ? (v as string) : null,
            "license is not an SPDX id or LicenseRef-*",
        ),
    };
}

/** Artwork slots on materials and meshes; malformed and duplicate ids dropped. */
function readSlots(json: RawGltf, notes: NoteRow[]): RawSlot[] {
    const slots: RawSlot[] = [];
    const seen = new Set<string>();
    const readSlot = (
        entry: unknown,
        target: RawSlot["target"],
        where: string,
    ) => {
        const om = openmarchOf(entry);
        if (!om || !("artworkSlot" in om)) return;
        const s = om.artworkSlot;
        if (
            !isObj(s) ||
            typeof s.id !== "string" ||
            s.id.length === 0 ||
            !isPositive(s.widthM) ||
            !isPositive(s.heightM)
        ) {
            notes.push({
                code: "invalidOpenMarchData",
                where,
                reason: "artworkSlot must be {id, widthM > 0, heightM > 0}",
            });
            return;
        }
        if (seen.has(s.id)) {
            notes.push({
                code: "invalidOpenMarchData",
                where,
                reason: `duplicate artworkSlot id ${s.id}`,
            });
            return;
        }
        seen.add(s.id);
        slots.push({ target, id: s.id, widthM: s.widthM, heightM: s.heightM });
    };
    list(json.materials).forEach((m, i) =>
        readSlot(m, { material: i }, `materials/${i}`),
    );
    list(json.meshes).forEach((m, i) =>
        readSlot(m, { mesh: i }, `meshes/${i}`),
    );
    return slots;
}

/**
 * Garment fits, by raw node index. A value that isn't a string is kept as its
 * JSON text, so the Garment check rejects it as an unknown body type.
 */
function readFits(json: RawGltf, notes: NoteRow[]): Map<number, string> {
    const meshes = list(json.meshes);
    const fitsByNode = new Map<number, string>();
    list(json.nodes).forEach((node, index) => {
        if (!isObj(node) || typeof node.mesh !== "number") return;
        const onNode = openmarchOf(node)?.fit;
        const onMesh = openmarchOf(meshes[node.mesh])?.fit;
        const fit = onNode ?? onMesh;
        if (fit === undefined) return;
        if (onNode !== undefined && onMesh !== undefined && onNode !== onMesh) {
            notes.push({
                code: "invalidOpenMarchData",
                where: `nodes/${index}`,
                reason: `fit ${JSON.stringify(onNode)} on the node overrides ${JSON.stringify(onMesh)} on its mesh`,
            });
        }
        fitsByNode.set(
            index,
            typeof fit === "string" ? fit : JSON.stringify(fit),
        );
    });
    return fitsByNode;
}

function isPositive(v: unknown): v is number {
    return typeof v === "number" && isFinite(v) && v > 0;
}

export function parseStretch(value: unknown): StretchZones | null {
    if (!isObj(value)) return null;
    const out: StretchZones = { x: null, y: null, z: null };
    for (const axis of ["x", "y", "z"] as const) {
        const zone = value[axis];
        if (zone === undefined || zone === null) continue;
        if (
            !Array.isArray(zone) ||
            zone.length !== 2 ||
            !zone.every((n) => typeof n === "number" && isFinite(n)) ||
            !((zone[0] as number) < (zone[1] as number))
        ) {
            return null;
        }
        out[axis] = [zone[0] as number, zone[1] as number];
    }
    return out;
}

/** Walks every `extras` in the document. */
function scanExtras(json: unknown): { openmarch: boolean; foreign: boolean } {
    let openmarch = false;
    let foreign = false;
    const visit = (v: unknown) => {
        if (Array.isArray(v)) {
            v.forEach(visit);
            return;
        }
        if (!isObj(v)) return;
        for (const [key, child] of Object.entries(v)) {
            if (key === "extras") {
                if (isObj(child)) {
                    for (const k of Object.keys(child)) {
                        if (k === "openmarch") openmarch = true;
                        else foreign = true;
                    }
                } else if (child !== undefined) {
                    foreign = true;
                }
            } else {
                visit(child);
            }
        }
    };
    visit(json);
    return { openmarch, foreign };
}

// cspell:words khronos meshopt
/**
 * Types of the model import pipeline (package C1.7; ADR 0002 D-13,
 * props-spec.md section 2 "Import pipeline"): what goes in, the import report
 * that comes out, and the OpenMarch sidecar stored beside the normalized GLB.
 *
 * Report rows carry a `code` and typed details, never English text: the review
 * (C1.10) words them, and the same rows are saved in the sidecar as Import
 * notes for later surfaces to word again.
 */
import { z } from "zod";
import type { ModelKind } from "@/view3d/core/sizes";
import { GARMENT_BODY_TYPES, MODEL_KINDS } from "./rules";

export type { ModelKind };

export type Vec3 = [number, number, number];
/** A unit quaternion, `[x, y, z, w]` as glTF stores it. */
export type Quat = [number, number, number, number];

// ------------------------------------------------------------------ input

/** A model file as the user picked it. */
export interface ModelFileInput {
    /** The picked file's name, such as `riser.glb`; its extension picks the parser. */
    filename: string;
    bytes: Uint8Array;
    /**
     * For a `.gltf`: the files it references by relative URI, keyed by that
     * URI exactly as written. `importModelFile` fills this from disk.
     */
    resources?: Readonly<Record<string, Uint8Array>>;
    /**
     * URIs that `importModelFile` found resolving outside the picked file's
     * folder on disk (through a symlink), and so never read.
     */
    refusedResources?: readonly string[];
}

/** A unit conversion the review can apply; `none` keeps the file's units. */
export type UnitChoice = "none" | "cm" | "in" | "ft";

/** A grip point chosen by hand, in the normalized model's meters. */
export interface GripChoice {
    right: Vec3;
    left?: Vec3 | null;
}

/** An artwork slot declared by hand when the file has no `extras`. */
export interface ManualSlotChoice {
    /** Index of the material in the source file's `materials`. */
    material: number;
    id: string;
    widthM: number;
    heightM: number;
}

/**
 * The review's answers. Anything left out takes the pre-selected value, so
 * running with `{}` gives the one-click result.
 */
export interface ModelImportChoices {
    unitConversion?: UnitChoice;
    rotateToYUp?: boolean;
    simplify?: boolean;
    /** `null` imports Equipment with no grip (holding falls back). */
    grip?: GripChoice | null;
    slots?: readonly ManualSlotChoice[];
}

export interface ModelImportOptions {
    /**
     * Set by a picker's Import… (it knows what it is importing for). Left out,
     * a plain Library import uses the Starter kit stamp, and with no stamp the
     * kind is a required choice and the result is `needs-kind`.
     */
    kind?: ModelKind;
    choices?: ModelImportChoices;
    /**
     * Called once as each stage starts, in pipeline order, for coarse
     * progress. A rejection stops after the stage that found it. Whatever the
     * callback throws (or an async one rejects with) is ignored.
     */
    onStage?: (stage: ModelImportStage) => void;
}

/**
 * The pipeline's coarse stages, in order: `reading` the file (and a
 * `.gltf`'s resources) and its container; `validating` with the extension
 * allow-list and the Khronos validator; `decoding` Draco and meshopt,
 * stripping and measuring; `checking` the kind's rules (rigs, Garments,
 * triangle caps) and planning the conversions; `converting`, then cleaning
 * up; `writing` the GLB and sidecar.
 */
export type ModelImportStage =
    | "reading"
    | "validating"
    | "decoding"
    | "checking"
    | "converting"
    | "writing";

// ------------------------------------------------------------------ report

/** Can't import: the one refusal (D-22), shown on the review screen. */
export type Rejection =
    | { code: "unreadable"; reason: string }
    | { code: "missingResource"; uri: string }
    | { code: "externalUri"; uri: string }
    /** A resource path that leaves the picked file's folder (`..`, absolute, symlink). */
    | { code: "resourceOutsideFolder"; uri: string }
    | {
          code: "validatorErrors";
          count: number;
          /** The first few, as the validator words them. */
          messages: { code: string; message: string; pointer?: string }[];
      }
    | { code: "requiredExtension"; extensions: string[] }
    | { code: "noGeometry" }
    | {
          code: "overTriangleCap";
          triangles: number;
          cap: number;
          limit: number;
      }
    /** A skin on anything but a Garment: other rigs are never given a bake. */
    | { code: "rigNotAllowed"; kind: ModelKind }
    | { code: "garmentNotRigged" }
    | {
          code: "garmentJointsNotV4";
          missing: string[];
          unexpected: string[];
      }
    | {
          code: "garmentRestPoseMismatch";
          /** The joints off the v4 rest pose, worst first. */
          joints: { name: string; translationM: number; rotation: number }[];
      }
    | { code: "garmentQuantized"; meshes: string[] }
    | { code: "garmentTransformsNotApplied"; nodes: string[] }
    | { code: "garmentNoPartPaint"; meshes: string[] }
    | { code: "garmentNoMedianFit"; fits: string[] }
    /**
     * A mesh's `extras.openmarch.fit` names no body type in
     * `GARMENT_BODY_TYPES` (a typo, or not a string). Not guessed: treating it
     * as the median could hide a second median fit.
     */
    | { code: "garmentUnknownFit"; meshes: { node: string; fit: string }[] };

/** Needs your choice: each pre-selected, so a one-click import applies it. */
export type ChoiceRow =
    | {
          code: "kind";
          options: readonly ModelKind[];
          /** Only ever from the Starter kit stamp; `null` means the user must pick. */
          preselected: ModelKind | null;
      }
    | {
          code: "unitConversion";
          /** The largest side as modeled, in the file's units read as meters. */
          largestM: number;
          options: UnitChoice[];
          preselected: UnitChoice;
          applied: UnitChoice;
      }
    | {
          code: "rotateToYUp";
          preselected: boolean;
          applied: boolean;
      }
    | {
          code: "simplify";
          triangles: number;
          cap: number;
          /** The count after simplifying, when it was applied. */
          simplifiedTriangles: number | null;
          preselected: boolean;
          applied: boolean;
      }
    | {
          code: "missingGrip";
          /** The fallback: a point on the longest side, +Z along it. */
          preselected: GripChoice;
          applied: GripChoice | null;
          /** Names like `OM_*` that break the naming rule, such as `OM_grip_R.001`. */
          misnamed: string[];
      };

/** Fixed for you: shown collapsed. */
export type FixRow =
    | {
          code: "texturesDownsized";
          cap: number;
          textures: {
              name: string;
              from: [number, number];
              to: [number, number];
          }[];
      }
    | { code: "dracoDecoded" }
    | { code: "meshoptDecoded" }
    | { code: "instancesExpanded" }
    | { code: "extensionsStripped"; extensions: string[] }
    | { code: "extrasStripped" }
    | {
          code: "contentStripped";
          animations: number;
          cameras: number;
          morphTargets: number;
          scenes: number;
      }
    | { code: "influencesRenormalized"; vertices: number };

/** Quiet notes (D-22): never a block. */
export type NoteRow =
    | { code: "validatorWarnings"; count: number }
    | { code: "sizeOutOfRange"; largestM: number; minM: number; maxM: number }
    | { code: "noStretchZones" }
    | { code: "customPropertiesOff" }
    | { code: "stillOverTriangleCap"; triangles: number; cap: number }
    | { code: "slotWithoutUVs"; slot: string }
    | { code: "slotDropped"; slot: string }
    | { code: "invalidOpenMarchData"; where: string; reason: string }
    | { code: "unknownStampKind"; value: string }
    | { code: "missingFits"; bodyTypes: string[] }
    /**
     * More than one mesh node has the same fit (untagged meshes count as the
     * median). Imported together as that fit; usually a forgotten tag.
     */
    | { code: "duplicateFits"; fits: { bodyType: string; nodes: string[] }[] }
    | { code: "wgi"; wgi: "equipmentUnderMinimum" | "floorOverMaximum" };

/** Lasting states, shown as badges on the Library item. */
export type ModelBadge = "scaled" | "simplified" | "noStretchZones";

export type ImportStatus =
    /** At least one Can't import row: no output. */
    | "rejected"
    /** The kind isn't known yet; kind-dependent checks haven't run. */
    | "needs-kind"
    | "ready";

export interface ModelMeasurements {
    /** Axis-aligned bounds in the normalized model's meters. */
    bounds: { min: Vec3; max: Vec3; size: Vec3 } | null;
    triangles: number;
    /** Per body-type fit, for Garments. */
    trianglesByFit: Record<string, number> | null;
    drawCalls: number;
    textures: {
        name: string;
        width: number;
        height: number;
        mimeType: string;
    }[];
    joints: string[];
    maxInfluences: number;
}

/**
 * A material of the source file (owner decision Q67, 2026-10-12): what the
 * review lists to pick an artwork surface on when the file marks no slots.
 * Hand-set slots name `index`; the preview finds the material through
 * `outputIndex`.
 */
export interface MaterialInfo {
    /** Index in the source file's `materials`: what `ManualSlotChoice.material` takes. */
    index: number;
    name: string | null;
    /**
     * Index in the normalized GLB; null with no output yet, or when the
     * output dropped it (nothing drew it).
     */
    outputIndex: number | null;
    /**
     * World bounding size of the geometry it's on, in output meters once
     * converted, else in the file's units read as meters; null when nothing
     * in the scene uses it.
     */
    sizeM: Vec3 | null;
    /** That geometry's surface area, in the same units squared. */
    areaM2: number;
    /** Every primitive using it has UV0, which artwork needs. */
    hasUVs: boolean;
    /** The slot the file already declares on it or its mesh, else null. */
    fileSlot: string | null;
}

export interface ModelImportReport {
    pipelineVersion: number;
    status: ImportStatus;
    kind: ModelKind | null;
    kindSource: "option" | "stamp" | null;
    cantImport: Rejection[];
    needsChoice: ChoiceRow[];
    fixedForYou: FixRow[];
    notes: NoteRow[];
    badges: ModelBadge[];
    /** Before conversion, as the file came in. */
    source: ModelMeasurements | null;
    /** The normalized output; `null` when rejected. */
    output: ModelMeasurements | null;
    /** The source file's materials, in source order; empty when unread. */
    materials: MaterialInfo[];
    metadata: {
        generator: string | null;
        /** glTF `asset.copyright`, to pre-fill the license fields. */
        copyright: string | null;
        /**
         * The Starter kit's export license from `extras.openmarch.license`, to
         * pre-fill the license field. Not kept in the sidecar.
         */
        license: string | null;
    };
}

// ------------------------------------------------------------------ sidecar

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const quat = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const AttachPointSchema = z.object({
    position: vec3,
    rotation: quat,
});
export type AttachPoint = z.infer<typeof AttachPointSchema>;

export const ArtworkSlotSchema = z.object({
    id: z.string().min(1),
    widthM: z.number().positive(),
    heightM: z.number().positive(),
    /** Where the slot is in the normalized GLB, by index. */
    target: z.union([
        z.object({ material: z.number().int().nonnegative() }),
        z.object({ mesh: z.number().int().nonnegative() }),
    ]),
    /** Whether the slot's geometry has UV0 to map the Artwork with. */
    hasUVs: z.boolean(),
});
export type ArtworkSlot = z.infer<typeof ArtworkSlotSchema>;

const zone = z.tuple([z.number(), z.number()]).nullable();
export const StretchZonesSchema = z.object({
    x: zone,
    y: zone,
    z: zone,
});
export type StretchZones = z.infer<typeof StretchZonesSchema>;

export const MODEL_SIDECAR_FORMAT = "openmarch/model-sidecar@1";

/**
 * The OpenMarch sidecar, stored as the Version part `sidecar` beside the
 * part `glb`. It holds everything parsed from names and `extras`, so the
 * renderer never parses either, plus the Import notes. No timestamps: the
 * same file and choices give the same bytes, hence the same Version.
 */
export const ModelSidecarSchema = z.object({
    format: z.literal(MODEL_SIDECAR_FORMAT),
    pipelineVersion: z.number().int().positive(),
    kind: z.enum(MODEL_KINDS),
    bounds: z.object({ min: vec3, max: vec3, size: vec3 }),
    triangles: z.number().int().nonnegative(),
    drawCalls: z.number().int().nonnegative(),
    grips: z.object({
        /** The instrument-frame origin, +Z along the pole or bell. */
        right: AttachPointSchema.nullable(),
        left: AttachPointSchema.nullable(),
    }),
    /** Other `OM_*` nodes, by name. */
    attachPoints: z.record(z.string(), AttachPointSchema),
    artworkSlots: z.array(ArtworkSlotSchema),
    stretch: StretchZonesSchema.nullable(),
    /** The Starter kit stamp, as read. */
    stamp: z.object({
        itemId: z.string().nullable(),
        kind: z.string().nullable(),
        kitVersion: z.union([z.string(), z.number()]).nullable(),
    }),
    garment: z
        .object({
            /**
             * Body types with a fit, in `GARMENT_BODY_TYPES` order; the median
             * is always present. Read from `extras.openmarch.fit` on each mesh
             * node or its mesh; an untagged mesh is the median fit.
             */
            fits: z.array(z.enum(GARMENT_BODY_TYPES)).min(1),
            /** Mesh indices in the normalized GLB per fit. */
            meshesByFit: z.partialRecord(
                z.enum(GARMENT_BODY_TYPES),
                z.array(z.number().int()),
            ),
        })
        .nullable(),
    /**
     * From the file's `asset`. The picked file's name is left out: the sidecar
     * is a hashed part, so the same model under another name must match.
     */
    metadata: z.object({
        generator: z.string().nullable(),
        copyright: z.string().nullable(),
    }),
    /** The report as applied: Import notes. */
    importNotes: z.object({
        needsChoice: z.array(z.json()),
        fixedForYou: z.array(z.json()),
        notes: z.array(z.json()),
        badges: z.array(z.string()),
    }),
});
export type ModelSidecar = z.infer<typeof ModelSidecarSchema>;

export interface ModelImportResult {
    report: ModelImportReport;
    /** Present only when the status is `ready`. */
    output: {
        glb: Uint8Array;
        sidecar: ModelSidecar;
        /** The sidecar as stored: canonical JSON, UTF-8. */
        sidecarBytes: Uint8Array;
    } | null;
}

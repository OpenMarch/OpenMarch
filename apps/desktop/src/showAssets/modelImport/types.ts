/**
 * What the model import takes and gives (fork #998). Plain data only: these cross `postMessage`
 * between the editor and the import worker, and the sidecar is stored as JSON.
 */
import type { JsonObject } from "@/showAssets/hash";
import type { PlanFromAbove } from "@/view3d/core/pit/planFromAbove";
import type { Tilt } from "./orientation";
import type { UNIT_FIXES } from "./rules";

/** One file the user picked: a `.glb`, or a `.gltf` and the files it names. */
export interface PickedFile {
    name: string;
    bytes: Uint8Array;
}

export type UnitFix = "none" | (typeof UNIT_FIXES)[number]["unit"];

/**
 * How detailed the stored model is (fork #1091): simplified to `TRIANGLE_CAP` (Light), to
 * `DETAILED_TRIANGLE_CAP` (Detailed), or as the file has it (Original)
 */
export type DetailLevel = "light" | "detailed" | "original";

/** A turn about the vertical axis, so the model's front faces the audience (+Z) */
export type Turn = 0 | 90 | 180 | 270;

/**
 * The user's answers on the review. Each one left out takes its pre-selected value, so the first
 * run (with none) shows what a one-click import would store.
 */
export interface ModelImportChoices {
    unitFix?: UnitFix;
    /** How the model is stood up, before the turn (`orientation.ts`) */
    tilt?: Tilt;
    turn?: Turn;
    detail?: DetailLevel;
}

export type Vec3 = [number, number, number];

/** Why a model can't be imported. Nothing is stored. */
export type Refusal =
    | { code: "noModelFile"; names: string[] }
    | { code: "severalModelFiles"; names: string[] }
    | { code: "tooLarge"; bytes: number; limit: number }
    | { code: "unreadable"; reason: string }
    /** A URI with a scheme (`http:`, `file:`, ...): the import fetches nothing */
    | { code: "externalUri"; uri: string }
    /** A path outside the picked files' folder (`../`, `/`, `C:`) */
    | { code: "outsidePickedFiles"; uri: string }
    /** A file the model names that wasn't picked */
    | { code: "missingFile"; uri: string }
    | { code: "requiredExtension"; extensions: string[] }
    | {
          code: "validatorErrors";
          count: number;
          messages: { code: string; message: string; pointer: string | null }[];
      }
    | {
          code: "imageTooLarge";
          image: string;
          width: number;
          height: number;
          limit: number;
      }
    | { code: "imageUnreadable"; image: string }
    | {
          code: "tooManyTriangles";
          triangles: number;
          cap: number;
          limit: number;
      }
    | { code: "rigged" }
    | { code: "noGeometry" }
    /** The editor ended the import after `IMPORT_TIMEOUT_MS` */
    | { code: "timedOut"; seconds: number }
    /** The worker failed outside the pipeline (out of memory, a bug) */
    | { code: "failed"; reason: string };

/** A conversion the review offers, pre-selected and never applied silently. */
export type Choice =
    | {
          code: "unitFix";
          /** The largest side before the fix, in meters as the file states them */
          largestM: number;
          options: UnitFix[];
          preselected: UnitFix;
          applied: UnitFix;
      }
    /**
     * How the model is stood up: always offered, since a file can lie on any side. Pre-selected
     * upright, or stood up from Z-up when the model stands tallest along Z (`zUpSuspected`).
     */
    | {
          code: "tilt";
          preselected: Tilt;
          applied: Tilt;
          zUpSuspected: boolean;
      }
    | { code: "turn"; preselected: Turn; applied: Turn }
    | {
          code: "detail";
          /** Triangles in the file */
          triangles: number;
          /** The levels offered, lightest first: Detailed only when the file has more than it */
          levels: DetailLevel[];
          preselected: DetailLevel;
          applied: DetailLevel;
          /** Triangles in the stored model */
          appliedTriangles: number;
          /** Triangles in the Light copy kept beside a heavier level, or null at Light */
          lightTriangles: number | null;
      };

/** Something the import changed on its own, shown collapsed on the review. */
export type Fix =
    | {
          code: "texturesShrunk";
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
    | { code: "extensionsDropped"; extensions: string[] }
    | {
          code: "contentDropped";
          animations: number;
          cameras: number;
          morphTargets: number;
          scenes: number;
      }
    /** The pivot moved to the bottom center of the footprint, by this much (m) */
    | { code: "pivotMoved"; offsetM: Vec3 };

/** A quiet note: nothing to choose, nothing blocked. */
export type Note =
    | { code: "validatorWarnings"; count: number }
    /** No unit fix brings the model into a prop's plausible size */
    | { code: "sizeOutOfRange"; largestM: number; minM: number; maxM: number }
    | { code: "overTriangleCap"; triangles: number; cap: number };

export interface ModelImportReport {
    cantImport: Refusal[];
    needsChoice: Choice[];
    fixedForYou: Fix[];
    notes: Note[];
}

/**
 * What the 2D field, the 3D View and the pickers read without the bytes (ADR 0010 amendment
 * 2026-11-15): `show_assets.sidecar`, inside the Version hash.
 *
 * The stored GLB is in meters, +Y up, with its origin on the ground at the middle of its
 * footprint and its front toward +Z, the built-in models' axes (`assets/pit/README.md`).
 */
export interface ModelSidecar {
    format: "openmarch-model/1";
    importVersion: number;
    /** Width (x), height (y) and depth (z) of the stored model */
    sizeM: { width: number; height: number; depth: number };
    /** Which way the front faces in the stored model, and the turn applied to get it there */
    facing: { front: "+z"; turnDeg: Turn };
    /** Seen from above, as the built-ins' `plan.json` (`pitPlan.ts`), in millimeters */
    plan: PlanFromAbove;
    /**
     * Where a performer standing on it would put their feet: the top surface over the middle of
     * the footprint, `[x, z]` and height in meters. Null when nothing is over the middle.
     */
    stand: { atM: [number, number]; topM: number } | null;
    triangles: number;
    distantTriangles: number;
    /**
     * The level chosen on the review (#1091). Missing when there was nothing to choose (a model
     * within the Light cap) and on models imported before it, which are within the cap too.
     */
    detail?: DetailLevel;
    /** Triangles in the `light` part, beside a heavier level */
    lightTriangles?: number;
    /** The review's report, kept so lasting states can show later (props-spec "Import notes") */
    importNotes: Omit<ModelImportReport, "cantImport">;
}

/**
 * Prefilled from the file (`KHR_xmp_json_ld`, then `asset.copyright`, then a Sketchfab-style
 * `asset.extras`), for the user to confirm: `show_assets.credits`, outside the Version hash.
 * Field names follow D-21; a field the file doesn't give is left out (empty means Unknown).
 */
export interface ModelCredits {
    /** An SPDX id, such as `CC-BY-4.0` */
    license?: string;
    author?: string;
    sourceUrl?: string;
    /** The file's own rights text, as written */
    attribution?: string;
}

/** A model ready for the store: `kind: "model"`, these parts, sidecar and credits. */
export interface ImportedModel {
    name: string;
    parts: {
        model: Uint8Array;
        distant: Uint8Array;
        thumbnail: Uint8Array;
        /** Beside a level heavier than Light: the Light copy, for devices that can't draw it */
        light?: Uint8Array;
    };
    sidecar: ModelSidecar;
    credits: ModelCredits;
}

export type ModelImportResult =
    | { ok: false; report: ModelImportReport }
    | { ok: true; report: ModelImportReport; model: ImportedModel };

/** The sidecar as the store takes it. */
export const sidecarJson = (sidecar: ModelSidecar): JsonObject =>
    sidecar as unknown as JsonObject;

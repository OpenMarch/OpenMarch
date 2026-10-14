// cspell:words meshopt
/**
 * The numbers and lists the model import pipeline enforces (ADR 0002 D-13,
 * D-15, D-16 and D-19; props-spec.md sections 2, 3 and 9). The caps are the
 * spec's numbers plus the owner's decisions of 2026-10-11 (Q37); the
 * integrated-GPU run (C4.7) may revise them.
 */
import type { BodyType } from "@/view3d/core/marchers/looks";
import type { ModelKind } from "@/view3d/core/sizes";

/** Bump when the normalized output changes for the same input and choices. */
export const MODEL_PIPELINE_VERSION = 1;

/** Every Model kind, in the order the review lists them. */
export const MODEL_KINDS = [
    "prop",
    "equipment",
    "garment",
    "floorProp",
    "baseFloor",
] as const satisfies readonly ModelKind[];

/**
 * Triangles per kind (D-16). Garments are counted per body-type fit. A Floor
 * prop is a flat Prop, so it takes the Base floor's 5k (owner decision Q37,
 * 2026-10-11).
 */
export const TRIANGLE_CAPS: Readonly<Record<ModelKind, number>> = {
    equipment: 2_000,
    garment: 3_000,
    prop: 20_000,
    floorProp: 5_000,
    baseFloor: 5_000,
};

/** Over this multiple of the cap a model is rejected; the only hard limit (D-19). */
export const TRIANGLE_REJECT_FACTOR = 4;

/**
 * Longest texture edge per kind, in pixels (D-19 display sizes): Equipment
 * textures and prop Artwork slots 1024, Base floor and Floor props 2048.
 * Garments are painted by `_PART`, so their (rare) textures take the 1024 of
 * the other held and worn kinds (owner decision Q37, 2026-10-11).
 */
export const TEXTURE_CAPS: Readonly<Record<ModelKind, number>> = {
    equipment: 1024,
    garment: 1024,
    prop: 1024,
    floorProp: 2048,
    baseFloor: 2048,
};

/**
 * Extensions a file may list in `extensionsRequired`. Anything else is
 * rejected by name: r186 `GLTFLoader` only warns about an unknown required
 * extension, so the importer enforces the spec's "SHOULD NOT be loaded".
 * Draco, meshopt and GPU instancing are accepted here because they are
 * decoded or expanded away at import (D-15).
 */
export const ALLOWED_REQUIRED_EXTENSIONS: ReadonlySet<string> = new Set([
    "KHR_draco_mesh_compression",
    "EXT_meshopt_compression",
    "EXT_mesh_gpu_instancing",
    "KHR_mesh_quantization",
    "KHR_texture_transform",
    "KHR_materials_unlit",
    "KHR_materials_emissive_strength",
    "EXT_texture_webp",
]);

/**
 * Extensions the normalized GLB may still use: each loads in bare
 * `GLTFLoader` with no decoder. Everything else is stripped with a note.
 */
export const OUTPUT_EXTENSIONS: ReadonlySet<string> = new Set([
    "KHR_mesh_quantization",
    "KHR_texture_transform",
    "KHR_materials_unlit",
    "KHR_materials_emissive_strength",
    "EXT_texture_webp",
]);

/**
 * A rigged Garment's inverse bind matrices must match the v4 rest pose within
 * these tolerances (research `gltf-import` section 4: about 1 mm and 0.1°).
 */
export const REST_POSE_TOLERANCE = {
    /** Meters, on the translation column. */
    translationM: 0.001,
    /** Per element of the 3 × 3 rotation part; 0.1° ≈ 0.00175 rad. */
    rotation: 0.002,
} as const;

/** Most joint influences per vertex the shared bake reads (one vec4). */
export const MAX_INFLUENCES = 4;

/**
 * om-pose's seven body types. The same list as `BODY_TYPES` in
 * `core/marchers/looks.ts` (a test keeps them equal); repeated here so main
 * doesn't import the renderer's look code.
 */
export const GARMENT_BODY_TYPES = [
    "neutral-slim",
    "neutral-average",
    "neutral-athletic",
    "neutral-broad",
    "neutral-full",
    "feminine-average",
    "masculine-average",
] as const satisfies readonly BodyType[];

/** The fit every Garment must have (ticket 09: neutral-average). */
export const MEDIAN_BODY_TYPE: BodyType = "neutral-average";

/**
 * A Prop is "flat" (a sheet or a tarp) when its thinnest side is under this
 * fraction of its longest. Flat Props don't get "rotate to Y-up" pre-checked.
 */
export const FLAT_RATIO = 0.05;

/**
 * Z-up is suspected when the Z extent is strictly the largest and exceeds the
 * Y extent by this factor (or, for flat kinds, when the thinnest side is Z
 * rather than Y; floors get the rotation offered but unchecked). Owner
 * decision Q37, 2026-10-11.
 */
export const Z_UP_FACTOR = 1.25;

/** The simplifier's error budget, as a fraction of the mesh radius. */
export const SIMPLIFY_ERROR = 0.05;

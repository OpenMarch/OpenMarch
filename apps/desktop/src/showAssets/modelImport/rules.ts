// cspell:words meshopt basisu
/**
 * The numbers and lists the model import enforces (ADR 0010 amendment 2026-11-15, fork #998;
 * docs/3d/props-spec.md sections 2, 3 and 9). The caps are provisional until the integrated-GPU
 * run, like the spec's.
 */

/** The `show_assets.kind` of an imported prop model */
export const MODEL_ASSET_KIND = "model";

/** Bump when the stored output changes for the same input and choices. */
export const MODEL_IMPORT_VERSION = 1;

/** Triangles a prop model may have before it is simplified (props-spec section 3) */
export const TRIANGLE_CAP = 20_000;

/** Past this multiple of the cap a model is refused: the one hard limit (D-19) */
export const TRIANGLE_REFUSE_FACTOR = 4;

/** Longest texture edge of a prop model, in pixels (D-19: prop textures 1024) */
export const TEXTURE_CAP = 1024;

/** The distant version, drawn beyond about 30 m: at most this many triangles… */
export const DISTANT_TRIANGLE_CAP = 2_000;
/** …and at most this share of the detailed model's */
export const DISTANT_TRIANGLE_RATIO = 0.25;
/** …unless it has fewer than this many, when it keeps them all */
export const DISTANT_SIMPLIFY_FROM = 1_000;
/** …with textures at most this long on an edge */
export const DISTANT_TEXTURE_CAP = 256;

/**
 * Checked before anything is decoded (props-spec section 2 "Size limits"): the picked files
 * together, and each image's size as its header gives it. An 8192 × 8192 texture is the largest
 * that decodes (about 270 MB of pixels while it is shrunk); anything larger is refused.
 */
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 8192;
export const MAX_IMAGE_PIXELS = 8192 * 8192;

/** The editor ends an import that runs longer than this (D-13) and starts a fresh worker. */
export const IMPORT_TIMEOUT_MS = 120_000;

/**
 * Extensions a file may list in `extensionsRequired`. Anything else is refused by name: three's
 * `GLTFLoader` only warns about an unknown required extension. Draco, meshopt and GPU instancing
 * are decoded or expanded away here, so the stored GLB needs none of them.
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
 * Extensions the stored GLB may still use: each loads in bare `GLTFLoader` with no decoder.
 * Everything else is dropped, with a note.
 */
export const OUTPUT_EXTENSIONS: ReadonlySet<string> = new Set([
    "KHR_mesh_quantization",
    "KHR_texture_transform",
    "KHR_materials_unlit",
    "KHR_materials_emissive_strength",
    "EXT_texture_webp",
]);

/** Image types the import can shrink. KTX2 (`KHR_texture_basisu`) is refused when required. */
export const IMAGE_TYPES: ReadonlySet<string> = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
]);

/**
 * A plausible prop, by its largest side, in meters: a small box to a stage set (the parked
 * Library's range for props).
 */
export const PLAUSIBLE_SIZE_M = { min: 0.1, max: 20 } as const;

/** The unit fixes offered when a model's size is clearly off, in the spec's order */
export const UNIT_FIXES = [
    { unit: "cm", factor: 0.01 },
    { unit: "in", factor: 0.0254 },
    { unit: "ft", factor: 0.3048 },
] as const;

/**
 * Z-up is suspected when Z is strictly the largest side and more than this times Y (owner
 * decision Q37, 2026-10-11). A flat model (a sign, a tarp) gets no guess either way.
 */
export const Z_UP_FACTOR = 1.25;

/** A model is flat when its thinnest side is under this share of its longest. */
export const FLAT_RATIO = 0.05;

/**
 * The import and Library IPC contract (package C1.9; ADR 0002 D-13, design
 * in docs/3d/proposals/C1.9-import-ipc.md).
 *
 * The editor asks main to pick files, run the import pipelines and read and
 * write the local Library. Rules carried from D-4: every channel name is
 * hard-coded in the editor's preload; main checks that the sender is the
 * editor and parses every payload with the zod schemas below before acting;
 * the editor is the only caller. The 3D View's preload exposes none of this.
 *
 * Types and schemas only, no Electron imports: main, the editor's preload
 * (type-only) and the renderer client all import this file. Report types are
 * re-exported from the pipelines, not copied.
 */
// cspell:words gltf
import { z } from "zod";
import { ARTWORK_SURFACES, type ArtworkSurface } from "@/view3d/core/sizes";
import type { ModelKind } from "@/view3d/core/sizes";
import {
    DerivedFromSchema,
    LibraryItemIdSchema,
    LicenseIdSchema,
    PartRoleSchema,
    VersionHashSchema,
    type DerivedFrom,
    type LibraryItem,
    type LibraryItemKind,
    type LibraryItemSummary,
    type SizePreset,
} from "../../../electron/main/library/types";
import type { AddVersionOutcome } from "../../../electron/main/library/store";
import type {
    MaterialInfo,
    ModelImportChoices,
    ModelImportReport,
    ModelImportStage,
    ModelSidecar,
} from "../../../electron/main/model-import/types";
import type {
    ArtworkImportReport,
    ArtworkInspection,
    ArtworkSizeChoice,
    ArtworkSizeInput,
    AspectGroup,
} from "../../../electron/main/artwork-import/pipeline";

export type {
    ArtworkImportReport,
    ArtworkInspection,
    ArtworkSizeChoice,
    ArtworkSizeInput,
    ArtworkSurface,
    AspectGroup,
    DerivedFrom,
    LibraryItem,
    LibraryItemKind,
    LibraryItemSummary,
    MaterialInfo,
    ModelImportChoices,
    ModelImportReport,
    ModelKind,
    ModelSidecar,
    SizePreset,
};

// ------------------------------------------------------------------ channels

/** Editor → main, `ipcRenderer.invoke`. Each answers a `Result<T>`. */
export const LIBRARY_INVOKE_CHANNELS = {
    importPick: "library:import-pick",
    importInspect: "library:import-inspect",
    importPreview: "library:import-preview",
    importCommit: "library:import-commit",
    importCancel: "library:import-cancel",
    list: "library:list",
    get: "library:get",
    readParts: "library:read-parts",
    thumbnails: "library:thumbnails",
    updateItem: "library:update-item",
    deleteItem: "library:delete-item",
    addFromShow: "library:add-from-show",
    sizePresets: "library:size-presets",
    sizePresetSave: "library:size-preset-save",
    sizePresetDelete: "library:size-preset-delete",
    templateSave: "library:template-save",
} as const;
export type LibraryInvokeChannel =
    (typeof LIBRARY_INVOKE_CHANNELS)[keyof typeof LIBRARY_INVOKE_CHANNELS];

/** Editor → main, `ipcRenderer.send`: frees a session's bytes. */
export const LIBRARY_IMPORT_CLOSE_CHANNEL = "library:import-close";
/** Main → editor push: `ImportProgress`. */
export const LIBRARY_IMPORT_PROGRESS_CHANNEL = "library:import-progress";
/** Main → editor push: `LibraryChanged`, after every Library write. */
export const LIBRARY_CHANGED_CHANNEL = "library:changed";

/** Every channel, for the preload test: 16 invoke, 1 send, 2 push. */
export const LIBRARY_CHANNELS: readonly string[] = [
    ...Object.values(LIBRARY_INVOKE_CHANNELS),
    LIBRARY_IMPORT_CLOSE_CHANNEL,
    LIBRARY_IMPORT_PROGRESS_CHANNEL,
    LIBRARY_CHANGED_CHANNEL,
];

// ------------------------------------------------------------------ limits

const MB = 1024 * 1024;

/** Size limits (owner decision Q48, 2026-10-12). */
export const LIBRARY_LIMITS = {
    /** A model file plus its `.gltf` resources. */
    modelBytes: 200 * MB,
    /** One artwork file (plus the pipeline's 1.5-gigapixel limit). */
    artworkBytes: 300 * MB,
    filesPerPick: 50,
    /** Bytes the renderer sends in one call (`add-from-show`). */
    rendererPayloadBytes: 64 * MB,
    /** A thumbnail the review captures and sends with a model commit. */
    thumbnailBytes: 1 * MB,
    /** Items per `library:thumbnails` call. */
    thumbnailsPerCall: 50,
    nameLength: 200,
    tagLength: 64,
    tags: 32,
    licenseTextLength: 4096,
    /** Idle time after which main drops an import session. */
    sessionIdleMs: 30 * 60 * 1000,
} as const;

// ------------------------------------------------------------------ results

export type LibraryIpcErrorCode =
    | "invalid-request"
    /** A pick mixing models and artwork, or holding two models (Q52, Q59). */
    | "mixed-selection"
    | "session-expired"
    | "unknown-file"
    | "too-large"
    | "unreadable"
    | "busy"
    | "cancelled"
    | "timeout"
    | "worker-crashed"
    | "pdf-unavailable"
    | "not-found"
    | "read-only"
    | "kind-mismatch"
    | "hash-mismatch"
    | "corrupt"
    | "write-failed";

export interface LibraryIpcError {
    code: LibraryIpcErrorCode;
    /** Log text, not UI copy: never an absolute path. */
    message: string;
}

/**
 * Every invoke answers this; handlers never throw across IPC. Pipeline
 * rejections are report rows inside `value`, never errors (D-22).
 */
export type Result<T> =
    | { ok: true; value: T }
    | { ok: false; error: LibraryIpcError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (
    code: LibraryIpcErrorCode,
    message: string,
): { ok: false; error: LibraryIpcError } => ({
    ok: false,
    error: { code, message },
});

export interface BytesPayload {
    mimeType: string;
    bytes: Uint8Array;
}

// ------------------------------------------------------------------ shared schemas

/** Every Model kind, in review order; kept equal to the pipeline's `MODEL_KINDS` by a test. */
export const MODEL_KIND_VALUES = [
    "prop",
    "equipment",
    "garment",
    "floorProp",
    "baseFloor",
] as const satisfies readonly ModelKind[];

const IdSchema = LibraryItemIdSchema;
const finitePositive = z.number().finite().positive();
const vec3 = z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
]);

const LengthSchema = z.strictObject({
    m: finitePositive,
    typed: z.string().min(1).max(64).optional(),
});

export const ArtworkSizeChoiceSchema = z.strictObject({
    width: LengthSchema,
    height: LengthSchema,
    source: z.enum(["template", "slot", "user"]),
    templateId: z.string().max(128).nullable().optional(),
});

export const ArtworkSizeInputSchema = z.union([
    ArtworkSizeChoiceSchema,
    z.literal("file"),
]);

export const ModelKindSchema = z.enum(MODEL_KIND_VALUES);
export const ArtworkSurfaceSchema = z.enum(ARTWORK_SURFACES);

export const ModelImportChoicesSchema = z.strictObject({
    unitConversion: z.enum(["none", "cm", "in", "ft"]).optional(),
    rotateToYUp: z.boolean().optional(),
    simplify: z.boolean().optional(),
    grip: z
        .strictObject({ right: vec3, left: vec3.nullable().optional() })
        .nullable()
        .optional(),
    slots: z
        .array(
            z.strictObject({
                material: z.number().int().nonnegative(),
                id: z.string().regex(/^[A-Za-z0-9_]{1,64}$/),
                widthM: finitePositive,
                heightM: finitePositive,
            }),
        )
        .max(64)
        .readonly()
        .optional(),
});

const nameSchema = z.string().trim().min(1).max(LIBRARY_LIMITS.nameLength);
const tagsSchema = z
    .array(z.string().trim().min(1).max(LIBRARY_LIMITS.tagLength))
    .max(LIBRARY_LIMITS.tags);
const shortText = z.string().max(LIBRARY_LIMITS.nameLength).nullable();

export const LicenseInputSchema = z.strictObject({
    license: LicenseIdSchema.optional(),
    licenseText: z
        .string()
        .max(LIBRARY_LIMITS.licenseTextLength)
        .nullable()
        .optional(),
    author: shortText.optional(),
    sourceUrl: z.string().max(2048).nullable().optional(),
    attribution: z
        .string()
        .max(LIBRARY_LIMITS.licenseTextLength)
        .nullable()
        .optional(),
});

export const CommitMetaSchema = z.strictObject({
    name: nameSchema,
    tags: tagsSchema.optional(),
    license: LicenseInputSchema.optional(),
    itemId: IdSchema.optional(),
});

/** Bytes from the renderer, capped. */
const bytesSchema = (max: number) =>
    z
        .instanceof(Uint8Array)
        .refine((b) => b.byteLength <= max, `at most ${max} bytes`);

// ------------------------------------------------------------------ pick

export type PickPurpose = "any" | "model" | "artwork";

export const PickContextSchema = z.strictObject({
    /** Equipment / Prop picker. */
    kind: ModelKindSchema.optional(),
    /** Artwork slot picker. */
    surface: ArtworkSurfaceSchema.optional(),
    /** The slot's size: the picker pre-fills kind, slot and size. */
    size: ArtworkSizeChoiceSchema.optional(),
});
export type PickContext = z.infer<typeof PickContextSchema>;

export const ImportPickRequestSchema = z.strictObject({
    purpose: z.enum(["any", "model", "artwork"]),
    context: PickContextSchema.optional(),
});
export type ImportPickRequest = z.infer<typeof ImportPickRequestSchema>;

export type ImportFileType = "model" | "artwork" | "unsupported";

export interface ImportFileRef {
    /** Random and session-scoped; never a path. */
    fileId: string;
    /** Basename only. */
    filename: string;
    sizeBytes: number;
    /** Sniffed from the bytes, not the extension. */
    type: ImportFileType;
    /** Over the size limit: shown as Can't import. */
    tooLarge: boolean;
}

export interface ImportSession {
    sessionId: string;
    files: ImportFileRef[];
    context: PickContext | null;
}

// ------------------------------------------------------------------ inspect

export const ImportInspectRequestSchema = z.discriminatedUnion("type", [
    z.strictObject({
        sessionId: IdSchema,
        fileId: IdSchema,
        type: z.literal("model"),
        kind: ModelKindSchema.optional(),
        choices: ModelImportChoicesSchema,
    }),
    /** Every artwork file in the session at once. */
    z.strictObject({ sessionId: IdSchema, type: z.literal("artwork") }),
]);
export type ImportInspectRequest = z.infer<typeof ImportInspectRequestSchema>;

/** Drives "New version of …" / Update or Add as new. */
export interface LibraryMatch {
    itemId: string;
    name: string;
    builtIn: boolean;
    reason: "kit-item-id" | "filename";
}

export type ImportInspection =
    | {
          type: "model";
          fileId: string;
          /**
           * Main numbers each inspect of a file; the editor ignores any reply
           * older than its latest.
           */
          requestSeq: number;
          report: ModelImportReport;
          sidecar: ModelSidecar | null;
          /** `import-preview` can serve this result's GLB. */
          previewReady: boolean;
          matches: LibraryMatch[];
      }
    | {
          type: "artwork";
          files: {
              fileId: string;
              inspection: ArtworkInspection;
              matches: LibraryMatch[];
          }[];
          /** `members[].file` indexes into `files`. */
          aspectGroups: AspectGroup[];
      };

// ------------------------------------------------------------------ preview

export const ImportPreviewRequestSchema = z.discriminatedUnion("type", [
    /** The normalized GLB of the last inspect. */
    z.strictObject({
        sessionId: IdSchema,
        fileId: IdSchema,
        type: z.literal("model"),
    }),
    z.strictObject({
        sessionId: IdSchema,
        fileId: IdSchema,
        type: z.literal("artwork"),
        page: z.number().int().nonnegative().max(9999),
        maxPx: z.union([z.literal(256), z.literal(1024)]),
    }),
]);
export type ImportPreviewRequest = z.infer<typeof ImportPreviewRequestSchema>;

// ------------------------------------------------------------------ commit

export const ImportCommitRequestSchema = z.discriminatedUnion("type", [
    z.strictObject({
        sessionId: IdSchema,
        fileId: IdSchema,
        type: z.literal("model"),
        kind: ModelKindSchema,
        choices: ModelImportChoicesSchema,
        meta: CommitMetaSchema,
        /** A PNG the review captured from its canvas (Q50); re-encoded by main. */
        thumbnail: bytesSchema(LIBRARY_LIMITS.thumbnailBytes).optional(),
    }),
    z.strictObject({
        sessionId: IdSchema,
        type: z.literal("artwork"),
        files: z
            .array(
                z.strictObject({
                    fileId: IdSchema,
                    surface: ArtworkSurfaceSchema,
                    pages: z
                        .array(z.number().int().nonnegative().max(9999))
                        .max(10000)
                        .optional(),
                    size: ArtworkSizeInputSchema.optional(),
                    pageSizes: z
                        .record(
                            z.string().regex(/^\d{1,4}$/),
                            ArtworkSizeInputSchema,
                        )
                        .optional(),
                    meta: CommitMetaSchema,
                }),
            )
            .min(1)
            .max(LIBRARY_LIMITS.filesPerPick),
    }),
]);
export type ImportCommitRequest = z.infer<typeof ImportCommitRequestSchema>;

export interface AddVersionResultDto {
    outcome: AddVersionOutcome;
    item: LibraryItem;
    versionHash: string;
}

export type ImportCommitResult =
    /** `saved` is null when the report isn't `ready`: nothing was stored. */
    | {
          type: "model";
          report: ModelImportReport;
          saved: AddVersionResultDto | null;
      }
    | { type: "artwork"; reports: ArtworkImportReport[] };

export const ImportCancelRequestSchema = z.strictObject({
    sessionId: IdSchema,
    fileId: IdSchema.optional(),
});

export const ImportCloseRequestSchema = z.strictObject({ sessionId: IdSchema });

// ------------------------------------------------------------------ progress

/**
 * Coarse stages: the model pipeline's own (`ModelImportStage`, from
 * `reading` to `writing`), plus `rendering-pdf` and `converting` for
 * artwork, and `saving` into the Library.
 */
export type ImportStage = ModelImportStage | "rendering-pdf" | "saving";

export interface ImportProgress {
    sessionId: string;
    fileId: string | null;
    stage: ImportStage;
    /** null = indeterminate. Filled only where it's real (pages, files). */
    fraction: number | null;
    page?: { index: number; count: number };
}

// ------------------------------------------------------------------ Library reads and writes

/** The parts rendering reads: never an Artwork's `original` (D-12). */
export const RENDER_ROLES = ["glb", "sidecar", "display"] as const;
export type RenderRole = (typeof RENDER_ROLES)[number];

/**
 * The parts `library:read-parts` serves. `original` is read only to embed an Artwork in the
 * show, which keeps it (D-12). A Version's `source` is never served.
 */
export const READABLE_ROLES = [...RENDER_ROLES, "original"] as const;
export type ReadableRole = (typeof READABLE_ROLES)[number];

export const LibraryListRequestSchema = z.strictObject({
    kind: z.enum(["model", "artwork", "uniform"]).optional(),
});
export const LibraryItemRequestSchema = z.strictObject({ itemId: IdSchema });

export const ReadPartsRequestSchema = z.strictObject({
    itemId: IdSchema,
    versionHash: VersionHashSchema,
    roles: z.array(z.enum(READABLE_ROLES)).min(1).max(READABLE_ROLES.length),
});
export type ReadPartsRequest = z.infer<typeof ReadPartsRequestSchema>;

export const ThumbnailsRequestSchema = z.strictObject({
    items: z
        .array(
            z.strictObject({
                itemId: IdSchema,
                versionHash: VersionHashSchema,
            }),
        )
        .max(LIBRARY_LIMITS.thumbnailsPerCall),
    maxPx: z.union([z.literal(128), z.literal(256)]),
});
export type ThumbnailsRequest = z.infer<typeof ThumbnailsRequestSchema>;

export const UpdateItemRequestSchema = z.strictObject({
    itemId: IdSchema,
    patch: z.strictObject({
        name: nameSchema.optional(),
        tags: tagsSchema.optional(),
        license: LicenseInputSchema.extend({
            modified: z.boolean().optional(),
        }).optional(),
    }),
});
export type UpdateItemRequest = z.infer<typeof UpdateItemRequestSchema>;

export const AddFromShowRequestSchema = z
    .strictObject({
        itemId: IdSchema,
        kind: z.enum(["model", "artwork", "uniform"]),
        name: nameSchema,
        tags: tagsSchema,
        /** Main recomputes it from `parts` and refuses a mismatch. */
        versionHash: VersionHashSchema,
        parts: z
            .record(
                PartRoleSchema,
                bytesSchema(LIBRARY_LIMITS.rendererPayloadBytes),
            )
            .refine((parts) => Object.keys(parts).length > 0, "no parts"),
        license: LicenseInputSchema,
        derivedFrom: DerivedFromSchema.nullable(),
    })
    .refine(
        (r) =>
            Object.values(r.parts).reduce((n, b) => n + b.byteLength, 0) <=
            LIBRARY_LIMITS.rendererPayloadBytes,
        "parts over the per-call limit",
    );
export type AddFromShowRequest = z.infer<typeof AddFromShowRequestSchema>;

export const SizePresetSaveRequestSchema = z.strictObject({
    id: IdSchema.optional(),
    name: nameSchema,
    data: z
        .json()
        .refine((d) => JSON.stringify(d).length <= 64 * 1024, "data too large"),
});
export const SizePresetDeleteRequestSchema = z.strictObject({ id: IdSchema });

/** Pushed after every Library write. */
export interface LibraryChanged {
    itemIds: string[] | "all";
}

// ------------------------------------------------------------------ templates

export const TEMPLATE_FORMATS = ["svg", "pdf", "png"] as const;
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number];

export const TemplateSaveRequestSchema = z.strictObject({
    surfaceId: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/),
    format: z.enum(TEMPLATE_FORMATS),
});
export type TemplateSaveRequest = z.infer<typeof TemplateSaveRequestSchema>;

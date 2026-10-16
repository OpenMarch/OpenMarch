/**
 * Records of the local Library (ADR 0002 D-12, props-spec.md section 2).
 *
 * The on-disk layout under `userData/library/` is:
 *
 * - `blobs/sha256/<first two hex>/<hash>`: immutable, content-addressed bytes.
 * - `items/<item id>.json`: one manifest per Library item, listing its
 *   Versions. These are the records a future cloud would sync.
 * - `index.json`: a cache rebuilt from the manifests alone.
 * - `size-presets.json`: personal size presets beside the built-in catalog.
 *
 * Main process only. Nothing here is exposed over IPC (package C1.9).
 */
import { z } from "zod";

export const LIBRARY_SCHEMA_VERSION = 1;

/** The kinds of Library item (`CONTEXT.md`). */
export const LIBRARY_ITEM_KINDS = ["model", "artwork", "uniform"] as const;
export type LibraryItemKind = (typeof LIBRARY_ITEM_KINDS)[number];

export const LICENSE_UNKNOWN = "LicenseRef-Unknown";
export const LICENSE_PROPRIETARY = "LicenseRef-Proprietary";

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "expected a sha256 hex");
const uuid = z
    .string()
    .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        "expected a lowercase UUID",
    );
/** An SPDX license id, or a `LicenseRef-` id. Not a compound expression. */
const licenseId = z
    .string()
    .regex(
        /^(LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9][A-Za-z0-9.+-]*)$/,
        "expected an SPDX license id or LicenseRef-*",
    );
/** Part roles name a Version's stored files, such as `glb` or `sidecar`. */
const partRole = z.string().regex(/^[a-z][A-Za-z0-9_-]{0,63}$/);
const isoTime = z.string().min(1);

export const LibraryItemIdSchema = uuid;
export const VersionHashSchema = sha256Hex;
export const LicenseIdSchema = licenseId;
export const PartRoleSchema = partRole;

/**
 * License metadata (props-spec.md section 10). Lives outside the Version
 * hash, so a correction is a metadata-only change.
 */
export const LicenseFieldsSchema = z.object({
    /** SPDX id, else `LicenseRef-Proprietary` or `LicenseRef-Unknown`. */
    license: licenseId,
    /** Free text that goes with the license, such as terms for a LicenseRef. */
    licenseText: z.string().nullable(),
    author: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    attribution: z.string().nullable(),
    /** Set on every `derivedFrom` copy and can't be cleared there. */
    modified: z.boolean(),
});
export type LicenseFields = z.infer<typeof LicenseFieldsSchema>;

export const DerivedFromSchema = z.object({
    itemId: uuid,
    version: sha256Hex,
});
export type DerivedFrom = z.infer<typeof DerivedFromSchema>;

/**
 * One Version: the blobs it is made of. Its hash covers `parts` only (see
 * `computeVersionHash`); `source` stays outside the hash.
 */
export const LibraryVersionSchema = z.object({
    hash: sha256Hex,
    createdAt: isoTime,
    /** Role to blob hash, such as `{ glb, sidecar }` or `{ original, display }`. */
    parts: z.record(partRole, sha256Hex),
    /**
     * The original source file as imported, kept in the local Library only so
     * a later pipeline can re-normalize it. Never part of the Version hash.
     */
    source: z
        .object({
            blob: sha256Hex,
            filename: z.string().min(1),
        })
        .nullable(),
});
export type LibraryVersion = z.infer<typeof LibraryVersionSchema>;

export const LibraryItemManifestSchema = z
    .object({
        schemaVersion: z.literal(LIBRARY_SCHEMA_VERSION),
        id: uuid,
        kind: z.enum(LIBRARY_ITEM_KINDS),
        name: z.string(),
        tags: z.array(z.string()),
        createdAt: isoTime,
        updatedAt: isoTime,
        originalFilename: z.string().nullable(),
        derivedFrom: DerivedFromSchema.nullable(),
        /** Oldest first; never empty. */
        versions: z.array(LibraryVersionSchema).min(1),
    })
    .extend(LicenseFieldsSchema.shape);
export type LibraryItemManifest = z.infer<typeof LibraryItemManifestSchema>;

/** A manifest as the store hands it out. */
export type LibraryItem = LibraryItemManifest & {
    /** Built-ins ship with the app, are read-only and have fixed UUIDs. */
    readonly builtIn: boolean;
};

export const LibraryIndexEntrySchema = z.object({
    id: uuid,
    kind: z.enum(LIBRARY_ITEM_KINDS),
    name: z.string(),
    tags: z.array(z.string()),
    updatedAt: isoTime,
    license: licenseId,
    versions: z.array(sha256Hex).min(1),
});
export type LibraryIndexEntry = z.infer<typeof LibraryIndexEntrySchema>;

export const LibraryIndexSchema = z.object({
    schemaVersion: z.literal(LIBRARY_SCHEMA_VERSION),
    items: z.array(LibraryIndexEntrySchema),
});
export type LibraryIndex = z.infer<typeof LibraryIndexSchema>;

export type LibraryItemSummary = LibraryIndexEntry & {
    readonly builtIn: boolean;
};

/**
 * A personal size preset. The store keeps presets; the shape of `data` is
 * owned by the units and size catalog module (package C1.4), so the store
 * accepts any JSON value there.
 */
export const SizePresetSchema = z.object({
    id: uuid,
    name: z.string().min(1),
    createdAt: isoTime,
    updatedAt: isoTime,
    data: z.json(),
});
export type SizePreset = z.infer<typeof SizePresetSchema>;

export const SizePresetFileSchema = z.object({
    schemaVersion: z.literal(LIBRARY_SCHEMA_VERSION),
    presets: z.array(SizePresetSchema),
});

/**
 * A 3D View camera profile (ADR 0002 D-12, amended 2026-10-16). Like size
 * presets, the store keeps profiles and `data` is owned by the 3D View
 * (`profileDataSchema` in `src/view3d/core/cameraList.ts`).
 */
export const CameraProfileEntrySchema = SizePresetSchema;
export type CameraProfileEntry = SizePreset;

export const CameraProfileFileSchema = z.object({
    schemaVersion: z.literal(LIBRARY_SCHEMA_VERSION),
    profiles: z.array(CameraProfileEntrySchema),
});

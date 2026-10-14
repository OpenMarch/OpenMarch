/**
 * The local Library store (ADR 0002 D-12; props-spec.md section 2, "Local
 * Library"). Main process only: it reads and writes `userData/library/` and
 * has no IPC of its own. The channels that expose it are package C1.9.
 *
 * - A Library item has a stable UUID; each Version is named by
 *   `computeVersionHash` over its parts and never changes.
 * - Blobs are immutable and content-addressed, and nothing is pruned
 *   automatically. Deleting an item removes its manifest only.
 * - Built-ins are read from a separate, read-only root with the same layout.
 *   Adding a Version to a built-in makes a user copy with `derivedFrom` and
 *   `modified` set, inheriting the built-in's license fields.
 * - Adding bytes that already form a Version anywhere in the Library reuses
 *   that item ("already in your Library").
 * - The index is a cache: it is rebuilt from the manifests every time the
 *   store opens, so a crash between a manifest write and the index write
 *   can't leave it stale.
 * - Blobs are checked against their hash when read, and an existing blob
 *   that doesn't match is rewritten the next time its bytes are added.
 */
import { randomUUID as nodeRandomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { computeVersionHash, sha256Hex } from "./hash";
import {
    LIBRARY_SCHEMA_VERSION,
    LICENSE_UNKNOWN,
    LibraryItemIdSchema,
    LibraryItemManifestSchema,
    LicenseIdSchema,
    PartRoleSchema,
    SizePresetFileSchema,
    VersionHashSchema,
    type DerivedFrom,
    type LibraryIndexEntry,
    type LibraryItem,
    type LibraryItemKind,
    type LibraryItemManifest,
    type LibraryItemSummary,
    type LibraryVersion,
    type LicenseFields,
    type SizePreset,
} from "./types";

export type LibraryErrorCode =
    | "not-found"
    | "read-only"
    | "kind-mismatch"
    | "invalid-input"
    | "corrupt";

export class LibraryError extends Error {
    constructor(
        readonly code: LibraryErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "LibraryError";
    }
}

export interface LibraryStoreOptions {
    /** The user's Library, normally `path.join(app.getPath("userData"), "library")`. */
    root: string;
    /** Built-ins that ship with the app: the same layout, never written. */
    builtinsRoot?: string;
    now?: () => Date;
    randomUUID?: () => string;
}

/** License fields a caller may give; anything left out means Unknown. */
export type LicenseInput = Partial<Omit<LicenseFields, "modified">>;

export interface AddVersionInput {
    /**
     * The item this Version belongs to: a re-import ("New version of …"), or
     * "Add to my Library" with the show's item id. A built-in's id makes a
     * user copy, and every such call makes another copy: to add a later
     * Version to that copy, pass the copy's id (`result.item.id`). An id not
     * in the Library creates the item with that id. Left out, a new item gets
     * a new UUID.
     */
    itemId?: string;
    /** When `itemId` is a built-in: the Version the copy derives from. Defaults to its latest. */
    baseVersion?: string;
    kind: LibraryItemKind;
    /** Used when this call creates an item; an existing item keeps its name. */
    name: string;
    tags?: readonly string[];
    originalFilename?: string | null;
    /** For a new item that is itself a copy, such as one added from a show. */
    derivedFrom?: DerivedFrom | null;
    license?: LicenseInput;
    /** Role to bytes, such as `{ glb, sidecar }` or `{ original, display }`. */
    parts: Readonly<Record<string, Uint8Array>>;
    /** The original source file, kept outside the Version hash. */
    source?: { filename: string; bytes: Uint8Array } | null;
}

export type AddVersionOutcome =
    /** A new item was made. */
    | "created"
    /** The Version was appended to an existing user item. */
    | "added-version"
    /** The target was a built-in, so a user copy was made. */
    | "copied"
    /** These bytes already form a Version; that item is returned unchanged. */
    | "existing";

export interface AddVersionResult {
    outcome: AddVersionOutcome;
    item: LibraryItem;
    version: LibraryVersion;
}

export interface UpdateItemPatch {
    name?: string;
    tags?: readonly string[];
    originalFilename?: string | null;
    license?: Partial<LicenseFields>;
}

export interface RebuildIndexResult {
    itemCount: number;
    skipped: { file: string; reason: string }[];
}

export interface LibraryStore {
    readonly root: string;
    listItems(filter?: {
        kind?: LibraryItemKind;
    }): Promise<LibraryItemSummary[]>;
    getItem(id: string): Promise<LibraryItem | null>;
    /** The item and Version a Version hash belongs to, built-ins included. */
    findVersion(
        hash: string,
    ): Promise<{ item: LibraryItem; version: LibraryVersion } | null>;
    readBlob(hash: string): Promise<Uint8Array>;
    readVersionParts(
        itemId: string,
        versionHash: string,
    ): Promise<Record<string, Uint8Array>>;
    readSource(
        itemId: string,
        versionHash: string,
    ): Promise<{ filename: string; bytes: Uint8Array } | null>;
    addVersion(input: AddVersionInput): Promise<AddVersionResult>;
    updateItem(id: string, patch: UpdateItemPatch): Promise<LibraryItem>;
    /** Removes a user item's manifest. Blobs stay; nothing is pruned automatically. */
    deleteItem(id: string): Promise<void>;
    rebuildIndex(): Promise<RebuildIndexResult>;
    listSizePresets(): Promise<SizePreset[]>;
    saveSizePreset(input: {
        id?: string;
        name: string;
        data: SizePreset["data"];
    }): Promise<SizePreset>;
    deleteSizePreset(id: string): Promise<void>;
}

const ITEMS_DIR = "items";
const BLOBS_DIR = path.join("blobs", "sha256");
const TMP_DIR = "tmp";
const INDEX_FILE = "index.json";
const SIZE_PRESETS_FILE = "size-presets.json";

export function blobRelativePath(hash: string): string {
    return path.join(BLOBS_DIR, hash.slice(0, 2), hash);
}

/** Opens (and creates, if needed) the Library at `options.root`. */
export async function openLibraryStore(
    options: LibraryStoreOptions,
): Promise<LibraryStore> {
    const root = path.resolve(options.root);
    const builtinsRoot = options.builtinsRoot
        ? path.resolve(options.builtinsRoot)
        : null;

    await mkdir(path.join(root, ITEMS_DIR), { recursive: true });
    await mkdir(path.join(root, BLOBS_DIR), { recursive: true });
    await rm(path.join(root, TMP_DIR), { recursive: true, force: true });
    await mkdir(path.join(root, TMP_DIR), { recursive: true });

    const store = new LocalLibrary(
        root,
        builtinsRoot,
        builtinsRoot ? await loadBuiltins(builtinsRoot) : new Map(),
        options.now ?? (() => new Date()),
        options.randomUUID ?? nodeRandomUUID,
    );
    await store.loadIndex();
    return store;
}

class LocalLibrary implements LibraryStore {
    /** User items, from the index. */
    private readonly userIndex = new Map<string, LibraryIndexEntry>();
    /** Version hash to the item that holds it, built-ins included. */
    private readonly versionOwner = new Map<string, string>();
    private queue: Promise<unknown> = Promise.resolve();

    constructor(
        readonly root: string,
        private readonly builtinsRoot: string | null,
        private readonly builtins: ReadonlyMap<string, LibraryItemManifest>,
        private readonly now: () => Date,
        private readonly newUUID: () => string,
    ) {}

    // Reading

    async listItems(filter?: {
        kind?: LibraryItemKind;
    }): Promise<LibraryItemSummary[]> {
        const all: LibraryItemSummary[] = [
            ...[...this.builtins.values()].map((m) => ({
                ...indexEntry(m),
                builtIn: true,
            })),
            ...[...this.userIndex.values()].map((e) => ({
                ...structuredClone(e),
                builtIn: false,
            })),
        ];
        return all
            .filter((e) => !filter?.kind || e.kind === filter.kind)
            .sort(
                (a, b) =>
                    a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
            );
    }

    async getItem(id: string): Promise<LibraryItem | null> {
        const builtIn = this.builtins.get(id);
        if (builtIn) return { ...structuredClone(builtIn), builtIn: true };
        if (!this.userIndex.has(id)) return null;
        try {
            return {
                ...(await readManifestFile(this.manifestPath(id))),
                builtIn: false,
            };
        } catch (error) {
            throw new LibraryError(
                "corrupt",
                `Library item ${id} has an unreadable manifest: ${String(error)}`,
            );
        }
    }

    async findVersion(
        hash: string,
    ): Promise<{ item: LibraryItem; version: LibraryVersion } | null> {
        const ownerId = this.versionOwner.get(hash);
        if (!ownerId) return null;
        const item = await this.requireItem(ownerId);
        return { item, version: requireVersion(item, hash) };
    }

    async readBlob(hash: string): Promise<Uint8Array> {
        if (!VersionHashSchema.safeParse(hash).success) {
            throw new LibraryError("invalid-input", `Not a blob hash: ${hash}`);
        }
        const roots = this.builtinsRoot
            ? [this.root, this.builtinsRoot]
            : [this.root];
        for (const base of roots) {
            let bytes: Uint8Array;
            try {
                bytes = new Uint8Array(
                    await readFile(path.join(base, blobRelativePath(hash))),
                );
            } catch (error) {
                if (isMissing(error)) continue;
                throw error;
            }
            if (sha256Hex(bytes) !== hash) {
                throw new LibraryError(
                    "corrupt",
                    `Blob ${hash} doesn't match its hash`,
                );
            }
            return bytes;
        }
        throw new LibraryError("not-found", `No blob ${hash}`);
    }

    async readVersionParts(
        itemId: string,
        versionHash: string,
    ): Promise<Record<string, Uint8Array>> {
        const item = await this.requireItem(itemId);
        const version = requireVersion(item, versionHash);
        const parts: Record<string, Uint8Array> = {};
        for (const [role, blob] of Object.entries(version.parts)) {
            parts[role] = await this.readBlob(blob);
        }
        return parts;
    }

    async readSource(
        itemId: string,
        versionHash: string,
    ): Promise<{ filename: string; bytes: Uint8Array } | null> {
        const item = await this.requireItem(itemId);
        const version = requireVersion(item, versionHash);
        if (!version.source) return null;
        return {
            filename: version.source.filename,
            bytes: await this.readBlob(version.source.blob),
        };
    }

    // Writing

    async addVersion(input: AddVersionInput): Promise<AddVersionResult> {
        const partHashes = checkAddVersionInput(input);
        const hash = computeVersionHash(partHashes);

        return this.exclusive(async () => {
            const ownerId = this.versionOwner.get(hash);
            if (ownerId) {
                const item = await this.requireItem(ownerId);
                const version = requireVersion(item, hash);
                return { outcome: "existing", item, version };
            }

            const target = input.itemId
                ? await this.getItem(input.itemId)
                : null;
            if (target && target.kind !== input.kind) {
                throw new LibraryError(
                    "kind-mismatch",
                    `Library item ${target.id} is a ${target.kind}, not a ${input.kind}`,
                );
            }
            if (target?.builtIn && input.baseVersion !== undefined) {
                requireVersion(target, input.baseVersion);
            }

            const version = await this.storeVersion(input, hash, partHashes);
            let outcome: AddVersionOutcome;
            let manifest: LibraryItemManifest;
            if (target && !target.builtIn) {
                outcome = "added-version";
                manifest = {
                    ...withoutBuiltInFlag(target),
                    updatedAt: version.createdAt,
                    versions: [...target.versions, version],
                };
            } else if (target) {
                outcome = "copied";
                manifest = builtInCopyManifest(
                    target,
                    input,
                    version,
                    this.newUUID(),
                );
            } else {
                outcome = "created";
                manifest = newItemManifest(
                    input,
                    version,
                    input.itemId ?? this.newUUID(),
                );
            }
            await this.setUserItem(manifest);
            return { outcome, item: { ...manifest, builtIn: false }, version };
        });
    }

    async updateItem(id: string, patch: UpdateItemPatch): Promise<LibraryItem> {
        return this.exclusive(async () => {
            const item = await this.requireItem(id);
            if (item.builtIn) {
                throw new LibraryError(
                    "read-only",
                    `Library item ${id} is built in; add a Version to make a copy`,
                );
            }
            const manifest = withoutBuiltInFlag(item);
            const license = patch.license ?? {};
            if (manifest.derivedFrom && license.modified === false) {
                throw new LibraryError(
                    "invalid-input",
                    "A copy stays modified; `modified` can't be cleared",
                );
            }
            const next: LibraryItemManifest = {
                ...manifest,
                name:
                    patch.name !== undefined
                        ? cleanName(patch.name)
                        : manifest.name,
                tags:
                    patch.tags !== undefined
                        ? cleanTags(patch.tags)
                        : manifest.tags,
                originalFilename:
                    patch.originalFilename !== undefined
                        ? patch.originalFilename
                        : manifest.originalFilename,
                ...licenseFields(
                    { ...pickLicense(manifest), ...license },
                    license.modified ?? manifest.modified,
                ),
                updatedAt: this.now().toISOString(),
            };
            await this.setUserItem(next);
            return { ...next, builtIn: false };
        });
    }

    async deleteItem(id: string): Promise<void> {
        return this.exclusive(async () => {
            if (this.builtins.has(id)) {
                throw new LibraryError(
                    "read-only",
                    `Library item ${id} is built in`,
                );
            }
            if (!this.userIndex.has(id)) {
                throw new LibraryError("not-found", `No Library item ${id}`);
            }
            await rm(this.manifestPath(id), { force: true });
            this.userIndex.delete(id);
            this.rebuildVersionOwners();
            await this.writeIndex();
        });
    }

    // Index

    rebuildIndex(): Promise<RebuildIndexResult> {
        return this.exclusive(() => this.rebuildIndexNow());
    }

    /** Rebuilds the index from the manifests, which are the source of truth. */
    async loadIndex(): Promise<void> {
        await this.rebuildIndexNow();
    }

    private async rebuildIndexNow(): Promise<RebuildIndexResult> {
        const skipped: RebuildIndexResult["skipped"] = [];
        const dir = path.join(this.root, ITEMS_DIR);
        this.userIndex.clear();
        for (const file of await listManifestFiles(dir)) {
            let manifest: LibraryItemManifest;
            try {
                manifest = await readManifestFile(path.join(dir, file));
            } catch (error) {
                skipped.push({ file, reason: String(error) });
                continue;
            }
            if (file !== `${manifest.id}.json`) {
                skipped.push({ file, reason: `names item ${manifest.id}` });
            } else if (this.builtins.has(manifest.id)) {
                skipped.push({ file, reason: "uses a built-in's id" });
            } else {
                this.userIndex.set(manifest.id, indexEntry(manifest));
            }
        }
        this.rebuildVersionOwners();
        await this.writeIndex();
        return { itemCount: this.userIndex.size, skipped };
    }

    // Size presets

    async listSizePresets(): Promise<SizePreset[]> {
        let raw: string;
        try {
            raw = await readFile(
                path.join(this.root, SIZE_PRESETS_FILE),
                "utf8",
            );
        } catch (error) {
            if (isMissing(error)) return [];
            throw error;
        }
        let json: unknown;
        try {
            json = JSON.parse(raw);
        } catch (error) {
            throw new LibraryError(
                "corrupt",
                `Size presets are unreadable: ${String(error)}`,
            );
        }
        const parsed = SizePresetFileSchema.safeParse(json);
        if (!parsed.success) {
            throw new LibraryError(
                "corrupt",
                `Size presets are unreadable: ${parsed.error.message}`,
            );
        }
        return parsed.data.presets;
    }

    saveSizePreset(input: {
        id?: string;
        name: string;
        data: SizePreset["data"];
    }): Promise<SizePreset> {
        if (input.id !== undefined) checkItemId(input.id);
        const name = cleanName(input.name);
        return this.exclusive(async () => {
            const presets = await this.listSizePresets();
            const at = this.now().toISOString();
            const existing = presets.find((p) => p.id === input.id);
            const preset: SizePreset = {
                id: input.id ?? this.newUUID(),
                name,
                createdAt: existing?.createdAt ?? at,
                updatedAt: at,
                data: input.data,
            };
            await this.writeSizePresets([
                ...presets.filter((p) => p.id !== preset.id),
                preset,
            ]);
            return preset;
        });
    }

    deleteSizePreset(id: string): Promise<void> {
        return this.exclusive(async () => {
            const presets = await this.listSizePresets();
            if (!presets.some((p) => p.id === id)) {
                throw new LibraryError("not-found", `No size preset ${id}`);
            }
            await this.writeSizePresets(presets.filter((p) => p.id !== id));
        });
    }

    // Internals

    /** Mutations run one at a time, so the index and manifests stay in step. */
    private exclusive<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.queue.then(fn, fn);
        this.queue = run.catch(() => undefined);
        return run;
    }

    private async requireItem(id: string): Promise<LibraryItem> {
        const item = await this.getItem(id);
        if (!item) throw new LibraryError("not-found", `No Library item ${id}`);
        return item;
    }

    private manifestPath(id: string): string {
        return path.join(this.root, ITEMS_DIR, `${id}.json`);
    }

    /** Writes a Version's blobs, first, so a manifest never names a missing blob. */
    private async storeVersion(
        input: AddVersionInput,
        hash: string,
        partHashes: Record<string, string>,
    ): Promise<LibraryVersion> {
        for (const bytes of Object.values(input.parts)) {
            await this.writeBlob(bytes);
        }
        const source = input.source
            ? {
                  blob: await this.writeBlob(input.source.bytes),
                  filename: input.source.filename,
              }
            : null;
        return {
            hash,
            createdAt: this.now().toISOString(),
            parts: partHashes,
            source,
        };
    }

    private async writeBlob(bytes: Uint8Array): Promise<string> {
        const hash = sha256Hex(bytes);
        const file = path.join(this.root, blobRelativePath(hash));
        if (await blobMatches(file, hash)) return hash;
        await mkdir(path.dirname(file), { recursive: true });
        await this.writeAtomic(file, bytes);
        return hash;
    }

    private async setUserItem(manifest: LibraryItemManifest): Promise<void> {
        await this.writeJson(this.manifestPath(manifest.id), manifest);
        this.userIndex.set(manifest.id, indexEntry(manifest));
        this.rebuildVersionOwners();
        await this.writeIndex();
    }

    private rebuildVersionOwners(): void {
        this.versionOwner.clear();
        for (const item of this.builtins.values()) {
            for (const v of item.versions)
                this.versionOwner.set(v.hash, item.id);
        }
        for (const entry of this.userIndex.values()) {
            for (const hash of entry.versions) {
                if (!this.versionOwner.has(hash)) {
                    this.versionOwner.set(hash, entry.id);
                }
            }
        }
    }

    private async writeIndex(): Promise<void> {
        const items = [...this.userIndex.values()].sort((a, b) =>
            a.id.localeCompare(b.id),
        );
        await this.writeJson(path.join(this.root, INDEX_FILE), {
            schemaVersion: LIBRARY_SCHEMA_VERSION,
            items,
        });
    }

    private async writeSizePresets(presets: SizePreset[]): Promise<void> {
        await this.writeJson(path.join(this.root, SIZE_PRESETS_FILE), {
            schemaVersion: LIBRARY_SCHEMA_VERSION,
            presets,
        });
    }

    private async writeJson(file: string, value: unknown): Promise<void> {
        await this.writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
    }

    /**
     * Writes to a temp file, flushes it to disk, then renames, so readers
     * never see half a file and a power cut can't leave an empty one behind.
     */
    private async writeAtomic(
        file: string,
        data: string | Uint8Array,
    ): Promise<void> {
        const tmp = path.join(this.root, TMP_DIR, this.newUUID());
        const handle = await open(tmp, "w");
        try {
            await handle.writeFile(data);
            await handle.sync();
        } finally {
            await handle.close();
        }
        await rename(tmp, file);
    }
}

/** Validates an `addVersion` input and returns its part hashes. */
function checkAddVersionInput(input: AddVersionInput): Record<string, string> {
    const roles = Object.keys(input.parts);
    if (roles.length === 0) {
        throw new LibraryError(
            "invalid-input",
            "A Version needs at least one part",
        );
    }
    if (input.itemId !== undefined) checkItemId(input.itemId);
    if (input.source && input.source.filename.trim() === "") {
        throw new LibraryError(
            "invalid-input",
            "A source file needs a filename",
        );
    }
    const partHashes: Record<string, string> = {};
    for (const role of roles) {
        if (!PartRoleSchema.safeParse(role).success) {
            throw new LibraryError("invalid-input", `Bad part role: ${role}`);
        }
        partHashes[role] = sha256Hex(input.parts[role]);
    }
    return partHashes;
}

function newItemManifest(
    input: AddVersionInput,
    version: LibraryVersion,
    id: string,
): LibraryItemManifest {
    const derivedFrom = input.derivedFrom ?? null;
    return {
        schemaVersion: LIBRARY_SCHEMA_VERSION,
        id,
        kind: input.kind,
        name: cleanName(input.name),
        tags: cleanTags(input.tags ?? []),
        createdAt: version.createdAt,
        updatedAt: version.createdAt,
        originalFilename: input.originalFilename ?? null,
        derivedFrom,
        // Any copy is modified.
        ...licenseFields(input.license, derivedFrom !== null),
        versions: [version],
    };
}

/**
 * A user copy of a built-in, made when a Version is added to it. It inherits
 * the license fields and is marked modified; any license in `input` is
 * ignored, so a copy can't shed its attribution on the way in.
 */
function builtInCopyManifest(
    builtIn: LibraryItem,
    input: AddVersionInput,
    version: LibraryVersion,
    id: string,
): LibraryItemManifest {
    return {
        schemaVersion: LIBRARY_SCHEMA_VERSION,
        id,
        kind: builtIn.kind,
        name: cleanName(input.name, builtIn.name),
        tags: cleanTags(input.tags ?? builtIn.tags),
        createdAt: version.createdAt,
        updatedAt: version.createdAt,
        originalFilename: input.originalFilename ?? builtIn.originalFilename,
        derivedFrom: {
            itemId: builtIn.id,
            version:
                input.baseVersion ??
                builtIn.versions[builtIn.versions.length - 1].hash,
        },
        ...licenseFields(pickLicense(builtIn), true),
        versions: [version],
    };
}

function requireVersion(item: LibraryItem, hash: string): LibraryVersion {
    const version = item.versions.find((v) => v.hash === hash);
    if (!version) {
        throw new LibraryError(
            "not-found",
            `Library item ${item.id} has no Version ${hash}`,
        );
    }
    return version;
}

function withoutBuiltInFlag(item: LibraryItem): LibraryItemManifest {
    const { builtIn: _builtIn, ...manifest } = item;
    return manifest;
}

async function readManifestFile(file: string): Promise<LibraryItemManifest> {
    const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
    return LibraryItemManifestSchema.parse(raw);
}

async function loadBuiltins(
    builtinsRoot: string,
): Promise<Map<string, LibraryItemManifest>> {
    const builtins = new Map<string, LibraryItemManifest>();
    const dir = path.join(builtinsRoot, ITEMS_DIR);
    for (const file of await listManifestFiles(dir)) {
        let manifest: LibraryItemManifest;
        try {
            manifest = LibraryItemManifestSchema.parse(
                JSON.parse(await readFile(path.join(dir, file), "utf8")),
            );
        } catch (error) {
            throw new LibraryError(
                "corrupt",
                `Built-in manifest ${file} is invalid: ${String(error)}`,
            );
        }
        builtins.set(manifest.id, manifest);
    }
    return builtins;
}

async function listManifestFiles(dir: string): Promise<string[]> {
    try {
        return (await readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch (error) {
        if (isMissing(error)) return [];
        throw error;
    }
}

function indexEntry(manifest: LibraryItemManifest): LibraryIndexEntry {
    return {
        id: manifest.id,
        kind: manifest.kind,
        name: manifest.name,
        tags: [...manifest.tags],
        updatedAt: manifest.updatedAt,
        license: manifest.license,
        versions: manifest.versions.map((v) => v.hash),
    };
}

function pickLicense(manifest: LibraryItemManifest): LicenseInput {
    return {
        license: manifest.license,
        licenseText: manifest.licenseText,
        author: manifest.author,
        sourceUrl: manifest.sourceUrl,
        attribution: manifest.attribution,
    };
}

/** Normalizes license fields; empty means Unknown, never free. */
function licenseFields(
    input: LicenseInput | undefined,
    modified: boolean,
): LicenseFields {
    const license = input?.license?.trim() || LICENSE_UNKNOWN;
    if (!LicenseIdSchema.safeParse(license).success) {
        throw new LibraryError("invalid-input", `Not a license id: ${license}`);
    }
    return {
        license,
        licenseText: emptyToNull(input?.licenseText),
        author: emptyToNull(input?.author),
        sourceUrl: emptyToNull(input?.sourceUrl),
        attribution: emptyToNull(input?.attribution),
        modified,
    };
}

function emptyToNull(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function cleanName(name: string, fallback?: string): string {
    const trimmed = name.trim() || fallback?.trim();
    if (!trimmed) throw new LibraryError("invalid-input", "A name is required");
    return trimmed;
}

function cleanTags(tags: readonly string[]): string[] {
    return [...new Set(tags.map((t) => t.trim()).filter((t) => t !== ""))];
}

function checkItemId(id: string) {
    if (!LibraryItemIdSchema.safeParse(id).success) {
        throw new LibraryError("invalid-input", `Not a Library item id: ${id}`);
    }
}

function isMissing(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: unknown }).code === "ENOENT"
    );
}

/** Whether `file` exists and holds the bytes `hash` names. */
async function blobMatches(file: string, hash: string): Promise<boolean> {
    try {
        return sha256Hex(new Uint8Array(await readFile(file))) === hash;
    } catch (error) {
        if (isMissing(error)) return false;
        throw error;
    }
}

/**
 * Reading a picked `.glb` or `.gltf` into its raw JSON and resources, before
 * anything interprets it. Names and `extras` are read from this raw JSON, not
 * from three's sanitized `Object3D.name` (props-spec.md section 2).
 */
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { ModelFileInput } from "./types";

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

/** A glTF JSON document, loosely typed: it hasn't been validated yet. */
export type RawGltf = Record<string, unknown> & {
    asset?: { generator?: unknown; copyright?: unknown; version?: unknown };
    extensionsUsed?: unknown;
    extensionsRequired?: unknown;
    scene?: unknown;
    scenes?: unknown;
    nodes?: unknown;
    meshes?: unknown;
    materials?: unknown;
    buffers?: unknown;
    images?: unknown;
};

export interface ParsedContainer {
    format: "glb" | "gltf";
    json: RawGltf;
}

export class ContainerError extends Error {
    constructor(
        readonly code:
            | "unreadable"
            | "missingResource"
            | "externalUri"
            | "resourceOutsideFolder",
        message: string,
        readonly uri?: string,
    ) {
        super(message);
        this.name = "ContainerError";
    }
}

export function isGlb(bytes: Uint8Array): boolean {
    if (bytes.byteLength < 12) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(0, true) === GLB_MAGIC;
}

/** Reads the JSON of a GLB or a `.gltf`, throwing `ContainerError` if neither. */
export function parseContainer(bytes: Uint8Array): ParsedContainer {
    if (isGlb(bytes)) {
        const view = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength,
        );
        if (bytes.byteLength < 20) {
            throw new ContainerError("unreadable", "GLB too short");
        }
        const length = view.getUint32(12, true);
        const type = view.getUint32(16, true);
        if (type !== CHUNK_JSON || 20 + length > bytes.byteLength) {
            throw new ContainerError("unreadable", "GLB has no JSON chunk");
        }
        return {
            format: "glb",
            json: parseJson(bytes.subarray(20, 20 + length)),
        };
    }
    return { format: "gltf", json: parseJson(bytes) };
}

function parseJson(bytes: Uint8Array): RawGltf {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new ContainerError("unreadable", "not a GLB or glTF JSON file");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ContainerError("unreadable", "glTF JSON is not an object");
    }
    return value as RawGltf;
}

/** The URIs of buffers and images that aren't `data:` URIs. */
export function externalUris(json: RawGltf): string[] {
    const uris = new Set<string>();
    for (const list of [json.buffers, json.images]) {
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
            const uri = (entry as { uri?: unknown } | null)?.uri;
            if (typeof uri === "string" && !uri.startsWith("data:")) {
                uris.add(uri);
            }
        }
    }
    return [...uris];
}

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const DRIVE_LETTER = /^[A-Za-z]:/;

/** Where a buffer or image URI points, before anything is read. */
export type ResourcePath =
    | { ok: true; path: string }
    | { ok: false; code: "externalUri" | "resourceOutsideFolder" };

/**
 * Checks a resource URI without touching the disk. Only relative file URIs
 * are followed: anything with a scheme (http, file, …) is refused, since the
 * import makes no network requests and reads only beside the picked file.
 * After percent-decoding, an absolute path, a Windows drive letter or UNC
 * path, a backslash or a `..` that climbs above the picked file's folder is
 * refused too. On success, `path` is the decoded POSIX path relative to that
 * folder. Symlinks are caught later, by `readModelFile`.
 */
export function resourcePathOf(uri: string): ResourcePath {
    const outside = { ok: false, code: "resourceOutsideFolder" } as const;
    if (DRIVE_LETTER.test(uri)) return outside;
    if (SCHEME.test(uri)) return { ok: false, code: "externalUri" };
    let decoded: string;
    try {
        decoded = decodeURIComponent(uri);
    } catch {
        return outside;
    }
    for (const text of [uri, decoded]) {
        if (DRIVE_LETTER.test(text)) return outside;
        if (text.startsWith("/") || text.includes("\\")) return outside;
        if (text.includes("\0")) return outside;
    }
    if (SCHEME.test(decoded)) return { ok: false, code: "externalUri" };
    const normalized = path.posix.normalize(decoded);
    if (
        normalized === ".." ||
        normalized.startsWith("../") ||
        path.posix.isAbsolute(normalized)
    ) {
        return outside;
    }
    return { ok: true, path: normalized };
}

/** Whether `target` is strictly inside `dir` (both already real paths). */
function isInside(dir: string, target: string): boolean {
    const rel = path.relative(dir, target);
    return (
        rel !== "" &&
        rel !== ".." &&
        !rel.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(rel)
    );
}

/**
 * Throws when a `.gltf` names a resource that is outside the picked file's
 * folder, or that wasn't supplied. `refused` lists URIs `readModelFile`
 * found resolving outside the folder on disk (through a symlink).
 */
export function checkResources(
    json: RawGltf,
    resources: Readonly<Record<string, Uint8Array>>,
    refused: readonly string[] = [],
): void {
    for (const uri of externalUris(json)) {
        const resolved = resourcePathOf(uri);
        if (!resolved.ok) {
            throw new ContainerError(
                resolved.code,
                resolved.code === "externalUri"
                    ? `refusing non-relative URI ${uri}`
                    : `refusing URI outside the picked folder ${uri}`,
                uri,
            );
        }
        if (refused.includes(uri)) {
            throw new ContainerError(
                "resourceOutsideFolder",
                `refusing URI outside the picked folder ${uri}`,
                uri,
            );
        }
        if (!(uri in resources)) {
            throw new ContainerError(
                "missingResource",
                `missing resource ${uri}`,
                uri,
            );
        }
    }
}

/**
 * The resources keyed both by the URI as written and by its normalized path
 * (`textures/./logo.png` is also `textures/logo.png`), since gltf-transform
 * looks a resource up by the URI as written and the validator by the
 * normalized path. Call after `checkResources`: only URIs that pass
 * `resourcePathOf` and aren't refused get a normalized key. When two URIs
 * normalize to the same path, the first one's bytes win that key; a key
 * written exactly always keeps its own bytes.
 */
export function resourcesByPath(
    json: RawGltf,
    resources: Readonly<Record<string, Uint8Array>>,
    refused: readonly string[] = [],
): Record<string, Uint8Array> {
    const byPath: Record<string, Uint8Array> = {};
    for (const uri of externalUris(json)) {
        const resolved = resourcePathOf(uri);
        if (!resolved.ok || refused.includes(uri)) continue;
        const data = resources[uri];
        if (data && !(resolved.path in byPath)) byPath[resolved.path] = data;
    }
    return { ...byPath, ...resources };
}

/**
 * Reads a picked file from disk, with a `.gltf`'s relative resources from
 * beside it. Each resource's real path (symlinks resolved) must be inside the
 * picked file's real folder; one that isn't is never read and is listed in
 * `refusedResources`. Resources that can't be read are left out, so the
 * pipeline reports them as missing.
 */
export async function readModelFile(filePath: string): Promise<ModelFileInput> {
    const bytes = new Uint8Array(await readFile(filePath));
    const input: ModelFileInput = {
        filename: path.basename(filePath),
        bytes,
    };
    if (isGlb(bytes)) return input;
    let json: RawGltf;
    try {
        json = parseContainer(bytes).json;
    } catch {
        return input;
    }
    const dir = await realpath(path.dirname(filePath));
    const resources: Record<string, Uint8Array> = {};
    const refused: string[] = [];
    for (const uri of externalUris(json)) {
        const resolved = resourcePathOf(uri);
        if (!resolved.ok) continue; // Reported by checkResources.
        let real: string;
        try {
            real = await realpath(path.resolve(dir, resolved.path));
        } catch {
            continue; // Reported as missingResource by the pipeline.
        }
        if (!isInside(dir, real)) {
            refused.push(uri);
            continue;
        }
        try {
            resources[uri] = new Uint8Array(await readFile(real));
        } catch {
            // Reported as missingResource by the pipeline.
        }
    }
    return {
        ...input,
        resources,
        ...(refused.length ? { refusedResources: refused } : {}),
    };
}

/**
 * The original as one file, for the local Library's `source` (kept outside
 * the Version hash). A GLB is kept as is; a `.gltf` gets its resources
 * inlined as `data:` URIs so nothing is lost.
 */
export function sourceFileOf(input: ModelFileInput): {
    filename: string;
    bytes: Uint8Array;
} {
    if (isGlb(input.bytes) || !input.resources) {
        return { filename: input.filename, bytes: input.bytes };
    }
    const json = structuredClone(parseContainer(input.bytes).json);
    for (const list of [json.buffers, json.images]) {
        if (!Array.isArray(list)) continue;
        for (const entry of list as { uri?: unknown; mimeType?: unknown }[]) {
            const uri = entry?.uri;
            if (typeof uri !== "string" || uri.startsWith("data:")) continue;
            if (!resourcePathOf(uri).ok) continue;
            if (input.refusedResources?.includes(uri)) continue;
            const data = input.resources[uri];
            if (!data) continue;
            const mime =
                typeof entry.mimeType === "string"
                    ? entry.mimeType
                    : mimeFromUri(uri);
            entry.uri = `data:${mime};base64,${Buffer.from(data).toString("base64")}`;
        }
    }
    return {
        filename: input.filename,
        bytes: new TextEncoder().encode(JSON.stringify(json)),
    };
}

function mimeFromUri(uri: string): string {
    const ext = uri.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
    switch (ext) {
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "webp":
            return "image/webp";
        default:
            return "application/octet-stream";
    }
}

/**
 * The picked files, before anything interprets them (fork #998): which one is the model, its raw
 * glTF JSON, and the files it names, found only among the picked files.
 *
 * The import never reads a path or fetches a URI (ADR 0010 amendment 2026-11-15, "bytes in,
 * bytes out"): a URI with a scheme is refused, one that climbs out of the picked files' folder is
 * refused, and one naming a file that wasn't picked is reported missing. Ported from the parked
 * pipeline's `container.ts` (`archive/pre-convergence`), without `node:fs` and `node:path`.
 */
import type { PickedFile, Refusal } from "./types";

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

/** A glTF JSON document, loosely typed: it hasn't been validated yet. */
export type RawGltf = Record<string, unknown> & {
    asset?: {
        generator?: unknown;
        copyright?: unknown;
        extras?: unknown;
        extensions?: unknown;
    };
    extensionsUsed?: unknown;
    extensionsRequired?: unknown;
    extensions?: unknown;
    scene?: unknown;
    scenes?: unknown;
    nodes?: unknown;
    meshes?: unknown;
    accessors?: unknown;
    bufferViews?: unknown;
    buffers?: unknown;
    images?: unknown;
};

/** The model file, opened: its JSON, a GLB's binary chunk, and the files it names by URI. */
export interface OpenedModel {
    name: string;
    format: "glb" | "gltf";
    /** The file's bytes as picked (what the validator reads) */
    bytes: Uint8Array;
    json: RawGltf;
    /** A GLB's BIN chunk, or null */
    bin: Uint8Array | null;
    /** Every non-`data:` URI the model names, as written, to the picked file's bytes */
    resources: Record<string, Uint8Array>;
}

export class RefusedError extends Error {
    constructor(readonly refusal: Refusal) {
        super(refusal.code);
        this.name = "RefusedError";
    }
}

const isModelName = (name: string) => /\.(glb|gltf)$/i.test(name);

export function isGlb(bytes: Uint8Array): boolean {
    if (bytes.byteLength < 12) return false;
    return (
        new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength,
        ).getUint32(0, true) === GLB_MAGIC
    );
}

/**
 * Finds the one model among the picked files and opens it, with the files it names. Throws
 * `RefusedError` when it can't. `unread` names files that came with them but weren't read (a
 * zip's other entries), for the refusal when there's no model.
 */
export function openPickedFiles(
    files: readonly PickedFile[],
    unread: readonly string[] = [],
): OpenedModel {
    const models = files.filter((f) => isModelName(f.name) || isGlb(f.bytes));
    if (models.length === 0)
        throw new RefusedError({
            code: "noModelFile",
            names: [...files.map((f) => f.name), ...unread],
        });
    if (models.length > 1)
        throw new RefusedError({
            code: "severalModelFiles",
            names: models.map((f) => f.name),
        });
    const file = models[0];
    const { format, json, bin } = parseContainer(file.bytes);
    const others = files.filter((f) => f !== file);
    // A model inside a folder (in a zip) names its files from that folder
    const folder = file.name.slice(0, file.name.lastIndexOf("/") + 1);
    const resources: Record<string, Uint8Array> = {};
    for (const uri of externalUris(json)) {
        resources[uri] = findResource(uri, others, folder);
    }
    return { name: file.name, format, bytes: file.bytes, json, bin, resources };
}

/** Reads the JSON (and a GLB's BIN chunk) of a GLB or a `.gltf`. */
export function parseContainer(bytes: Uint8Array): {
    format: "glb" | "gltf";
    json: RawGltf;
    bin: Uint8Array | null;
} {
    if (!isGlb(bytes))
        return { format: "gltf", json: parseJson(bytes), bin: null };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let json: RawGltf | null = null;
    let bin: Uint8Array | null = null;
    let offset = 12;
    while (offset + 8 <= bytes.byteLength) {
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        const start = offset + 8;
        if (start + length > bytes.byteLength) break;
        const data = bytes.subarray(start, start + length);
        if (type === CHUNK_JSON && !json) json = parseJson(data);
        else if (type === CHUNK_BIN && !bin) bin = data;
        offset = start + length;
    }
    if (!json) unreadable("the GLB has no JSON chunk");
    return { format: "glb", json, bin };
}

function unreadable(reason: string): never {
    throw new RefusedError({ code: "unreadable", reason });
}

function parseJson(bytes: Uint8Array): RawGltf {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        unreadable("not a GLB or glTF JSON file");
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
        unreadable("the glTF JSON is not an object");
    return value as RawGltf;
}

/** The URIs of buffers and images that aren't `data:` URIs. */
export function externalUris(json: RawGltf): string[] {
    const uris = new Set<string>();
    for (const list of [json.buffers, json.images]) {
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
            const uri = (entry as { uri?: unknown } | null)?.uri;
            if (typeof uri === "string" && !uri.startsWith("data:"))
                uris.add(uri);
        }
    }
    return [...uris];
}

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const DRIVE_LETTER = /^[A-Za-z]:/;

/**
 * The relative path a URI names, percent-decoded and normalized, or the refusal for it. Only
 * relative paths inside the picked files' folder pass: a scheme, an absolute path, a drive
 * letter, a backslash or a `..` that climbs above the folder is refused.
 */
export function resourcePathOf(
    uri: string,
): { ok: true; path: string } | { ok: false; refusal: Refusal } {
    const outside = {
        ok: false,
        refusal: { code: "outsidePickedFiles", uri },
    } as const;
    if (DRIVE_LETTER.test(uri)) return outside;
    if (SCHEME.test(uri))
        return { ok: false, refusal: { code: "externalUri", uri } };
    let decoded: string;
    try {
        decoded = decodeURIComponent(uri);
    } catch {
        return outside;
    }
    for (const text of [uri, decoded]) {
        if (DRIVE_LETTER.test(text)) return outside;
        if (text.startsWith("/") || text.includes("\\") || text.includes("\0"))
            return outside;
    }
    if (SCHEME.test(decoded))
        return { ok: false, refusal: { code: "externalUri", uri } };
    const parts: string[] = [];
    for (const part of decoded.split("/")) {
        if (part === "" || part === ".") continue;
        if (part === "..") {
            if (parts.length === 0) return outside;
            parts.pop();
        } else parts.push(part);
    }
    if (parts.length === 0) return outside;
    return { ok: true, path: parts.join("/") };
}

/**
 * The picked file a URI names. A picked file has only a name (a browser's file picker gives no
 * folders), so `textures/wood.png` matches a file picked as `textures/wood.png` or, failing
 * that, the only one picked as `wood.png`. Files from a zip are named by their path in it, so
 * the path is tried first from the model's own `folder`.
 */
function findResource(
    uri: string,
    files: readonly PickedFile[],
    folder = "",
): Uint8Array {
    const resolved = resourcePathOf(uri);
    if (!resolved.ok) throw new RefusedError(resolved.refusal);
    const { path } = resolved;
    const exact =
        (folder && files.find((f) => f.name === folder + path)) ||
        files.find((f) => f.name === path);
    if (exact) return exact.bytes;
    const base = path.slice(path.lastIndexOf("/") + 1);
    const byName = files.filter(
        (f) => f.name.slice(f.name.lastIndexOf("/") + 1) === base,
    );
    if (byName.length === 1) return byName[0].bytes;
    throw new RefusedError({ code: "missingFile", uri });
}

/**
 * The bytes of the image at `index`: from a buffer view (a GLB's BIN chunk, or a buffer file),
 * a `data:` URI or a picked file. Null when they can't be found.
 */
export function imageBytes(
    model: OpenedModel,
    index: number,
): Uint8Array | null {
    const image = (
        model.json.images as Record<string, unknown>[] | undefined
    )?.[index];
    if (!image) return null;
    if (typeof image.uri === "string") {
        return image.uri.startsWith("data:")
            ? decodeDataUri(image.uri)
            : (model.resources[image.uri] ?? null);
    }
    if (typeof image.bufferView === "number")
        return bufferViewBytes(model, image.bufferView);
    return null;
}

function bufferViewBytes(model: OpenedModel, index: number): Uint8Array | null {
    const view = (
        model.json.bufferViews as Record<string, unknown>[] | undefined
    )?.[index];
    if (!view || typeof view.buffer !== "number") return null;
    const buffer = (
        model.json.buffers as Record<string, unknown>[] | undefined
    )?.[view.buffer];
    if (!buffer) return null;
    let data: Uint8Array | null;
    if (typeof buffer.uri === "string") {
        data = buffer.uri.startsWith("data:")
            ? decodeDataUri(buffer.uri)
            : (model.resources[buffer.uri] ?? null);
    } else data = model.bin;
    if (!data) return null;
    const offset = typeof view.byteOffset === "number" ? view.byteOffset : 0;
    const length = typeof view.byteLength === "number" ? view.byteLength : 0;
    if (offset + length > data.byteLength) return null;
    return data.subarray(offset, offset + length);
}

function decodeDataUri(uri: string): Uint8Array | null {
    const comma = uri.indexOf(",");
    if (comma < 0 || !uri.slice(0, comma).endsWith(";base64")) return null;
    try {
        const text = atob(uri.slice(comma + 1));
        const out = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
        return out;
    } catch {
        return null;
    }
}

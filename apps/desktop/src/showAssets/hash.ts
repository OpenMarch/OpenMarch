/**
 * Hashing for the show's asset store (ADR 0010 amendment 2026-11-15, fork #997).
 *
 * Bytes are named by their sha256. A Version is named by a hash over its parts and its sidecar,
 * so identical imports get the same Version on any machine and a Version's bytes never change.
 * Name and credits stay outside it, so fixing an author doesn't make a new Version.
 *
 * The Version listing is the parked Library's (ADR 0010 D-12, `archive/pre-convergence`
 * `electron/main/library/hash.ts`), with the sidecar as its `sidecar` part: the canonical JSON
 * text, as UTF-8. The two hash alike only for the same part roles: the parked Library named a
 * model's part `glb`, where this store names it `model`.
 *
 * Web Crypto only, so the same code runs in the editor, the web editor's worker and Node.
 */

/** A JSON value as the store keeps it: no `undefined`, no NaN or Infinity. */
export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

const VERSION_HASH_PREFIX = "openmarch-library-version/1\n";

/** The role the sidecar takes in a Version's listing; no part may use it. */
export const SIDECAR_ROLE = "sidecar";

const toHex = (digest: ArrayBuffer) =>
    Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
    ).join("");

/** sha256 of some bytes, as lowercase hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    return toHex(
        await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    );
}

/** True for a sha256 written as 64 lowercase hex digits. */
export const isSha256Hex = (value: string): boolean =>
    /^[0-9a-f]{64}$/.test(value);

/**
 * `value` as JSON text with every object's keys sorted and no spaces, so equal values give equal
 * text. Throws for what JSON can't hold exactly (`undefined`, functions, NaN, Infinity), rather
 * than dropping or changing it as `JSON.stringify` would.
 */
export function canonicalJson(value: JsonValue): string {
    if (value === null) return "null";
    switch (typeof value) {
        case "boolean":
        case "string":
            return JSON.stringify(value);
        case "number":
            if (!Number.isFinite(value))
                throw new Error(`JSON can't hold the number ${value}`);
            return JSON.stringify(value);
        case "object": {
            if (Array.isArray(value))
                return `[${value.map(canonicalJson).join(",")}]`;
            const keys = Object.keys(value).sort();
            return `{${keys
                .map(
                    (key) =>
                        `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`,
                )
                .join(",")}}`;
        }
        default:
            throw new Error(`JSON can't hold a value of type ${typeof value}`);
    }
}

/** Role to the sha256 of that part's bytes. */
export async function hashParts(
    parts: Readonly<Record<string, Uint8Array>>,
): Promise<Record<string, string>> {
    const entries = await Promise.all(
        Object.entries(parts).map(
            async ([role, bytes]) => [role, await sha256Hex(bytes)] as const,
        ),
    );
    return Object.fromEntries(entries);
}

/**
 * The hash that names a Version: sha256 over a listing of each role and its part's hash, sorted
 * by role, the way a git tree names its files.
 *
 * @param partHashes role to the sha256 of that part's bytes
 */
export async function versionHashOfListing(
    partHashes: Readonly<Record<string, string>>,
): Promise<string> {
    const roles = Object.keys(partHashes).sort();
    if (roles.length === 0) {
        throw new Error("A Version needs at least one part");
    }
    let listing = VERSION_HASH_PREFIX;
    for (const role of roles) {
        listing += `${role} ${partHashes[role]}\n`;
    }
    return await sha256Hex(new TextEncoder().encode(listing));
}

/**
 * The Version hash of an asset's parts and its sidecar (in canonical JSON text, see
 * `canonicalJson`).
 *
 * @param partHashes role to the sha256 of that part's bytes; at least one, never `sidecar`
 * @param sidecarText the sidecar's canonical JSON text
 */
export async function versionHashOf(
    partHashes: Readonly<Record<string, string>>,
    sidecarText: string,
): Promise<string> {
    if (Object.keys(partHashes).length === 0) {
        throw new Error("A Version needs at least one part");
    }
    if (Object.hasOwn(partHashes, SIDECAR_ROLE)) {
        throw new Error(`No part may be called "${SIDECAR_ROLE}"`);
    }
    return await versionHashOfListing({
        ...partHashes,
        [SIDECAR_ROLE]: await sha256Hex(new TextEncoder().encode(sidecarText)),
    });
}

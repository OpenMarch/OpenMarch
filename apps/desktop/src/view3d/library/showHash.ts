/**
 * Library hashing for the editor (ADR 0002 D-12).
 *
 * The main process hashes with `node:crypto` in `electron/main/library/hash.ts`; the editor
 * can't load that, so this file hashes with Web Crypto. The two must agree byte for byte, since
 * a show and the local Library match Versions by hash. `showHash.test.ts` pins them together.
 */

const VERSION_HASH_PREFIX = "openmarch-library-version/1\n";

const toHex = (digest: ArrayBuffer) =>
    Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
    ).join("");

/** sha256 of some bytes, as lowercase hex. */
export async function sha256HexOf(bytes: Uint8Array): Promise<string> {
    return toHex(
        await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    );
}

/** Role to the sha256 hex of that part's bytes. */
export async function hashParts(
    parts: Readonly<Record<string, Uint8Array>>,
): Promise<Record<string, string>> {
    const entries = await Promise.all(
        Object.entries(parts).map(
            async ([role, bytes]) => [role, await sha256HexOf(bytes)] as const,
        ),
    );
    return Object.fromEntries(entries);
}

/**
 * The hash that names a Version, from its part hashes. Same listing as main's
 * `computeVersionHash`: each role and its part's hash, sorted by role.
 */
export async function versionHashOf(
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
    return await sha256HexOf(new TextEncoder().encode(listing));
}

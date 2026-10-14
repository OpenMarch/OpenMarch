import { createHash } from "node:crypto";

/** sha256 of some bytes, as lowercase hex. */
export function sha256Hex(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

const VERSION_HASH_PREFIX = "openmarch-library-version/1\n";

/**
 * The hash that names a Version (ADR 0002 D-12): sha256 over its stored bytes.
 *
 * A Version is made of several blobs (a normalized GLB plus its sidecar, or an
 * original image plus its display texture), so the hash covers each part's
 * bytes through that part's own sha256, in a canonical listing sorted by
 * role, the way a git tree names its files. Equal parts give an equal hash
 * on any machine, which is what lets a show and the local Library agree on a
 * Version. License metadata and the original source file are not parts and
 * never enter the hash.
 *
 * @param partHashes role to the sha256 hex of that part's bytes
 */
export function computeVersionHash(
    partHashes: Readonly<Record<string, string>>,
): string {
    const roles = Object.keys(partHashes).sort();
    if (roles.length === 0) {
        throw new Error("A Version needs at least one part");
    }
    let listing = VERSION_HASH_PREFIX;
    for (const role of roles) {
        listing += `${role} ${partHashes[role]}\n`;
    }
    return sha256Hex(new TextEncoder().encode(listing));
}

import type * as fs from "node:fs";

/**
 * What OpenMarch last saw of a show file, when it opened or published it. Compared before each
 * publish to notice that something else changed the file (ADR 0018).
 */
export type FileStatIdentity = {
    size: number;
    mtimeMs: number;
    ino: number;
    dev: number;
};

export type FileIdentity = FileStatIdentity & {
    /**
     * SHA-256 of the bytes, as hex. Null while unknown: the open-time hash runs on the worker,
     * and stays unknown if the file changed while it was read.
     */
    sha256: string | null;
};

export function statIdentity(stat: fs.Stats): FileStatIdentity {
    return {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ino: stat.ino,
        dev: stat.dev,
    };
}

export function sameStat(a: FileStatIdentity, b: FileStatIdentity): boolean {
    return (
        a.size === b.size &&
        a.mtimeMs === b.mtimeMs &&
        a.ino === b.ino &&
        a.dev === b.dev
    );
}

/** The identity fields that differ between what was expected and what is on disk. */
export function changedFields(
    expected: FileIdentity,
    actual: FileIdentity,
): (keyof FileIdentity)[] {
    return (["size", "mtimeMs", "ino", "dev", "sha256"] as const).filter(
        (key) => expected[key] !== actual[key],
    );
}

export type ConflictCheck =
    | { conflict: false; metadataOnly: boolean }
    | {
          conflict: true;
          reason: "modified" | "missing";
          changed: (keyof FileIdentity)[];
      };

/**
 * Decides whether publishing over the show would lose someone else's changes.
 *
 * When size, modification time, inode and device all match what OpenMarch last loaded or
 * published, nothing changed (and `actual` carries no hash: it wasn't computed). When any
 * differ, the content hash decides: a file only touched, or replaced by a sync app with the same
 * bytes, isn't a conflict. Without a known hash to compare, a changed stat is a conflict.
 */
export function checkForConflict(
    expected: FileIdentity,
    actual: FileIdentity | null,
): ConflictCheck {
    if (!actual)
        return { conflict: true, reason: "missing", changed: ["size"] };
    if (sameStat(expected, actual))
        return { conflict: false, metadataOnly: false };
    if (
        expected.sha256 !== null &&
        actual.sha256 !== null &&
        expected.sha256 === actual.sha256
    )
        return { conflict: false, metadataOnly: true };
    return {
        conflict: true,
        reason: "modified",
        changed: changedFields(expected, actual),
    };
}

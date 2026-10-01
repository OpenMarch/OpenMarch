// cspell:ignore errcode CANTOPEN NOTADB
/**
 * Backup of a `.dots` file before the timeline conversion (Phase 9, P9.2).
 *
 * `backupBeforeConversion` writes a consistent copy next to the original and
 * verifies it. P9.3's conversion calls it first and must not convert unless it
 * returns `{ ok: true }`. Nothing else calls it yet.
 *
 * The copy is made with `VACUUM INTO` from a read-only connection, so it is a
 * single consistent snapshot even while another connection has the file open or
 * is writing to it (a plain file copy could miss pages that are still in the
 * WAL or catch a write half-way). The original's main file is never written to.
 * On a file in WAL mode, opening it (even read-only) can create or touch its
 * `-wal` and `-shm` side files; those are SQLite's own bookkeeping and the
 * file's contents are unchanged. The copy is written under a temporary name and
 * only given its final name once it passed verification, so a half-written
 * backup never has the real name.
 *
 * This is synchronous and runs on the calling thread. It takes roughly 1 to 2
 * seconds for a 50 MB file; see the P9.2 handoff notes.
 */
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";
import { readUserVersion } from "./fileVersion";

/** Text in the backup's name, before the extension. */
export const BACKUP_NAME_SUFFIX = "before timeline conversion";

/** Most numbered names tried before giving up. */
const MAX_NAME_ATTEMPTS = 100;
/** Most times the snapshot is redone because another connection committed. */
const MAX_SNAPSHOT_ATTEMPTS = 3;
/** How long to wait for another connection's lock. */
const BUSY_TIMEOUT_MS = 5000;
/** Longest file name, in UTF-8 bytes, that common file systems accept. */
const MAX_NAME_BYTES = 255;
/** Temp files older than this are treated as left by a crash. */
const ORPHAN_AGE_MS = 60 * 60 * 1000;

const TEMP_PREFIX = ".openmarch-backup-";
const TEMP_SUFFIX = ".tmp";
const TEMP_PATTERN = /^\.openmarch-backup-[0-9a-f]{12}\.tmp$/;

/** Why a backup failed. The UI can branch on this and show `message`. */
export type BackupErrorCode =
    /** The file to back up doesn't exist or isn't a file. */
    | "source-missing"
    /** The folder isn't writable (read-only folder, permissions). */
    | "directory-not-writable"
    /** No space left for the copy. */
    | "disk-full"
    /** Another program or connection has the file locked. */
    | "file-busy"
    /** The backup's file name would be too long for the file system. */
    | "name-too-long"
    /** The file couldn't be read as an SQLite database. */
    | "source-unreadable"
    /** The copy was written but doesn't match the original. */
    | "verification-failed"
    /** Anything else. */
    | "unknown";

export type BackupResult =
    | {
          ok: true;
          /** Absolute path of the backup. */
          backupPath: string;
          /** The original's `user_version`, which the backup has too. */
          userVersion: number;
      }
    | {
          ok: false;
          code: BackupErrorCode;
          /** English text safe to show to a person. The conversion must not proceed. */
          message: string;
      };

/** Hooks that let tests act at exact points. Production callers pass nothing. */
export type BackupTestHooks = {
    /** After `VACUUM INTO`, before the check that the file didn't change. */
    afterSnapshot?: (attempt: number) => void;
    /** After the snapshot is accepted, before the copy is verified. */
    beforeVerify?: () => void;
};

const byteLength = (s: string) => Buffer.byteLength(s, "utf8");

/** Cuts `s` to at most `maxBytes` UTF-8 bytes without splitting a character. */
function truncateUtf8(s: string, maxBytes: number): string {
    let out = "";
    let used = 0;
    for (const ch of s) {
        const n = byteLength(ch);
        if (used + n > maxBytes) break;
        out += ch;
        used += n;
    }
    return out;
}

/** True when anything, including a dangling symlink, exists at `p`. */
function entryExists(p: string): boolean {
    try {
        fs.lstatSync(p);
        return true;
    } catch {
        return false;
    }
}

/** `<base> (before timeline conversion[ n])<ext>`, with `base` cut to fit 255 bytes. */
function backupName(base: string, ext: string, n: number): string {
    const label = n === 1 ? BACKUP_NAME_SUFFIX : `${BACKUP_NAME_SUFFIX} ${n}`;
    const tail = ` (${label})${ext}`;
    const room = MAX_NAME_BYTES - byteLength(tail);
    return `${truncateUtf8(base, Math.max(room, 0))}${tail}`;
}

/**
 * The name for a backup of `filePath`: `<name> (before timeline conversion).dots`,
 * or `<name> (before timeline conversion 2).dots` (3, ...) when that exists.
 * Existing includes dangling symlinks. Starts at number `startAt` (1 is the
 * unnumbered name). Only checks which names are free; it creates nothing.
 * Throws a `RangeError` after `MAX_NAME_ATTEMPTS` taken names.
 */
export function nextBackupPath(
    filePath: string,
    exists: (p: string) => boolean = entryExists,
    startAt = 1,
): string {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    for (let n = startAt; n < startAt + MAX_NAME_ATTEMPTS; n++) {
        const candidate = path.join(dir, backupName(base, ext, n));
        if (!exists(candidate)) return candidate;
    }
    throw new RangeError(
        `No free backup name for ${filePath} after ${MAX_NAME_ATTEMPTS} tries`,
    );
}

const fail = (code: BackupErrorCode, message: string): BackupResult => ({
    ok: false,
    code,
    message,
});

const errnoOf = (e: unknown): string | undefined => {
    const code = (e as NodeJS.ErrnoException | undefined)?.code;
    return typeof code === "string" ? code : undefined;
};

/** SQLite's primary result code, when the error came from node:sqlite. */
const sqliteCodeOf = (e: unknown): number | undefined => {
    const errcode = (e as { errcode?: unknown } | undefined)?.errcode;
    return typeof errcode === "number" ? errcode & 0xff : undefined;
};

/**
 * Maps a failure to a result. Looks at the file system's errno and SQLite's
 * result code first. Message text is only a last resort and is never matched
 * against anything that can hold a path, because a folder named "Full Band"
 * must not read as a full disk.
 */
function classify(e: unknown, dir: string): BackupResult {
    const errno = errnoOf(e);
    const sqliteCode = sqliteCodeOf(e);
    const text = e instanceof Error ? e.message : String(e);
    const notWritable = () =>
        fail(
            "directory-not-writable",
            `OpenMarch can't write a backup in "${dir}" (the folder is read-only or you don't have permission). Your file was not changed. Move it to a folder you can write to, then try again.`,
        );
    const diskFull = () =>
        fail(
            "disk-full",
            `There isn't enough free disk space to back up your file in "${dir}". Your file was not changed. Free some space, then try again.`,
        );
    const busy = () =>
        fail(
            "file-busy",
            `Your file is in use by another program, so it can't be backed up right now. Your file was not changed. Close other programs that use it, then try again.`,
        );

    if (errno === "EACCES" || errno === "EPERM" || errno === "EROFS") {
        return notWritable();
    }
    if (errno === "ENOSPC" || errno === "EDQUOT") return diskFull();
    if (errno === "ENAMETOOLONG") {
        return fail(
            "name-too-long",
            `The backup's file name is too long for the file system in "${dir}". Your file was not changed. Shorten the file's name, then try again.`,
        );
    }
    if (sqliteCode !== undefined) {
        if (sqliteCode === 13) return diskFull(); // SQLITE_FULL
        if (sqliteCode === 8 || sqliteCode === 14) return notWritable(); // READONLY, CANTOPEN
        if (sqliteCode === 5 || sqliteCode === 6) return busy(); // BUSY, LOCKED
        if (sqliteCode === 26 || sqliteCode === 11) {
            // NOTADB, CORRUPT
            return fail(
                "source-unreadable",
                `Your file isn't a readable OpenMarch file (${text}). Your file was not changed.`,
            );
        }
    }
    return fail(
        "unknown",
        `The backup could not be made: ${text}. Your file was not changed.`,
    );
}

/** Tables and views as (type, name, sql), sorted, for comparing two files. */
function schemaOf(db: DatabaseSync): string {
    return JSON.stringify(
        db
            .prepare(
                "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
            )
            .all(),
    );
}

const dataVersionOf = (db: DatabaseSync): number =>
    (db.prepare("PRAGMA data_version").get() as { data_version: number })
        .data_version;

/** What the source looked like when the snapshot was taken. */
type SourceFacts = { userVersion: number; schema: string };

/**
 * Throws when `copyPath` isn't a faithful copy of the snapshot: it must pass
 * `integrity_check` and have the same `user_version` and schema. Only the copy
 * is opened, so a commit to the original after the snapshot can't fail a good
 * backup. Row counts aren't compared: `VACUUM INTO` copies every row, and
 * `integrity_check` already reads the whole copy.
 */
function verifyCopy(copyPath: string, facts: SourceFacts): void {
    const copy = new DatabaseSync(copyPath, { readOnly: true });
    try {
        const integrity = copy.prepare("PRAGMA integrity_check").all() as {
            integrity_check: string;
        }[];
        if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
            throw new Error("the copy failed SQLite's integrity check");
        }
        if (readUserVersion(copy) !== facts.userVersion) {
            throw new Error("the copy has a different file version");
        }
        if (schemaOf(copy) !== facts.schema) {
            throw new Error("the copy has a different schema");
        }
    } finally {
        copy.close();
    }
}

/** Deletes temp files this module left behind in `dir` after a crash. */
function sweepOrphanedTempFiles(dir: string): void {
    try {
        const now = Date.now();
        for (const name of fs.readdirSync(dir)) {
            if (!TEMP_PATTERN.test(name)) continue;
            const full = path.join(dir, name);
            try {
                const stat = fs.lstatSync(full);
                // Recent ones may belong to a backup running right now.
                if (stat.isFile() && now - stat.mtimeMs > ORPHAN_AGE_MS) {
                    fs.unlinkSync(full);
                }
            } catch {
                // Best effort.
            }
        }
    } catch {
        // Best effort.
    }
}

/**
 * Gives `tempPath` the final name `target` without ever replacing a file.
 * Throws EEXIST when `target` is taken. Removing the temp file afterwards is
 * best effort and can't fail the publish.
 */
function publishWithoutOverwrite(tempPath: string, target: string): void {
    try {
        // A hard link fails with EEXIST if `target` appeared in the meantime.
        fs.linkSync(tempPath, target);
    } catch (e) {
        if (errnoOf(e) === "EEXIST") throw e;
        // Some file systems have no hard links; copy with an exclusive create.
        try {
            fs.copyFileSync(tempPath, target, fs.constants.COPYFILE_EXCL);
        } catch (copyError) {
            // Never leave a partial file under the real name.
            if (errnoOf(copyError) !== "EEXIST") {
                fs.rmSync(target, { force: true });
            }
            throw copyError;
        }
    }
    try {
        fs.unlinkSync(tempPath);
    } catch {
        // The caller's cleanup tries again; the backup itself is complete.
    }
}

/** Takes the snapshot into `tempPath`, redoing it if another connection commits meanwhile. */
function snapshotInto(
    absolute: string,
    tempPath: string,
    hooks?: BackupTestHooks,
): { ok: true; facts: SourceFacts } | { ok: false; error: unknown } {
    let source: DatabaseSync;
    try {
        source = new DatabaseSync(absolute, { readOnly: true });
    } catch (error) {
        return { ok: false, error };
    }
    try {
        source.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
        for (let attempt = 1; attempt <= MAX_SNAPSHOT_ATTEMPTS; attempt++) {
            const before = dataVersionOf(source);
            const facts: SourceFacts = {
                userVersion: readUserVersion(source),
                schema: schemaOf(source),
            };
            source.exec(`VACUUM INTO '${tempPath.replace(/'/g, "''")}'`);
            hooks?.afterSnapshot?.(attempt);
            // data_version changes when another connection commits. If it did,
            // the facts above may not describe the snapshot: take it again.
            if (dataVersionOf(source) === before) return { ok: true, facts };
            fs.rmSync(tempPath, { force: true });
        }
        return {
            ok: false,
            error: new Error(
                "the file kept changing while it was being backed up",
            ),
        };
    } catch (error) {
        return { ok: false, error };
    } finally {
        source.close();
    }
}

/**
 * Backs up the show file at `filePath` next to it, before it is converted.
 *
 * - Never writes to the original's main file.
 * - Never overwrites an existing file (a dangling symlink counts as taken): a
 *   taken name gets a number.
 * - Verifies the copy before returning success, and removes it (and any
 *   temporary file) when anything fails.
 * - Never throws for an expected failure; it returns `{ ok: false, ... }`.
 * - Waits up to 5 seconds for another connection's lock (`file-busy`).
 *
 * Callers must not convert the file unless `ok` is true.
 */
export function backupBeforeConversion(
    filePath: string,
    hooks?: BackupTestHooks,
): BackupResult {
    const dir = path.dirname(path.resolve(filePath));
    const absolute = path.join(dir, path.basename(filePath));

    let stat: fs.Stats | undefined;
    try {
        stat = fs.statSync(absolute);
    } catch {
        stat = undefined;
    }
    if (!stat?.isFile()) {
        return fail(
            "source-missing",
            `The file "${absolute}" doesn't exist, so it can't be backed up.`,
        );
    }

    sweepOrphanedTempFiles(dir);

    // A short fixed-length name, so a long show name can't make the temp name too long.
    const tempPath = path.join(
        dir,
        `${TEMP_PREFIX}${randomBytes(6).toString("hex")}${TEMP_SUFFIX}`,
    );
    try {
        // Probe for write access first so a read-only folder fails clearly and early.
        try {
            fs.writeFileSync(tempPath, "", { flag: "wx" });
            fs.unlinkSync(tempPath);
        } catch (e) {
            return classify(e, dir);
        }

        const snapshot = snapshotInto(absolute, tempPath, hooks);
        if (!snapshot.ok) return classify(snapshot.error, dir);

        hooks?.beforeVerify?.();
        try {
            verifyCopy(tempPath, snapshot.facts);
        } catch (e) {
            return fail(
                "verification-failed",
                `The backup was made but didn't match your file (${e instanceof Error ? e.message : String(e)}), so it was deleted. Your file was not changed.`,
            );
        }

        let startAt = 1;
        for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
            let target: string;
            try {
                target = nextBackupPath(absolute, entryExists, startAt);
            } catch (e) {
                return fail(
                    "unknown",
                    `No free name for a backup was found in "${dir}". Your file was not changed. Remove old "${BACKUP_NAME_SUFFIX}" backups, then try again. (${e instanceof Error ? e.message : String(e)})`,
                );
            }
            try {
                publishWithoutOverwrite(tempPath, target);
                return {
                    ok: true,
                    backupPath: target,
                    userVersion: snapshot.facts.userVersion,
                };
            } catch (e) {
                if (errnoOf(e) !== "EEXIST") return classify(e, dir);
                // Taken since we looked (or a dangling symlink): always move on.
                startAt += 1;
            }
        }
        return fail(
            "unknown",
            `No free name for a backup was found in "${dir}". Your file was not changed.`,
        );
    } catch (e) {
        return classify(e, dir);
    } finally {
        try {
            fs.rmSync(tempPath, { force: true });
        } catch {
            // Best effort; the next backup sweeps old temp files.
        }
    }
}

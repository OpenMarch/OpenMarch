/**
 * The web editor's show library: which shows this browser keeps, their
 * versions and backups. Pure functions over a plain index, so the worker
 * (which stores it, `web/worker/library.ts`) and the page (which shows it)
 * agree, and so it can be tested without a browser.
 *
 * Every function returns a new index; none changes the one it's given.
 */

/** How often a version is kept while editing, at most. */
export const VERSION_INTERVAL_MS = 2 * 60 * 1000;
/** How many versions each show keeps; older ones are removed. */
export const MAX_VERSIONS = 20;
/** Remind to back up once a show has changes from this many days of editing. */
export const BACKUP_REMINDER_EDIT_DAYS = 3;
/** At most one backup reminder per this long. */
export const BACKUP_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type VersionReason = "edit" | "opened" | "before-restore";

export interface VersionEntry {
    /** Unique within the show; also names its file. */
    id: string;
    /** When it was taken (ms since the epoch). */
    at: number;
    reason: VersionReason;
}

export interface ShowEntry {
    id: string;
    name: string;
    createdAt: number;
    /** When the show last changed. */
    editedAt: number;
    /** When it was last backed up (shared or downloaded), or null. */
    backedUpAt: number | null;
    /** Whether it changed since its last backup (or ever, if never). */
    changedSinceBackup: boolean;
    /** Local dates ("2026-10-24") with changes since the last backup. */
    editDays: string[];
    /** Whether it changed since its newest version. */
    changedSinceVersion: boolean;
    /** Oldest first. */
    versions: VersionEntry[];
}

export interface LibraryIndex {
    format: 1;
    shows: ShowEntry[];
    /** The show that was open, reopened when the page loads; or null. */
    openId: string | null;
    /**
     * Shows deleted whose folders may still be there (the page went before
     * the folder did); the next start removes them.
     */
    deleted?: string[];
    /**
     * Shows being added: listed before their folder is written, so a folder
     * left by an add that never finished can be told from one a lost index
     * no longer lists.
     */
    pending?: string[];
}

/** What the page lists for each show. */
export type ShowSummary = ShowEntry;

export const emptyIndex = (): LibraryIndex => ({
    format: 1,
    shows: [],
    openId: null,
});

/** Whether `value` looks like an index this code can read. */
export function isLibraryIndex(value: unknown): value is LibraryIndex {
    const index = value as LibraryIndex | null;
    return (
        !!index &&
        index.format === 1 &&
        Array.isArray(index.shows) &&
        index.shows.every(
            (show) =>
                typeof show?.id === "string" &&
                typeof show.name === "string" &&
                Array.isArray(show.versions),
        )
    );
}

/** The local calendar date of `at`, as "YYYY-MM-DD". */
export function localDay(at: number): string {
    const date = new Date(at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function findShow(
    index: LibraryIndex,
    id: string,
): ShowEntry | undefined {
    return index.shows.find((show) => show.id === id);
}

function updateShow(
    index: LibraryIndex,
    id: string,
    update: (show: ShowEntry) => ShowEntry,
): LibraryIndex {
    if (!findShow(index, id)) throw new Error(`No show ${id} in the library`);
    return {
        ...index,
        shows: index.shows.map((show) =>
            show.id === id ? update(show) : show,
        ),
    };
}

/** A show's name without ".dots", or "Untitled". */
export function cleanName(name: string): string {
    return name.replace(/\.dots$/i, "").trim() || "Untitled";
}

/**
 * `name`, or `name (2)`, `name (3)`… if another show already has it, so the
 * list never shows two shows the person can't tell apart.
 */
export function uniqueName(
    index: LibraryIndex,
    name: string,
    exceptId?: string,
): string {
    const base = cleanName(name);
    const taken = new Set(
        index.shows
            .filter((show) => show.id !== exceptId)
            .map((show) => show.name.toLowerCase()),
    );
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
        const candidate = `${base} (${n})`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
}

/**
 * Adds a show. `backedUp`: it came from a file the person has (so that file
 * is their backup); a new show or a duplicate has none.
 */
export function addShow(
    index: LibraryIndex,
    {
        id,
        name,
        now,
        backedUp,
    }: { id: string; name: string; now: number; backedUp: boolean },
): LibraryIndex {
    const show: ShowEntry = {
        id,
        name: uniqueName(index, name),
        createdAt: now,
        editedAt: now,
        backedUpAt: backedUp ? now : null,
        changedSinceBackup: !backedUp,
        editDays: backedUp ? [] : [localDay(now)],
        changedSinceVersion: true,
        versions: [],
    };
    return { ...index, shows: [...index.shows, show] };
}

export function renameShow(
    index: LibraryIndex,
    id: string,
    name: string,
): LibraryIndex {
    return updateShow(index, id, (show) => ({
        ...show,
        name: uniqueName(index, name, id),
    }));
}

/** Adds a copy of show `id` (without its versions) as `newId`. */
export function duplicateShow(
    index: LibraryIndex,
    id: string,
    newId: string,
    now: number,
    copyName: (name: string) => string = (name) => `${name} copy`,
): LibraryIndex {
    const show = findShow(index, id);
    if (!show) throw new Error(`No show ${id} in the library`);
    return addShow(index, {
        id: newId,
        name: copyName(show.name),
        now,
        backedUp: false,
    });
}

export function removeShow(index: LibraryIndex, id: string): LibraryIndex {
    return {
        ...index,
        shows: index.shows.filter((show) => show.id !== id),
        openId: index.openId === id ? null : index.openId,
        deleted: [...(index.deleted ?? []).filter((d) => d !== id), id],
    };
}

export function setOpen(index: LibraryIndex, id: string | null): LibraryIndex {
    if (id !== null && !findShow(index, id))
        throw new Error(`No show ${id} in the library`);
    return { ...index, openId: id };
}

/** Show `id` changed at `now` (and its stored copy now has the change). */
export function recordEdit(
    index: LibraryIndex,
    id: string,
    now: number,
): LibraryIndex {
    return updateShow(index, id, (show) => {
        const day = localDay(now);
        return {
            ...show,
            editedAt: now,
            changedSinceBackup: true,
            changedSinceVersion: true,
            editDays: show.editDays.includes(day)
                ? show.editDays
                : [...show.editDays, day],
        };
    });
}

/** Show `id` was backed up (shared or downloaded) at `now`. */
export function recordBackup(
    index: LibraryIndex,
    id: string,
    now: number,
): LibraryIndex {
    return updateShow(index, id, (show) => ({
        ...show,
        backedUpAt: now,
        changedSinceBackup: false,
        editDays: [],
    }));
}

/**
 * Whether to keep a version of `show` now. While editing: when it changed
 * since its newest version and that one is at least
 * {@link VERSION_INTERVAL_MS} old. On opening and before a restore: when it
 * changed since its newest version (otherwise that version is the same).
 */
export function shouldKeepVersion(
    show: ShowEntry,
    reason: VersionReason,
    now: number,
): boolean {
    if (!show.changedSinceVersion) return false;
    if (reason !== "edit") return true;
    const newest = show.versions.at(-1);
    return !newest || now - newest.at >= VERSION_INTERVAL_MS;
}

/** A version id unique in `show`, from its time. */
export function newVersionId(show: ShowEntry, now: number): string {
    let at = now;
    const taken = new Set(show.versions.map((version) => version.id));
    while (taken.has(String(at))) at++;
    return String(at);
}

/**
 * Adds a version to show `id`, keeping the newest {@link MAX_VERSIONS}.
 * Returns the index and the versions dropped (whose files can go).
 */
export function addVersion(
    index: LibraryIndex,
    id: string,
    version: VersionEntry,
    max = MAX_VERSIONS,
): { index: LibraryIndex; dropped: VersionEntry[] } {
    let dropped: VersionEntry[] = [];
    const next = updateShow(index, id, (show) => {
        const versions = [...show.versions, version].sort(
            (a, b) => a.at - b.at,
        );
        dropped = versions.slice(0, Math.max(0, versions.length - max));
        return {
            ...show,
            changedSinceVersion: false,
            versions: versions.slice(dropped.length),
        };
    });
    return { index: next, dropped };
}

/** Removes the oldest `count` versions of show `id` (e.g. when space runs out). */
export function dropOldestVersions(
    index: LibraryIndex,
    id: string,
    count: number,
): { index: LibraryIndex; dropped: VersionEntry[] } {
    let dropped: VersionEntry[] = [];
    const next = updateShow(index, id, (show) => {
        dropped = show.versions.slice(0, count);
        return { ...show, versions: show.versions.slice(count) };
    });
    return { index: next, dropped };
}

/**
 * Whether to remind the person to back up `show`: it has changes from at
 * least {@link BACKUP_REMINDER_EDIT_DAYS} days of editing since its last
 * backup, and no reminder came in the last day.
 */
export function backupReminderDue(
    show: Pick<ShowEntry, "changedSinceBackup" | "editDays">,
    now: number,
    lastReminderAt: number | null,
): boolean {
    if (!show.changedSinceBackup) return false;
    if (show.editDays.length < BACKUP_REMINDER_EDIT_DAYS) return false;
    return (
        lastReminderAt === null ||
        now - lastReminderAt >= BACKUP_REMINDER_INTERVAL_MS
    );
}

/** The shows for the page, most recently edited first. */
export function summaries(index: LibraryIndex): ShowSummary[] {
    return [...index.shows].sort((a, b) => b.editedAt - a.editedAt);
}

/** The newest stored file of a legacy single-show store: `<sequence>-<name>`. */
export function parseLegacyName(
    file: string,
): { sequence: number; name: string } | null {
    const match = /^(\d+)-(.+)$/.exec(file);
    if (!match) return null;
    try {
        return {
            sequence: Number(match[1]),
            name: decodeURIComponent(match[2]),
        };
    } catch {
        return null;
    }
}

/**
 * The generation number of a file written by the library's crash-safe
 * writes (`<base>.<generation>.<ext>`), or null for other files.
 */
export function parseGeneration(
    file: string,
    base: string,
    ext: string,
): number | null {
    const match = new RegExp(
        `^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)\\.${ext}$`,
    ).exec(file);
    return match ? Number(match[1]) : null;
}

/**
 * "5 minutes ago", "yesterday", "3 weeks ago": how long ago `at` was, in the
 * person's language.
 */
export function formatAgo(at: number, now: number, locale = "en"): string {
    const seconds = Math.round((at - now) / 1000);
    const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const steps: [Intl.RelativeTimeFormatUnit, number][] = [
        ["second", 60],
        ["minute", 60],
        ["hour", 24],
        ["day", 7],
        ["week", 4.35],
        ["month", 12],
        ["year", Infinity],
    ];
    let value = seconds;
    for (const [unit, size] of steps) {
        if (Math.abs(value) < size) {
            if (unit === "second") return format.format(0, "second");
            return format.format(Math.round(value), unit);
        }
        value /= size;
    }
    return format.format(Math.round(value), "year");
}

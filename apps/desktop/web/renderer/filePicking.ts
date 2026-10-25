/**
 * File pickers and saving on iPads and iPhones, where Safari differs from
 * desktop browsers. Desktop browsers keep the plain behavior.
 *
 * - Picking: iOS greys out every file whose extension it doesn't know when
 *   the picker's `accept` names one (such as `.dots`), so there the picker
 *   accepts any file and the choice is checked afterwards.
 * - Saving: a download lands in the Downloads folder without asking where;
 *   the share sheet has "Save to Files", which lets the person choose, so
 *   iOS offers that first and falls back to the download.
 */

// The iPad check is shared with the app (src/utilities/device.ts)
export { isAppleTouchDevice } from "../../src/utilities/device";

/**
 * The `accept` to give the picker. On iOS the picker greys out files it can't
 * match: custom extensions (".dots") always, and even MP3s for `audio/*` in
 * iPadOS 17's Files picker. So only `image/*` (which opens the photo picker)
 * is kept there; otherwise it accepts any file and the caller checks it.
 */
export function pickerAccept(accept: string, appleTouch: boolean): string {
    if (!appleTouch) return accept;
    return accept
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.startsWith("image/"))
        .join(",");
}

const AUDIO_EXTENSIONS = [
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
    ".aac",
    ".webm",
    ".flac",
    ".aif",
    ".aiff",
];

/**
 * Checks a file picked as music when the picker couldn't filter (iOS).
 * Returns the problem to tell the person, or null if it looks like audio.
 */
export function audioFileProblem(name: string, type: string): string | null {
    if (type.startsWith("audio/")) return null;
    if (AUDIO_EXTENSIONS.some((ext) => hasExtension(name, ext))) return null;
    return `"${name}" isn't an audio file. Choose an MP3, WAV, M4A or similar.`;
}

/** Whether `name` ends in `extension` (e.g. ".dots"), ignoring case. */
export function hasExtension(name: string, extension: string): boolean {
    return name.toLowerCase().endsWith(extension.toLowerCase());
}

/** The first bytes of every SQLite database, which a `.dots` file is. */
const SQLITE_HEADER = "SQLite format 3\u0000";

/** Whether `bytes` start like a SQLite database. */
export function looksLikeSqlite(bytes: Uint8Array): boolean {
    if (bytes.length < SQLITE_HEADER.length) return false;
    for (let i = 0; i < SQLITE_HEADER.length; i++)
        if (bytes[i] !== SQLITE_HEADER.charCodeAt(i)) return false;
    return true;
}

/**
 * Checks a file picked as a show when the picker couldn't filter (iOS), from
 * its name and first bytes. Returns the problem to tell the person, or null
 * if it is a show.
 */
export function showFileProblem(name: string, head: Uint8Array): string | null {
    if (hasExtension(name, ".dots") && looksLikeSqlite(head)) return null;
    return `"${name}" isn't an OpenMarch show. Choose a file that ends in .dots.`;
}

/**
 * Offers `file` in the share sheet ("Save to Files"). Returns "shared",
 * "cancelled" when the person closed the sheet, or "unavailable" when the
 * browser can't share it (then download it instead).
 */
export async function shareFile(
    file: File,
    nav: Navigator = navigator,
): Promise<"shared" | "cancelled" | "unavailable"> {
    if (typeof nav.share !== "function" || typeof nav.canShare !== "function")
        return "unavailable";
    if (!nav.canShare({ files: [file] })) return "unavailable";
    try {
        await nav.share({ files: [file] });
        return "shared";
    } catch (error) {
        // AbortError: the person closed the sheet. Anything else (e.g.
        // NotAllowedError when the tap was too long ago) falls back.
        return (error as Error)?.name === "AbortError"
            ? "cancelled"
            : "unavailable";
    }
}

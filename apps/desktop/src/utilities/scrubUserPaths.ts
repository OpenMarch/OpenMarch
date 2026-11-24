/**
 * Takes the person's account name out of file paths before analytics or error reports leave the
 * app. The page URL of the installed app is a file path (`file:///C:/Users/<name>/AppData/...`),
 * and error messages and logs name shows by their full path, so without this every event would
 * carry the computer's user name, which is often the person's real name.
 *
 * `C:\Users\Jane Doe\Documents` becomes `C:\Users\~\Documents`, and the same for `/Users/<name>`
 * (macOS) and `/home/<name>` (Linux), in plain, URL and JSON-escaped forms.
 */

/**
 * `Users` or `home`, the separator after it (`/`, `\` or an escaped `\\`), then the account
 * name up to the next separator, quote or line end. Spaces stay in the name: Windows accounts
 * often have them.
 */
const USER_FOLDER = /(^|[\\/])(Users|home)(\/|\\\\|\\)([^\\/"'\n\r]+)/gi;

/** Strings longer than this are skipped: inlined images and style sheets in replays. */
const MAX_LENGTH = 20_000;

/** How deep {@link scrubUserPaths} walks before leaving the rest as it is. */
const MAX_DEPTH = 40;

/** `text` with every user folder's name replaced by `~`. */
export function scrubUserPathsInString(text: string): string {
    if (text.length > MAX_LENGTH || text.startsWith("data:")) return text;
    return text.replace(USER_FOLDER, (_match, before, folder, separator) =>
        [before, folder, separator, "~"].join(""),
    );
}

/**
 * `value` with user folder names taken out of every string in it, walking arrays and plain
 * objects. Returns new arrays and objects only where something changed; never mutates `value`.
 */
export function scrubUserPaths<T>(value: T, depth = 0): T {
    if (typeof value === "string")
        return scrubUserPathsInString(value) as unknown as T;
    if (depth >= MAX_DEPTH || value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const scrubbed = scrubUserPaths(item, depth + 1);
            if (scrubbed !== item) changed = true;
            return scrubbed;
        });
        return (changed ? next : value) as T;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    let next: Record<string, unknown> | null = null;
    for (const [key, item] of Object.entries(value)) {
        const scrubbed = scrubUserPaths(item, depth + 1);
        if (scrubbed !== item) {
            next ??= { ...(value as Record<string, unknown>) };
            next[key] = scrubbed;
        }
    }
    return (next ?? value) as T;
}

import { dirname } from "node:path";

/**
 * The folder a show file dialog should start in: the open show's folder, or
 * the folder of the most recent show. Since Electron 43, a dialog without a
 * defaultPath opens in Downloads instead of the folder the OS remembered.
 *
 * Closing a show clears the active path, and the new-show wizard points it at
 * a hidden draft, so neither can be the only source.
 */
export function lastShowFolder(
    activePath: string | undefined,
    recentPaths: readonly string[],
    isDraft: (filePath: string) => boolean,
): string | undefined {
    const candidates = [activePath, ...recentPaths];
    const lastPath = candidates.find((p) => p && !isDraft(p));
    return lastPath ? dirname(lastPath) : undefined;
}

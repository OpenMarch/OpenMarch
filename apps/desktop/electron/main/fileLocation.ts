/**
 * Where a file is, in words a log line can carry: the kind of folder, never the path (see
 * `withoutPaths`). Main process only.
 */
import * as path from "path";
import { cloudSyncServiceFor } from "./cloudSyncFolder";

/** A share on another computer (Windows `\\server\share`). */
const isNetworkShare = (filePath: string) =>
    filePath.startsWith("\\\\") || filePath.startsWith("//");

/**
 * "OpenMarch's own folder", "a OneDrive folder", "a network share", "an external or network
 * drive" (macOS /Volumes) or "a local folder". `appDataDir` is OpenMarch's own folder; it
 * counts as a network share too when it is one (a school's redirected AppData).
 */
export function describeLocation(
    filePath: string,
    appDataDir: string,
    platform: NodeJS.Platform = process.platform,
): string {
    if (!filePath) return "no file";
    const p = platform === "win32" ? path.win32 : path.posix;
    const fold = (s: string) => (platform === "linux" ? s : s.toLowerCase());
    const file = fold(p.resolve(filePath));
    const own = fold(p.resolve(appDataDir));
    const share = isNetworkShare(filePath) ? ", on a network share" : "";
    if (file === own || file.startsWith(own + p.sep))
        return `OpenMarch's own folder${share}`;
    if (share) return "a network share";
    const service = cloudSyncServiceFor(filePath);
    if (service)
        return `${service.startsWith("i") ? "an" : "a"} ${service} folder`;
    if (platform === "darwin" && file.startsWith("/volumes/"))
        return "an external or network drive";
    return "a local folder";
}

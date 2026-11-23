/**
 * Whether a show sits in a folder a cloud sync app keeps in step with the cloud (OneDrive,
 * iCloud Drive, Dropbox, Google Drive, Box).
 *
 * A show file is a SQLite database. Each save makes a `-journal` file next to it and removes it
 * once the save is done. Sync apps upload, lock, or put back that file while a save runs. The
 * save then can't remove it, and the next open stops at the leftover journal
 * (`LEFTOVER_JOURNAL_STATUS`). Sync apps can also put back an older copy of the show over a
 * newer one. So the app warns when a show opens from such a folder.
 *
 * This only recognizes the folders these apps make by default. It can miss a folder synced
 * some other way, and the folder names alone are taken as the sign. Main process only.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** The sync apps recognized, as their makers name them (not translated). */
export type CloudSyncService =
    | "OneDrive"
    | "iCloud Drive"
    | "Dropbox"
    | "Google Drive"
    | "Box";

export interface CloudSyncEnvironment {
    platform: NodeJS.Platform;
    home: string;
    env: NodeJS.ProcessEnv;
    /** True when `p` exists. */
    exists: (p: string) => boolean;
    /** `p` with links followed, or `p` when that fails. */
    realpath: (p: string) => string;
}

const defaultEnvironment = (): CloudSyncEnvironment => ({
    platform: process.platform,
    home: os.homedir(),
    env: process.env,
    exists: (p) => fs.existsSync(p),
    realpath: (p) => {
        try {
            return fs.realpathSync(p);
        } catch {
            return p;
        }
    },
});

/** macOS: the folder providers add under ~/Library/CloudStorage start with these names. */
const MAC_CLOUD_STORAGE_PREFIXES: [string, CloudSyncService][] = [
    ["onedrive", "OneDrive"],
    ["dropbox", "Dropbox"],
    ["googledrive", "Google Drive"],
    ["box", "Box"],
];

/** iCloud Drive's own folder on macOS, under the home folder. */
const ICLOUD_DRIVE = ["Library", "Mobile Documents"];

/**
 * The sync app keeping `filePath`'s folder in step with the cloud, or null when it's a local
 * folder (as far as this can tell).
 */
export function cloudSyncServiceFor(
    filePath: string,
    environment: CloudSyncEnvironment = defaultEnvironment(),
): CloudSyncService | null {
    if (!filePath) return null;
    const { platform, home, env, exists, realpath } = environment;
    const p = platform === "win32" ? path.win32 : path.posix;
    // Windows and macOS file names ignore case.
    const fold = (s: string) => (platform === "linux" ? s : s.toLowerCase());
    const file = fold(p.resolve(realpath(filePath)));
    const isUnder = (dir: string | undefined) => {
        if (!dir) return false;
        const folder = fold(p.resolve(dir));
        return file.startsWith(
            folder.endsWith(p.sep) ? folder : folder + p.sep,
        );
    };
    // The folders holding the file, top first, compared ignoring case.
    const folders = p.dirname(file).toLowerCase().split(p.sep);

    if (platform === "win32") {
        // OneDrive sets these to its folders, including when it moved Documents into itself.
        if (
            isUnder(env.OneDrive) ||
            isUnder(env.OneDriveConsumer) ||
            isUnder(env.OneDriveCommercial)
        )
            return "OneDrive";
        // "OneDrive", or "OneDrive - <organization>" for a work or school account.
        if (
            folders.some((f) => f === "onedrive" || f.startsWith("onedrive - "))
        )
            return "OneDrive";
        if (folders.includes("icloud drive") || folders.includes("iclouddrive"))
            return "iCloud Drive";
        // Google Drive for desktop shows up as a drive whose top folder is "My Drive".
        if (folders[1] === "my drive" || folders[1] === "shared drives")
            return "Google Drive";
    }

    if (platform === "darwin") {
        if (isUnder(p.join(home, ...ICLOUD_DRIVE))) return "iCloud Drive";
        const cloudStorage = p.join(home, "Library", "CloudStorage");
        if (isUnder(cloudStorage)) {
            const provider = file
                .slice(fold(cloudStorage).length + 1)
                .split(p.sep)[0];
            for (const [prefix, service] of MAC_CLOUD_STORAGE_PREFIXES)
                if (provider.startsWith(prefix)) return service;
        }
        // iCloud's "Desktop & Documents Folders" keeps ~/Desktop and ~/Documents in iCloud
        // Drive, where they then show up.
        for (const name of ["Desktop", "Documents"])
            if (
                isUnder(p.join(home, name)) &&
                exists(
                    p.join(home, ...ICLOUD_DRIVE, "com~apple~CloudDocs", name),
                )
            )
                return "iCloud Drive";
    }

    // "Dropbox", or "Dropbox (<team>)" for a business account, on any system.
    if (folders.some((f) => f === "dropbox" || /^dropbox \(.+\)$/.test(f)))
        return "Dropbox";
    // Box Drive's folder in the home folder.
    if (platform !== "linux" && isUnder(p.join(home, "Box"))) return "Box";
    return null;
}

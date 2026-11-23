import { execFile } from "node:child_process";
import * as fs from "node:fs";

export type ExecFile = (
    file: string,
    args: string[],
) => Promise<{ stdout: string }>;

const execFileAsync: ExecFile = (file, args) =>
    new Promise((resolve, reject) => {
        execFile(
            file,
            args,
            { encoding: "utf8", timeout: 5000, maxBuffer: 8 * 1024 * 1024 },
            (error, stdout) => (error ? reject(error) : resolve({ stdout })),
        );
    });

/** Attributes bigger than this (as hex) aren't copied; Finder tags are tiny. */
const MAX_ATTRIBUTE_HEX_LENGTH = 1024 * 1024;

/**
 * Copies macOS extended attributes (Finder tags, comments, FinderInfo, the
 * quarantine flag) from one file to another with the system `xattr` tool.
 * Node has no extended-attribute API. A rename-replace starts the new file
 * with none, so without this a save would drop the show's Finder tags.
 *
 * Best effort: returns the names that couldn't be copied instead of throwing.
 */
export async function copyExtendedAttributes(
    from: string,
    to: string,
    exec: ExecFile = execFileAsync,
): Promise<{ copied: string[]; failed: string[] }> {
    const copied: string[] = [];
    const failed: string[] = [];
    let names: string[];
    try {
        names = (await exec("/usr/bin/xattr", [from])).stdout
            .split("\n")
            .map((name) => name.trim())
            .filter(Boolean);
    } catch {
        return { copied, failed: ["*"] };
    }
    for (const name of names) {
        try {
            const hex = (
                await exec("/usr/bin/xattr", ["-px", name, from])
            ).stdout.replace(/\s+/g, "");
            if (hex.length > MAX_ATTRIBUTE_HEX_LENGTH) {
                failed.push(name);
                continue;
            }
            await exec("/usr/bin/xattr", ["-wx", name, hex, to]);
            copied.push(name);
        } catch {
            failed.push(name);
        }
    }
    return { copied, failed };
}

/**
 * Gives the replacement file the original's permission bits and, on macOS,
 * its extended attributes. Windows file attributes (hidden, system) and ACLs
 * aren't copied: Node has no API for them.
 */
export async function copyFileMetadata(
    from: string,
    to: string,
    options: { platform?: NodeJS.Platform; exec?: ExecFile } = {},
): Promise<{ failedAttributes: string[] }> {
    const platform = options.platform ?? process.platform;
    if (platform !== "win32") {
        const { mode } = await fs.promises.stat(from);
        await fs.promises.chmod(to, mode & 0o7777);
    }
    if (platform !== "darwin") return { failedAttributes: [] };
    const { failed } = await copyExtendedAttributes(from, to, options.exec);
    return { failedAttributes: failed };
}

/**
 * Whether OpenMarch should treat the show as read-only and refuse to save
 * over it. A rename-replace only needs the folder to be writable, and on
 * Windows Node's rename even replaces read-only files, so the file's own
 * permission has to be checked.
 */
export async function isReadOnly(
    filePath: string,
    platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
    if (platform === "win32") {
        try {
            const { mode } = await fs.promises.stat(filePath);
            return (mode & 0o200) === 0;
        } catch (error) {
            // Nothing there yet (Save As to a new file): nothing to protect.
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
                return false;
            throw error;
        }
    }
    try {
        await fs.promises.access(filePath, fs.constants.W_OK);
        return false;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        return true;
    }
}

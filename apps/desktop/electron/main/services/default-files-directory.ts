import { dirname } from "node:path";

/**
 * Decide whether to persist a default files directory, enforcing write-once
 * semantics. Returns the directory to store, or null if nothing should change.
 *
 * - Returns null when a non-empty value is already stored (write-once).
 * - Returns null when newFilePath is falsy.
 * - Otherwise returns the parent directory of newFilePath.
 */
export function computeDefaultDirectoryToPersist(
    currentValue: string | undefined | null,
    newFilePath: string,
): string | null {
    if (typeof currentValue === "string" && currentValue.trim() !== "") {
        return null;
    }
    if (!newFilePath) {
        return null;
    }
    return dirname(newFilePath);
}

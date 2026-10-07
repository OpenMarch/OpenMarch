const sanitizeNewShowFilename = (name: string): string =>
    name.trim().replace(/[<>:"/\\|?*]/g, "_");

/**
 * Resolve where a new show's draft is moved on finalize.
 *
 * A `.dots` basename is kept as-is: the wizard lets users pick a filename that
 * differs from the show name (e.g. "My Show-part1.dots"). Rewriting it here
 * would send the draft to `<ShowName>.dots`, silently replacing any file
 * already at that path. Only a path without a `.dots` file gets one named
 * after the show.
 */
export function resolveFinalizeTargetPath(
    projectName: string,
    targetPath: string,
): string {
    const trimmed = targetPath.trim();
    const normalizedPath = trimmed.replace(/\\/g, "/");
    const pathParts = normalizedPath.split("/");
    const sanitized = sanitizeNewShowFilename(projectName) || "Untitled";
    const lastPart = pathParts[pathParts.length - 1] || "";

    if (!lastPart.endsWith(".dots")) {
        pathParts[pathParts.length - 1] = `${sanitized}.dots`;
        return pathParts.join("/");
    }

    return trimmed;
}

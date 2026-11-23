/**
 * Log text without file paths. Console lines become breadcrumbs on error reports, and a path
 * names the person (their account folder) and the show, so save and open lines describe where
 * a file is instead (see `describeLocation`), and errors pass through {@link withoutPaths}.
 */

/**
 * Quoted paths (Node's errors quote them), then unquoted ones to the end of the line: Windows
 * drive and UNC paths, and absolute POSIX paths after a space, colon or the start. Paths can
 * hold spaces, so an unquoted one takes the rest of the line.
 */
const PATH_PATTERNS: [RegExp, string][] = [
    // Through the last quote on the line: a name can hold a quote (Tom's Show.dots)
    [/'[^\n]*[\\/][^\n]*'/g, "'<path>'"],
    [/"[^\n]*[\\/][^\n]*"/g, '"<path>"'],
    [/[A-Za-z]:\\[^\n]*/g, "<path>"],
    [/\\\\[^\n]*/g, "<path>"],
    [/(^|[\s:=([,])\/[^\s/'"]+\/[^\n]*/gm, "$1<path>"],
];

/** `error` as one line, with every file path in its message replaced by `<path>`. */
export function withoutPaths(error: unknown): string {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    const message =
        error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : String(error);
    let text = message;
    for (const [pattern, replacement] of PATH_PATTERNS)
        text = text.replace(pattern, replacement);
    return code && !text.startsWith(code) ? `${code}: ${text}` : text;
}

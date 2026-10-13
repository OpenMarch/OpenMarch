/**
 * Stands in for `path` in the worker. Every path here is a POSIX path in the
 * worker's own file system (see `./fs.ts`).
 */

export const sep = "/";
export const delimiter = ":";

export function normalize(path: string): string {
    const absolute = path.startsWith("/");
    const parts: string[] = [];
    for (const part of path.replace(/\\/g, "/").split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") parts.pop();
        else parts.push(part);
    }
    return (absolute ? "/" : "") + parts.join("/") || (absolute ? "/" : ".");
}

export function join(...paths: string[]): string {
    return normalize(paths.filter(Boolean).join("/"));
}

export function resolve(...paths: string[]): string {
    let resolved = "";
    for (const path of paths) {
        if (!path) continue;
        resolved = path.startsWith("/") ? path : `${resolved}/${path}`;
    }
    return normalize(resolved.startsWith("/") ? resolved : `/${resolved}`);
}

export function dirname(path: string): string {
    const normalized = normalize(path);
    const index = normalized.lastIndexOf("/");
    if (index < 0) return ".";
    return index === 0 ? "/" : normalized.slice(0, index);
}

export function basename(path: string, ext?: string): string {
    const base = normalize(path).split("/").pop() ?? "";
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}

export function extname(path: string): string {
    const base = basename(path);
    const index = base.lastIndexOf(".");
    return index > 0 ? base.slice(index) : "";
}

export const isAbsolute = (path: string) => path.startsWith("/");

const base = {
    sep,
    delimiter,
    normalize,
    join,
    resolve,
    dirname,
    basename,
    extname,
    isAbsolute,
};
export const posix = base;
const path = { ...base, posix: base };
export default path;

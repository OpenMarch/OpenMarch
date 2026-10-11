/** TEMPORARY (see ../README.md). A POSIX `path` for the web build's virtual files. */
export const sep = "/";
export const delimiter = ":";

export function normalize(path: string) {
    const absolute = path.startsWith("/");
    const parts: string[] = [];
    for (const part of path.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") parts.pop();
        else parts.push(part);
    }
    return (absolute ? "/" : "") + parts.join("/") || (absolute ? "/" : ".");
}

export const join = (...parts: string[]) =>
    normalize(parts.filter(Boolean).join("/"));
export const resolve = (...parts: string[]) => {
    let path = "";
    for (const part of parts)
        path = part.startsWith("/") ? part : `${path}/${part}`;
    return normalize(path.startsWith("/") ? path : `/${path}`);
};
export const isAbsolute = (path: string) => path.startsWith("/");
export const dirname = (path: string) => {
    const index = normalize(path).lastIndexOf("/");
    return index <= 0
        ? path.startsWith("/")
            ? "/"
            : "."
        : normalize(path).slice(0, index);
};
export const basename = (path: string, ext?: string) => {
    const base = normalize(path).split("/").pop() ?? "";
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
};
export const extname = (path: string) => {
    const base = basename(path);
    const index = base.lastIndexOf(".");
    return index <= 0 ? "" : base.slice(index);
};
export const relative = (from: string, to: string) => {
    const a = resolve(from).split("/").filter(Boolean);
    const b = resolve(to).split("/").filter(Boolean);
    while (a.length && b.length && a[0] === b[0]) {
        a.shift();
        b.shift();
    }
};
export const parse = (path: string) => ({
    root: path.startsWith("/") ? "/" : "",
    dir: dirname(path),
    base: basename(path),
    ext: extname(path),
    name: basename(path, extname(path)),
});

const path = {
    sep,
    delimiter,
    normalize,
    join,
    resolve,
    isAbsolute,
    dirname,
    basename,
    extname,
    relative,
    parse,
};
export const posix = path;
export const win32 = path;
export default path;

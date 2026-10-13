/**
 * Stands in for `fs` in the worker. There are two kinds of file: the app's
 * migrations, bundled read-only under `MIGRATIONS_FOLDER`, and shows, which
 * live in `./sqlite.ts`. Anything else a caller asks for doesn't exist.
 */
import { databaseExists, deleteDatabase } from "./sqlite";

export const MIGRATIONS_FOLDER = "/migrations";

const bundled = import.meta.glob<string>(
    [
        "../../electron/database/migrations/*.sql",
        "../../electron/database/migrations/meta/_journal.json",
    ],
    { query: "?raw", import: "default", eager: true },
);

const files = new Map<string, string>(
    Object.entries(bundled).map(([key, text]) => [
        key.replace("../../electron/database/migrations", MIGRATIONS_FOLDER),
        text,
    ]),
);

const normalize = (path: string) =>
    String(path).replace(/\\/g, "/").replace(/\/+$/, "");

const isFolder = (path: string) => {
    if (!normalize(path)) return false;
    const prefix = `${normalize(path)}/`;
    for (const file of files.keys()) if (file.startsWith(prefix)) return true;
    return false;
};

const notFound = (path: string) =>
    Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
        code: "ENOENT",
    });

export const constants = {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
    COPYFILE_EXCL: 1,
};

export function existsSync(path: string) {
    const p = normalize(path);
    return files.has(p) || isFolder(p) || databaseExists(p);
}

export function accessSync(path: string) {
    if (!existsSync(path)) throw notFound(path);
}

export function readFileSync(path: string, _options?: unknown) {
    const text = files.get(normalize(path));
    if (text === undefined) throw notFound(path);
    return text;
}

export function readdirSync(path: string) {
    const prefix = `${normalize(path)}/`;
    const names = new Set<string>();
    for (const file of files.keys())
        if (file.startsWith(prefix))
            names.add(file.slice(prefix.length).split("/")[0]);
    return [...names];
}

function stat(path: string) {
    const p = normalize(path);
    const folder = isFolder(p);
    if (!folder && !files.has(p) && !databaseExists(p)) throw notFound(path);
    return {
        isFile: () => !folder,
        isDirectory: () => folder,
        isSymbolicLink: () => false,
        size: files.get(p)?.length ?? 0,
        mtimeMs: 0,
        birthtime: new Date(0),
    };
}

export const statSync = stat;
export const lstatSync = stat;

export function rmSync(path: string) {
    deleteDatabase(normalize(path));
}
export const unlinkSync = rmSync;

const unsupported = (name: string) => () => {
    throw new Error(`fs.${name} is not available in the web build`);
};
export const writeFileSync = unsupported("writeFileSync");
export const mkdirSync = unsupported("mkdirSync");
export const copyFileSync = unsupported("copyFileSync");
export const renameSync = unsupported("renameSync");
export const readFile = unsupported("readFile");
export const createReadStream = unsupported("createReadStream");
export const createWriteStream = unsupported("createWriteStream");
export const promises = {};

const fs = {
    constants,
    existsSync,
    accessSync,
    readFileSync,
    readdirSync,
    statSync,
    lstatSync,
    rmSync,
    unlinkSync,
    writeFileSync,
    mkdirSync,
    copyFileSync,
    renameSync,
    readFile,
    createReadStream,
    createWriteStream,
    promises,
};
export default fs;

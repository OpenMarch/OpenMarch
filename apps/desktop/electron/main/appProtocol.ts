/**
 * Serves the packaged renderer from `app://openmarch` (fork #1011; ADR 0010). `file://`
 * responses carry no headers, and a worker loaded by URL takes its CSP only from its own
 * response, so under `file://` every worker ran with no policy. Here each response gets its
 * policy from the app's table (`src/security/appCsp.ts`).
 *
 * The scheme is internal: the OS deep link stays `openmarch:` (auth). It is registered as
 * standard and secure, without `bypassCSP`.
 */
import { net, protocol } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { cspFor, DESKTOP_PAGE_CSP } from "../../src/security/appCsp";

export const APP_SCHEME = "app";
export const APP_HOST = "openmarch";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
/** The editor's page */
export const APP_INDEX_URL = `${APP_ORIGIN}/index.html`;
/**
 * An empty page on the app's origin, for main to reach the renderer's storage without starting
 * the app (`rendererStorageMove.ts`). No file has this name.
 */
export const APP_BLANK_URL = `${APP_ORIGIN}/.openmarch-blank`;

/** Call before the app is ready. */
export function registerAppScheme() {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: APP_SCHEME,
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                // Module scripts load in CORS mode
                corsEnabled: true,
                // Range requests for media
                stream: true,
                codeCache: true,
            },
        },
    ]);
}

/**
 * The file under `root` an `app://openmarch/…` URL names, or null for anything outside it or
 * not on the app's origin. `/` is the editor's page.
 */
export function appFilePath(url: string, root: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST)
        return null;
    let pathname: string;
    try {
        pathname = decodeURIComponent(parsed.pathname);
    } catch {
        return null;
    }
    // Encoded separators and NULs never name an app file
    if (/[\\\0]/.test(pathname)) return null;
    const relative = pathname.replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, relative);
    const inside = path.relative(root, file);
    if (!inside || inside.startsWith("..") || path.isAbsolute(inside))
        return null;
    return file;
}

/**
 * Types the module loader checks strictly, and media a range response needs; the rest come
 * from Electron's file loader
 */
const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
};

const BLANK_PAGE = "<!doctype html><title>OpenMarch</title>";

function withPolicy(url: string, response: Response, file?: string): Response {
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", cspFor(url, DESKTOP_PAGE_CSP));
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Accept-Ranges", "bytes");
    const type = file && CONTENT_TYPES[path.extname(file).toLowerCase()];
    if (type) headers.set("Content-Type", type);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

/**
 * The bytes a `Range` header asks for, inclusive, or "unsatisfiable"; null when it isn't a
 * single byte range (the whole file is sent then).
 */
export function byteRange(
    header: string | null,
    size: number,
): { start: number; end: number } | "unsatisfiable" | null {
    const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2])) return null;
    let start: number;
    let end: number;
    if (!match[1]) {
        // The last n bytes
        start = Math.max(0, size - Number(match[2]));
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }
    return start > end || start >= size ? "unsatisfiable" : { start, end };
}

/**
 * Part of a file, for media seeking. Electron's file loader honors `Range` but answers 200
 * with no `Content-Range`, which a media element reads as the whole file.
 */
async function partOf(file: string, header: string): Promise<Response | null> {
    const { size } = await fs.promises.stat(file);
    const range = byteRange(header, size);
    if (!range) return null;
    if (range === "unsatisfiable")
        return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${size}` },
        });
    const { start, end } = range;
    const body = Readable.toWeb(
        fs.createReadStream(file, { start, end }),
    ) as ReadableStream<Uint8Array>;
    return new Response(body, {
        status: 206,
        headers: {
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(end - start + 1),
        },
    });
}

const notFound = () =>
    new Response("Not found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

/** Serves `app://openmarch` from `root` (the built renderer). Call once the app is ready. */
export function handleAppScheme(root: string) {
    protocol.handle(APP_SCHEME, async (request) => {
        if (request.url.split(/[?#]/)[0] === APP_BLANK_URL)
            return withPolicy(
                request.url,
                new Response(BLANK_PAGE, {
                    headers: { "Content-Type": "text/html; charset=utf-8" },
                }),
            );
        const file = appFilePath(request.url, root);
        if (!file) return notFound();
        const range = request.headers.get("Range");
        try {
            const response =
                (range && (await partOf(file, range))) ||
                // Electron's own file loader, which reads inside the asar archive
                (await net.fetch(pathToFileURL(file).toString()));
            return withPolicy(request.url, response, file);
        } catch {
            return notFound();
        }
    });
}

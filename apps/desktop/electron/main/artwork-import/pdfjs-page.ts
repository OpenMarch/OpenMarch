/**
 * The Electron-free half of the PDF renderer (owner decision Q33,
 * 2026-10-11): what the hidden pdf.js window is served, and the two
 * functions it runs on a document. `electron-pdf-renderer.ts` owns the
 * window; this file has no Electron import, so tests can run the same
 * page functions against pdfjs-dist's Node build.
 *
 * The window loads a private origin, `https://pdf-renderer.invalid`, that
 * exists only inside its own in-memory session: main answers every request
 * from an allow-list of pdf.js files on disk (read through the asar), the
 * page script below, and the one PDF being read. Nothing else resolves, so
 * the page can't reach the network or the file system.
 */
// cspell:words JBIG cmaps bcmap iccs
import { readFile } from "node:fs/promises";
import path from "node:path";

/** The renderer window's private origin. `.invalid` never resolves in DNS. */
export const PDF_RENDERER_ORIGIN = "https://pdf-renderer.invalid";

/** pdf.js's legacy build, which polyfills what Electron's Chromium may lack. */
const PDFJS_MODULE = "legacy/build/pdf.min.mjs";
const PDFJS_WORKER = "legacy/build/pdf.worker.min.mjs";

/**
 * The pdf.js files the window may load, relative to the `pdfjs-dist`
 * package root: the library, its worker, and the data it fetches on demand
 * (CMaps, standard fonts, the JPEG 2000, JBIG2 and color-management wasm,
 * ICC profiles). One path segment after the folder, so no `..`.
 */
const PDFJS_ALLOWED =
    /^(?:legacy\/build\/pdf(?:\.worker)?\.min\.mjs|cmaps\/[\w.-]+\.bcmap|standard_fonts\/[\w.-]+\.(?:pfb|ttf)|wasm\/[\w.-]+\.(?:wasm|js)|iccs\/[\w.-]+\.icc)$/;

/**
 * Locks the page to its own origin: scripts and workers from main's
 * allow-list (wasm for pdf.js's decoders), fetches only back to the same
 * origin, no frames, forms, plugins or navigation targets.
 */
export const PDF_RENDERER_CSP = [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: blob:",
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
].join("; ");

export interface PdfPageSize {
    readonly widthPt: number;
    readonly heightPt: number;
}

/** The slice of a pdf.js `PDFDocumentProxy` the page functions use. */
export interface PdfjsDocumentLike {
    readonly numPages: number;
    getPage(pageNumber: number): Promise<PdfjsPageLike>;
}

export interface PdfjsPageLike {
    getViewport(params: { scale: number }): { width: number; height: number };
    render(params: {
        canvasContext: CanvasRenderingContext2D;
        viewport: unknown;
        transform: number[];
        background: string;
    }): { promise: Promise<void> };
    cleanup(): unknown;
}

/**
 * Every page's displayed size in points: the crop box after `/Rotate` and
 * `/UserUnit` (a scale-1 pdf.js viewport).
 *
 * Runs inside the renderer window as source text (see `pdfRendererScript`),
 * so it must stay self-contained: no imports, no outside names.
 */
export async function pdfjsPageSizes(
    doc: PdfjsDocumentLike,
): Promise<PdfPageSize[]> {
    const sizes: PdfPageSize[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        sizes.push({ widthPt: viewport.width, heightPt: viewport.height });
        page.cleanup();
    }
    return sizes;
}

/**
 * Renders page `index` (0-based) to exactly `width` × `height` pixels,
 * transparent where the page has nothing, as a PNG data URL.
 *
 * Runs inside the renderer window as source text, like `pdfjsPageSizes`.
 */
export async function pdfjsRenderPage(
    doc: PdfjsDocumentLike,
    index: number,
    width: number,
    height: number,
): Promise<string> {
    const page = await doc.getPage(index + 1);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    // Hand pdf.js a context we made: given only the canvas, it makes an
    // opaque (`alpha: false`) one and the page's empty areas turn black.
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("No canvas to render the page on.");
    await page.render({
        canvasContext: context,
        viewport,
        // Stretch the scale-1 viewport onto the canvas. The pipeline asks
        // for the page's own aspect, so this only absorbs pixel rounding.
        transform: [
            width / viewport.width,
            0,
            0,
            height / viewport.height,
            0,
            0,
        ],
        background: "rgba(0,0,0,0)",
    }).promise;
    page.cleanup();
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("The page couldn't be encoded as PNG.");
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/** The renderer window's HTML: just the page script. */
export const PDF_RENDERER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>PDF renderer</title>
<script type="module" src="/renderer.mjs"></script></head><body></body></html>`;

/**
 * The renderer window's module script. It puts `omPdf` on the page for
 * main's `executeJavaScript` calls; each call answers `{ ok, value }` or
 * `{ ok: false, error }` so failures keep their message.
 */
export function pdfRendererScript(): string {
    return `import * as pdfjs from "/pdfjs/${PDFJS_MODULE}";
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/${PDFJS_WORKER}";
const pageSizes = (${pdfjsPageSizes.toString()});
const renderPage = (${pdfjsRenderPage.toString()});
const docs = new Map();
let nextId = 1;
const answer = async (work) => {
    try {
        return { ok: true, value: await work() };
    } catch (error) {
        return { ok: false, error: String((error && error.message) || error) };
    }
};
globalThis.omPdf = {
    open: (token) => answer(async () => {
        const response = await fetch("/doc/" + encodeURIComponent(token));
        if (!response.ok) throw new Error("The PDF wasn't handed over.");
        const data = new Uint8Array(await response.arrayBuffer());
        const task = pdfjs.getDocument({
            data,
            cMapUrl: "/pdfjs/cmaps/",
            cMapPacked: true,
            standardFontDataUrl: "/pdfjs/standard_fonts/",
            wasmUrl: "/pdfjs/wasm/",
            iccUrl: "/pdfjs/iccs/",
            enableXfa: false,
            isEvalSupported: false,
        });
        const doc = await task.promise;
        const id = nextId++;
        docs.set(id, { task, doc });
        return { id, pages: await pageSizes(doc) };
    }),
    render: (id, index, width, height) => answer(() => {
        const entry = docs.get(id);
        if (!entry) throw new Error("That PDF is closed.");
        return renderPage(entry.doc, index, width, height);
    }),
    close: (id) => answer(async () => {
        const entry = docs.get(id);
        docs.delete(id);
        if (entry) await entry.task.destroy();
        return null;
    }),
};
globalThis.omPdfReady = true;
`;
}

export type PdfRendererRoute =
    | { readonly kind: "html" }
    | { readonly kind: "script" }
    | { readonly kind: "pdfjs"; readonly file: string }
    | { readonly kind: "doc"; readonly token: string }
    | { readonly kind: "none" };

/** Maps a request URL to what main serves for it; anything else is `none`. */
export function routePdfRendererRequest(url: string): PdfRendererRoute {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return { kind: "none" };
    }
    if (parsed.origin !== PDF_RENDERER_ORIGIN) return { kind: "none" };
    const pathname = parsed.pathname;
    if (pathname === "/" || pathname === "/index.html") return { kind: "html" };
    if (pathname === "/renderer.mjs") return { kind: "script" };
    if (pathname.startsWith("/pdfjs/")) {
        const file = pathname.slice("/pdfjs/".length);
        return PDFJS_ALLOWED.test(file)
            ? { kind: "pdfjs", file }
            : { kind: "none" };
    }
    const doc = /^\/doc\/([0-9a-f]{32})$/.exec(pathname);
    if (doc) return { kind: "doc", token: doc[1] };
    return { kind: "none" };
}

const CONTENT_TYPES: Record<string, string> = {
    ".mjs": "text/javascript",
    ".js": "text/javascript",
    ".wasm": "application/wasm",
};

export function pdfjsContentType(file: string): string {
    return (
        CONTENT_TYPES[path.extname(file).toLowerCase()] ??
        "application/octet-stream"
    );
}

/** Reads an allow-listed pdf.js file from the package root. */
export async function readPdfjsFile(
    pdfjsRoot: string,
    file: string,
): Promise<Uint8Array> {
    if (!PDFJS_ALLOWED.test(file)) {
        throw new Error(`Not a pdf.js file the renderer serves: ${file}`);
    }
    return new Uint8Array(await readFile(path.join(pdfjsRoot, file)));
}

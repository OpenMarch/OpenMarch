// @vitest-environment node
/**
 * The Electron-free half of the app's PDF renderer. The page functions run
 * here against pdfjs-dist's Node build, the same functions the hidden window
 * runs as source text. Rendering needs a canvas, which only the window has,
 * so it is checked by hand in Electron (see the C1.8 progress log).
 */
// cspell:words openjpeg cmaps bcmap qcms jbig Foxit iccs CGATS
import { createRequire } from "node:module";
import path from "node:path";
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import {
    PDF_RENDERER_CSP,
    PDF_RENDERER_ORIGIN,
    pdfjsContentType,
    pdfjsPageSizes,
    pdfRendererScript,
    readPdfjsFile,
    routePdfRendererRequest,
    type PdfjsDocumentLike,
} from "../pdfjs-page";

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));

/** Letter portrait; 11 × 17 in landscape; letter with /Rotate 90. */
async function threePagePdf(): Promise<Uint8Array> {
    const doc = new PDFDocument({ size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve) => doc.on("end", resolve));
    doc.rect(72, 72, 200, 200).fill("#2d4f9e");
    doc.addPage({ size: [17 * 72, 11 * 72] });
    doc.addPage({ size: "LETTER" });
    // pdfkit has no option for /Rotate; set it on the page dictionary.
    (
        doc as unknown as { page: { dictionary: { data: object } } }
    ).page.dictionary.data = {
        ...(doc as unknown as { page: { dictionary: { data: object } } }).page
            .dictionary.data,
        Rotate: 90,
    };
    doc.end();
    await done;
    return new Uint8Array(Buffer.concat(chunks));
}

async function loadPdfjs() {
    return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as typeof import("pdfjs-dist");
}

describe("pdf.js page functions (Node build)", () => {
    it("read every page's size in points, after /Rotate", async () => {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ data: await threePagePdf() });
        try {
            const doc = await task.promise;
            expect(
                await pdfjsPageSizes(doc as unknown as PdfjsDocumentLike),
            ).toEqual([
                { widthPt: 612, heightPt: 792 },
                { widthPt: 1224, heightPt: 792 },
                { widthPt: 792, heightPt: 612 },
            ]);
        } finally {
            await task.destroy();
        }
    });

    it("refuse a file that isn't a PDF", async () => {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({
            data: new TextEncoder().encode("%PDF-1.4 not really"),
        });
        await expect(task.promise).rejects.toThrow();
        await task.destroy();
    });
});

describe("renderer window routes", () => {
    const at = (p: string) => routePdfRendererRequest(PDF_RENDERER_ORIGIN + p);

    it("serve the page, its script, allow-listed pdf.js files and docs", () => {
        expect(at("/")).toEqual({ kind: "html" });
        expect(at("/renderer.mjs")).toEqual({ kind: "script" });
        expect(at("/pdfjs/legacy/build/pdf.min.mjs")).toEqual({
            kind: "pdfjs",
            file: "legacy/build/pdf.min.mjs",
        });
        expect(at("/pdfjs/legacy/build/pdf.worker.min.mjs").kind).toBe("pdfjs");
        expect(at("/pdfjs/cmaps/78-EUC-H.bcmap").kind).toBe("pdfjs");
        expect(
            at("/pdfjs/standard_fonts/LiberationSans-Regular.ttf").kind,
        ).toBe("pdfjs");
        expect(at("/pdfjs/wasm/openjpeg.wasm").kind).toBe("pdfjs");
        expect(at(`/doc/${"ab".repeat(16)}`)).toEqual({
            kind: "doc",
            token: "ab".repeat(16),
        });
    });

    it("refuse everything else", () => {
        for (const url of [
            "https://example.com/",
            "http://pdf-renderer.invalid/",
            `${PDF_RENDERER_ORIGIN}/pdfjs/../package.json`,
            `${PDF_RENDERER_ORIGIN}/pdfjs/%2e%2e/package.json`,
            `${PDF_RENDERER_ORIGIN}/pdfjs/cmaps/../../secret.bcmap`,
            `${PDF_RENDERER_ORIGIN}/pdfjs/web/viewer.mjs`,
            `${PDF_RENDERER_ORIGIN}/pdfjs/build/pdf.mjs`,
            `${PDF_RENDERER_ORIGIN}/doc/not-a-token`,
            `${PDF_RENDERER_ORIGIN}/elsewhere`,
            "not a url",
        ]) {
            expect(routePdfRendererRequest(url), url).toEqual({ kind: "none" });
        }
    });

    it("find every file the page script and pdf.js ask for", async () => {
        for (const file of [
            "legacy/build/pdf.min.mjs",
            "legacy/build/pdf.worker.min.mjs",
            "wasm/openjpeg.wasm",
            "wasm/qcms_bg.wasm",
            "wasm/jbig2.wasm",
            "standard_fonts/LiberationSans-Regular.ttf",
            "standard_fonts/FoxitSerif.pfb",
            "cmaps/78-EUC-H.bcmap",
            "iccs/CGATS001Compat-v2-micro.icc",
        ]) {
            const bytes = await readPdfjsFile(pdfjsRoot, file);
            expect(bytes.length, file).toBeGreaterThan(0);
        }
        await expect(
            readPdfjsFile(pdfjsRoot, "package.json"),
        ).rejects.toThrow();
        expect(pdfjsContentType("legacy/build/pdf.min.mjs")).toBe(
            "text/javascript",
        );
        expect(pdfjsContentType("wasm/openjpeg.wasm")).toBe("application/wasm");
    });

    it("lock the page to its own origin", () => {
        expect(PDF_RENDERER_CSP).toContain("default-src 'none'");
        expect(PDF_RENDERER_CSP).toContain("connect-src 'self'");
        const script = pdfRendererScript();
        expect(script).toContain('from "/pdfjs/legacy/build/pdf.min.mjs"');
        expect(script).toContain("globalThis.omPdf");
    });
});

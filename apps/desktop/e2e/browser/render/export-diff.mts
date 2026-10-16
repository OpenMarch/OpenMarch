/**
 * Pairs two drill chart captures from `export-compare.spec.mts` (#208):
 *
 *     node e2e/browser/render/export-diff.mts <folder> [before] [after] [individual]
 *
 * `<folder>/<before>/<show>/` and `<folder>/<after>/<show>/` hold the SVG
 * pages (defaults `before` and `after`). For every full chart (`MAIN-*`) and
 * the first `individual` (default 3) marchers' charts it writes, to
 * `<folder>/diff/`:
 *
 * - `<show>-<chart>-svg.png`: before | after | diff, as Chromium draws the
 *   SVG at 2×;
 * - `<show>-<chart>-svg-aligned.png`: the same with "after" moved half a
 *   pixel right and down (exports before #206 drew half a pixel off), so
 *   only content changes show;
 * - `<show>-MAIN-<page>-pdf.png`: the full charts drawn into a PDF page as
 *   the PDF export does (pdfkit and svg-to-pdfkit, letter landscape), then
 *   drawn by pdf.js at 2×;
 * - `summary.tsv`: the share of pixels that differ, per image.
 *
 * The field image placeholder is filled in with `field-image.png`, the image
 * `export-compare.spec.mts` gives `part1-image`, as the PDF export fills it
 * in with the show's.
 *
 * Diff colors: red only in before, blue only in after, gray the same.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium, type Page } from "@playwright/test";
import PDFDocument from "pdfkit";
// @ts-expect-error svg-to-pdfkit has no types
import SVGtoPDF from "svg-to-pdfkit";

const [
    folder,
    beforeLabel = "before",
    afterLabel = "after",
    marchersArg = "3",
] = process.argv.slice(2);
if (!folder)
    throw new Error(
        "usage: export-diff.mts <folder> [before] [after] [marchers]",
    );
/** How many marchers' individual charts to compare. */
const individualCount = Number(marchersArg);
const out = path.join(folder, "diff");
fs.mkdirSync(out, { recursive: true });
const FIELD_IMAGE = `data:image/png;base64,${fs
    .readFileSync(new URL("./field-image.png", import.meta.url))
    .toString("base64")}`;
const withImage = (svg: string) =>
    svg.replace("OPENMARCH_FIELD_IMAGE_PLACEHOLDER", FIELD_IMAGE);
const require = createRequire(import.meta.url);
const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json"));

/** The letter-landscape page with the field where the PDF export puts it. */
function pdfOf(svg: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "LETTER", layout: "landscape" });
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        const margin = 20;
        SVGtoPDF(doc, svg, margin, 65, {
            height: 425,
            width: doc.page.width - 2 * margin,
            preserveAspectRatio: "xMidYMid meet",
        });
        doc.end();
    });
}

/** Draws an SVG, or a PDF's first page, in the page and returns its pixels as a PNG. */
async function draw(
    page: Page,
    input: { svg: string; shift: number } | { pdf: Buffer },
): Promise<string> {
    return page.evaluate(
        async (input) => {
            let canvas: HTMLCanvasElement;
            if ("svg" in input) {
                const img = new Image();
                img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(input.svg)))}`;
                await img.decode();
                canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth * 2;
                canvas.height = img.naturalHeight * 2;
                const g = canvas.getContext("2d")!;
                g.fillStyle = "white";
                g.fillRect(0, 0, canvas.width, canvas.height);
                g.drawImage(
                    img,
                    input.shift * 2,
                    input.shift * 2,
                    canvas.width,
                    canvas.height,
                );
            } else {
                const pdfjs = (window as unknown as { pdfjsLib: any }).pdfjsLib;
                const bytes = Uint8Array.from(atob(input.pdf), (c) =>
                    c.charCodeAt(0),
                );
                const doc = await pdfjs.getDocument({ data: bytes }).promise;
                const p = await doc.getPage(1);
                const viewport = p.getViewport({ scale: 2 });
                canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await p.render({
                    canvasContext: canvas.getContext("2d")!,
                    viewport,
                }).promise;
            }
            return canvas.toDataURL("image/png").split(",")[1]!;
        },
        "pdf" in input ? { pdf: input.pdf.toString("base64") } : input,
    );
}

/** before | after | diff, and the share of pixels that differ. */
async function compose(page: Page, a: string, b: string) {
    return page.evaluate(
        async ([a, b]) => {
            const load = (s: string) => {
                const img = new Image();
                img.src = `data:image/png;base64,${s}`;
                return img.decode().then(() => img);
            };
            const [ia, ib] = await Promise.all([load(a), load(b)]);
            const w = Math.min(ia.width, ib.width);
            const h = Math.min(ia.height, ib.height);
            const read = (img: HTMLImageElement) => {
                const c = new OffscreenCanvas(w, h);
                const g = c.getContext("2d")!;
                g.drawImage(img, 0, 0);
                return g.getImageData(0, 0, w, h).data;
            };
            const da = read(ia);
            const db = read(ib);
            const diff = new ImageData(w, h);
            let differing = 0;
            for (let i = 0; i < da.length; i += 4) {
                const la = (da[i]! + da[i + 1]! + da[i + 2]!) / 3;
                const lb = (db[i]! + db[i + 1]! + db[i + 2]!) / 3;
                const off = Math.max(
                    Math.abs(da[i]! - db[i]!),
                    Math.abs(da[i + 1]! - db[i + 1]!),
                    Math.abs(da[i + 2]! - db[i + 2]!),
                );
                if (off > 24) {
                    differing++;
                    diff.data.set(
                        la < lb ? [220, 0, 0, 255] : [0, 90, 255, 255],
                        i,
                    );
                } else {
                    const v = 255 - (255 - la) * 0.25;
                    diff.data.set([v, v, v, 255], i);
                }
            }
            const c = new OffscreenCanvas(w * 3, h);
            const g = c.getContext("2d")!;
            g.drawImage(ia, 0, 0);
            g.drawImage(ib, w, 0);
            g.putImageData(diff, w * 2, 0);
            const blob = await c.convertToBlob({ type: "image/png" });
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let s = "";
            for (let i = 0; i < bytes.length; i += 0x8000)
                s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            return { png: btoa(s), share: differing / (w * h) };
        },
        [a, b] as const,
    );
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("http://pdfjs.local/**", (route) =>
    route.fulfill({
        path: path.join(pdfjsDir, new URL(route.request().url()).pathname),
        contentType: "text/javascript",
    }),
);
await page.setContent(`<script type="module">
    import * as pdfjsLib from "http://pdfjs.local/build/pdf.mjs";
    pdfjsLib.GlobalWorkerOptions.workerSrc = "http://pdfjs.local/build/pdf.worker.mjs";
    window.pdfjsLib = pdfjsLib;
</script>`);
await page.waitForFunction(() => "pdfjsLib" in window);

const summary: string[] = ["image\tchanged pixels"];
const write = async (name: string, a: string, b: string) => {
    const { png, share } = await compose(page, a, b);
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(png, "base64"));
    summary.push(`${name}\t${(share * 100).toFixed(2)}%`);
};

for (const show of fs.readdirSync(path.join(folder, afterLabel))) {
    const dir = (label: string) => path.join(folder, label, show);
    const files = fs
        .readdirSync(dir(afterLabel))
        .filter((f) => f.endsWith(".svg"));
    // Individual charts captured on both sides
    const drill = [
        ...new Set(
            files
                .filter(
                    (f) =>
                        !f.startsWith("MAIN-") &&
                        fs.existsSync(path.join(dir(beforeLabel), f)),
                )
                .map((f) => f.split("-")[0]!),
        ),
    ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const chosen = new Set(["MAIN", ...drill.slice(0, individualCount)]);
    for (const file of files.sort()) {
        if (!chosen.has(file.split("-")[0]!)) continue;
        const before = path.join(dir(beforeLabel), file);
        if (!fs.existsSync(before)) {
            summary.push(`${show}-${file}\tmissing before`);
            continue;
        }
        const a = withImage(fs.readFileSync(before, "utf8"));
        const b = withImage(
            fs.readFileSync(path.join(dir(afterLabel), file), "utf8"),
        );
        const name = `${show}-${file.replace(/\.svg$/, "")}`;
        const drawnA = await draw(page, { svg: a, shift: 0 });
        await write(
            `${name}-svg`,
            drawnA,
            await draw(page, { svg: b, shift: 0 }),
        );
        await write(
            `${name}-svg-aligned`,
            drawnA,
            await draw(page, { svg: b, shift: 0.5 }),
        );
        if (file.startsWith("MAIN-"))
            await write(
                `${name}-pdf`,
                await draw(page, { pdf: await pdfOf(a) }),
                await draw(page, { pdf: await pdfOf(b) }),
            );
    }
    process.stdout.write(`${show} done\n`);
}
fs.writeFileSync(path.join(out, "summary.tsv"), summary.join("\n") + "\n");
await browser.close();

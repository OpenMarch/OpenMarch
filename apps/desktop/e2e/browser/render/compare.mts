import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";

/** Shared by the render comparison specs here (see README.md). */

export type View = { zoom: number; pan: { x: number; y: number } };

export const field = (page: Page) => page.getByTestId("fieldCanvas").first();

/** Waits for two frames, so the field has drawn what it was last given. */
export const settle = (page: Page) =>
    page.evaluate(
        () =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve()),
                ),
            ),
    );

// Outside `playwright-report`, which each run clears
export const OUT = path.resolve(
    process.env.RENDER_OUT ?? path.join(os.tmpdir(), "openmarch-field-render"),
);
/** This run's name: its captures go to `OUT/<LABEL>`. */
export const LABEL = process.env.RENDER_LABEL ?? "after";
/** An earlier run's name, to compare each capture with (`OUT/<BASE>`). */
export const BASE = process.env.RENDER_BASE;

/**
 * Saves a capture as `OUT/<LABEL>/<name>.png`. With `RENDER_BASE` set and
 * the same capture in that run, also writes `OUT/compare/<name>.png`
 * (before | after | diff) and a line in `OUT/compare/summary.tsv`:
 * `columns`, then the pixels that differ.
 */
export async function saveCapture(
    page: Page,
    name: string,
    png: Buffer,
    columns: readonly string[],
) {
    const folder = path.join(OUT, LABEL);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, `${name}.png`), png);
    if (!BASE) return;
    const before = path.join(OUT, BASE, `${name}.png`);
    if (!fs.existsSync(before)) return;
    const composed = await compose(page, fs.readFileSync(before), png, [
        BASE,
        LABEL,
    ]);
    const compare = path.join(OUT, "compare");
    fs.mkdirSync(compare, { recursive: true });
    fs.writeFileSync(path.join(compare, `${name}.png`), composed.png);
    fs.appendFileSync(
        path.join(compare, "summary.tsv"),
        `${[...columns, composed.differing, composed.total, `${((100 * composed.differing) / composed.total).toFixed(2)}%`].join("\t")}\n`,
    );
}

/**
 * Builds `[before | after | diff]` in the page from two PNGs, and how many
 * pixels differ. The diff shows the first image faded, with pixels that have
 * no match (within 24 in every channel) within one pixel in the other image
 * in red (the second darker) or blue (lighter).
 */
export async function compose(
    page: Page,
    before: Buffer,
    after: Buffer,
    labels: readonly [string, string] = ["before", "after"],
) {
    const result = await page.evaluate(
        async ([a, b, labelA, labelB]) => {
            const load = async (b64: string) => {
                const blob = await (
                    await fetch(`data:image/png;base64,${b64}`)
                ).blob();
                return createImageBitmap(blob);
            };
            const [fa, th] = await Promise.all([load(a), load(b)]);
            const w = Math.min(fa.width, th.width);
            const h = Math.min(fa.height, th.height);
            const read = (img: ImageBitmap) => {
                const c = new OffscreenCanvas(w, h);
                const g = c.getContext("2d")!;
                g.drawImage(img, 0, 0);
                return g.getImageData(0, 0, w, h);
            };
            const da = read(fa);
            const db = read(th);
            const diff = new ImageData(w, h);
            const lum = (d: Uint8ClampedArray, i: number) =>
                (d[i] + d[i + 1] + d[i + 2]) / 3;
            const off = (
                p: Uint8ClampedArray,
                q: Uint8ClampedArray,
                i: number,
                j: number,
            ) =>
                Math.max(
                    Math.abs(p[i] - q[j]),
                    Math.abs(p[i + 1] - q[j + 1]),
                    Math.abs(p[i + 2] - q[j + 2]),
                );
            /** Whether pixel `i` of `p` matches a pixel of `q` within one pixel of it. */
            const near = (
                p: Uint8ClampedArray,
                q: Uint8ClampedArray,
                x: number,
                y: number,
            ) => {
                const i = (y * w + x) * 4;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        if (off(p, q, i, (ny * w + nx) * 4) <= 24) return true;
                    }
                return false;
            };
            let differing = 0;
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    const la = lum(da.data, i);
                    // Antialiasing moves edges by up to a pixel: only count
                    // pixels with no match within a pixel, either way
                    if (
                        !near(da.data, db.data, x, y) ||
                        !near(db.data, da.data, x, y)
                    ) {
                        differing++;
                        const darker = lum(db.data, i) < la;
                        diff.data.set(
                            darker ? [220, 0, 0, 255] : [0, 90, 255, 255],
                            i,
                        );
                    } else {
                        const v = 255 - (255 - la) * 0.25;
                        diff.data.set([v, v, v, 255], i);
                    }
                }
            const out = new OffscreenCanvas(w * 3, h);
            const g = out.getContext("2d")!;
            g.drawImage(fa, 0, 0);
            g.drawImage(th, w, 0);
            g.putImageData(diff, w * 2, 0);
            g.font = "bold 20px sans-serif";
            for (const [i, label] of [labelA, labelB, "diff"].entries()) {
                g.fillStyle = "rgba(255,255,255,0.85)";
                g.fillRect(i * w + 8, 8, 110, 30);
                g.fillStyle = "black";
                g.fillText(label, i * w + 16, 30);
            }
            const png = await out.convertToBlob({ type: "image/png" });
            const bytes = new Uint8Array(await png.arrayBuffer());
            let binary = "";
            for (let i = 0; i < bytes.length; i += 0x8000)
                binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            return {
                png: btoa(binary),
                differing,
                total: w * h,
            };
        },
        [
            before.toString("base64"),
            after.toString("base64"),
            labels[0],
            labels[1],
        ] as const,
    );
    return { ...result, png: Buffer.from(result.png, "base64") };
}

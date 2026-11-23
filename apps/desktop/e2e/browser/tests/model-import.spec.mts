// cspell:words draco IHDR IDAT IEND filechooser fflate
/**
 * The model import worker in real Chromium (fork #998): its own CSP (as the web build's
 * `_headers` sends it), the real image codecs and Draco's WebAssembly decoder. The pipeline's
 * cases run in Node (`src/showAssets/modelImport/__test__`); this checks the worker around it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { Logger, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { zipSync } from "fflate";
import { test, expect } from "../fixtures.mjs";
import { waitForIdle } from "../app.mjs";
import type { ModelImportTestResult } from "../../../src/showAssets/modelImport/modelImportTestApi";

const FIXTURES = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../src/showAssets/modelImport/__test__/fixtures",
);

const file = (name: string, bytes?: Uint8Array) => ({
    name,
    base64: Buffer.from(
        bytes ?? fs.readFileSync(path.join(FIXTURES, name)),
    ).toString("base64"),
});

/** A `size` × `size` PNG, a gradient so shrinking it is real work */
function gradientPng(size: number): Uint8Array {
    const row = 1 + size * 4;
    const raw = Buffer.alloc(row * size);
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
            raw.set(
                [(x * 255) / size, (y * 255) / size, 90, 255],
                y * row + 1 + x * 4,
            );
    const chunk = (type: string, data: Buffer) => {
        const out = Buffer.alloc(12 + data.length);
        out.writeUInt32BE(data.length);
        out.write(type, 4, "latin1");
        data.copy(out, 8);
        out.writeUInt32BE(
            zlib.crc32(out.subarray(4, 8 + data.length)),
            8 + data.length,
        );
        return out;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size);
    header.writeUInt32BE(size, 4);
    header.set([8, 6], 8);
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

/** The chair with its first texture swapped for a `size` px one */
async function chairWithTexture(size: number): Promise<Uint8Array> {
    const io = new WebIO()
        .setLogger(new Logger(Logger.Verbosity.ERROR))
        .registerExtensions(ALL_EXTENSIONS);
    const doc = await io.readBinary(
        new Uint8Array(fs.readFileSync(path.join(FIXTURES, "SheenChair.glb"))),
    );
    doc.getRoot()
        .listTextures()[0]
        .setImage(gradientPng(size))
        .setMimeType("image/png");
    return io.writeBinary(doc);
}

test("runs the model import in its own worker, under its own CSP", async ({
    show,
}) => {
    test.setTimeout(180_000);
    const { page } = show;
    await page.waitForFunction(() => !!window.modelImportTest);

    const probe = await page.evaluate(() => window.modelImportTest!.probe());
    expect(probe.wasm).toBe("allowed");
    expect(probe.fetch).toMatch(/^refused/);
    expect(probe.evalFunction).toMatch(/^refused: EvalError/);

    const run = (files: ReturnType<typeof file>[]) =>
        page.evaluate(
            (f) => window.modelImportTest!.run(f),
            files,
        ) as Promise<ModelImportTestResult>;

    // A real chair: simplified under the cap, with a thumbnail
    const chair = await run([file("SheenChair.glb")]);
    expect(chair.ok).toBe(true);
    if (chair.ok) {
        expect(chair.model.sidecar.triangles).toBeLessThanOrEqual(20_000);
        expect(Object.keys(chair.model.parts).sort()).toEqual([
            "distant",
            "model",
            "thumbnail",
        ]);
    }

    // Draco, decoded by its WebAssembly in the worker
    const box = await run([file("Box.gltf"), file("Box.bin")]);
    expect(box.ok).toBe(true);
    expect(box.report.fixedForYou).toContainEqual({ code: "dracoDecoded" });

    // A 2048 px texture, shrunk to the cap by the browser's own codecs
    const big = await run([file("chair-2k.glb", await chairWithTexture(2048))]);
    expect(big.report.fixedForYou).toContainEqual(
        expect.objectContaining({
            code: "texturesShrunk",
            textures: [
                expect.objectContaining({
                    from: [2048, 2048],
                    to: [1024, 1024],
                }),
            ],
        }),
    );

    // A zip as Sketchfab hands one out, opened in the worker (#1168)
    const zipped = await run([
        file(
            "chair.zip",
            zipSync({
                "source/SheenChair.glb": new Uint8Array(
                    fs.readFileSync(path.join(FIXTURES, "SheenChair.glb")),
                ),
                "license.txt": new TextEncoder().encode("CC-BY-4.0"),
            }),
        ),
    ]);
    expect(zipped.ok).toBe(true);
});

// The designer's import (fork #999): Import… in the Props panel opens the review, Add stores the
// model under Imported, and its tile places it as a prop with a click on the field. One undo
// removes the prop and keeps the model.
test("imports a model from the Props panel and places it as a prop", async ({
    show,
}) => {
    test.setTimeout(180_000);
    const { page } = show;
    await page.getByRole("button", { name: "Props" }).first().click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("import-model-tile").click();
    await (await chooser).setFiles(path.join(FIXTURES, "SheenChair.glb"));

    const review = page.getByTestId("model-import-review");
    await expect(review.getByTestId("model-import-picture")).toBeVisible({
        timeout: 60_000,
    });
    await expect(review.getByTestId("model-import-size")).toHaveText(
        /× .* m tall$/,
    );
    // The chair is past the triangle cap, so the Detail choice shows with Light chosen
    await expect(
        review.getByTestId("model-import-detail-light"),
    ).toHaveAttribute("data-state", "on");
    await review.getByTestId("model-import-name").fill("Chair");
    await review.getByTestId("model-import-add").click();

    const tile = page.getByRole("button", { name: "Place Chair" });
    await expect(tile).toBeVisible({ timeout: 20_000 });
    expect(
        await show.query<{ kind: string; name: string }>(
            "SELECT kind, name FROM show_assets",
        ),
    ).toEqual([{ kind: "model", name: "Chair" }]);

    await tile.click();
    const canvas = (await page
        .getByTestId("fieldCanvas")
        .first()
        .boundingBox())!;
    await page.mouse.click(
        canvas.x + canvas.width / 2,
        canvas.y + canvas.height / 2,
    );
    await expect
        .poll(() =>
            show.query<{ kind: string; model: string }>(
                "SELECT kind, model FROM items",
            ),
        )
        .toEqual([{ kind: "prop", model: expect.stringMatching(/^library:/) }]);

    await waitForIdle(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => show.query("SELECT id FROM items")).toEqual([]);
    expect(await show.query("SELECT id FROM show_assets")).toHaveLength(1);
});

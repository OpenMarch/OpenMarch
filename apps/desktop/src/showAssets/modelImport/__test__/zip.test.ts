// @vitest-environment node
/** A picked `.zip`, as Sketchfab hands a glTF out (#1168) */
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { fileTitle, importModel } from "../pipeline";
import { MAX_IMPORT_BYTES } from "../rules";
import type { PickedFile } from "../types";
import { openZips, zipHasModel } from "../zip";
import { env, read, separateGltf } from "./fixtures";

const zipOf = (name: string, entries: Record<string, Uint8Array>) => ({
    name,
    bytes: zipSync(entries),
});

/** Box.gltf with its buffer moved into `parts/`, as an exporter lays out a folder */
function boxInFolders(): Record<string, Uint8Array> {
    const json = JSON.parse(new TextDecoder().decode(read("Box.gltf")));
    json.buffers[0].uri = "parts/Box.bin";
    return {
        "scene.gltf": new TextEncoder().encode(JSON.stringify(json)),
        "parts/Box.bin": read("Box.bin"),
    };
}

describe("importing a zip", () => {
    it("imports a glTF whose files are in folders inside the zip", async () => {
        const result = await importModel(
            [zipOf("garden_box.zip", boxInFolders())],
            {},
            env,
        );
        expect(result.report.cantImport).toEqual([]);
        expect(result.ok && result.model.name).toBe("garden box");
    });

    it("finds the files from the model's own folder when the zip wraps it in one", async () => {
        const wrapped = Object.fromEntries(
            Object.entries(boxInFolders()).map(([path, data]) => [
                `Box model/${path}`,
                data,
            ]),
        );
        const result = await importModel([zipOf("box.zip", wrapped)], {}, env);
        expect(result.report.cantImport).toEqual([]);
    });

    it("imports a GLB in a zip, beside files the model doesn't use", async () => {
        const result = await importModel(
            [
                zipOf("chair.zip", {
                    "source/SheenChair.glb": read("SheenChair.glb"),
                    "textures/unused.png": new Uint8Array([1, 2, 3]),
                    "license.txt": new TextEncoder().encode("CC-BY-4.0"),
                }),
            ],
            {},
            env,
        );
        expect(result.report.cantImport).toEqual([]);
    });

    it("refuses a zip with two models", async () => {
        const result = await importModel(
            [
                zipOf("two.zip", {
                    "a.glb": read("SheenChair.glb"),
                    "b.glb": read("TextureCoordinateTest.glb"),
                }),
            ],
            {},
            env,
        );
        expect(result.report.cantImport).toEqual([
            { code: "severalModelFiles", names: ["a.glb", "b.glb"] },
        ]);
    });

    it("refuses a zip that opens past the size limit, before decoding it", () => {
        // Zeros compress to almost nothing: a small zip that opens huge
        const zip = zipOf("bomb.zip", {
            "a.bin": new Uint8Array(MAX_IMPORT_BYTES / 2 + 1),
            "b.bin": new Uint8Array(MAX_IMPORT_BYTES / 2 + 1),
        });
        expect(zip.bytes.byteLength).toBeLessThan(1024 * 1024);
        expect(() => openZips([zip])).toThrow(
            expect.objectContaining({
                refusal: expect.objectContaining({ code: "tooLarge" }),
            }),
        );
    });

    it("never decodes an entry past the size its header declares", () => {
        const zip = zipOf("liar.zip", { "a.bin": new Uint8Array(1_000_000) });
        // Claim 100 bytes in the local header and the central directory
        const view = new DataView(zip.bytes.buffer);
        view.setUint32(22, 100, true);
        for (let i = zip.bytes.byteLength - 22; i >= 0; i--)
            if (view.getUint32(i, true) === 0x02014b50) {
                view.setUint32(i + 24, 100, true);
                break;
            }
        const { files } = openZips([zip]);
        expect(files[0].bytes.byteLength).toBe(100);
    });

    it("counts a stored entry by what it holds, whatever size its header claims", () => {
        const zip = {
            name: "stored.zip",
            bytes: zipSync({ "a.bin": [new Uint8Array(4_000), { level: 0 }] }),
        };
        // Claim it opens to nothing, in the local header and the central directory
        const view = new DataView(zip.bytes.buffer);
        view.setUint32(22, 0, true);
        for (let i = zip.bytes.byteLength - 22; i >= 0; i--)
            if (view.getUint32(i, true) === 0x02014b50) {
                view.setUint32(i + 24, 0, true);
                break;
            }
        expect(() => openZips([zip], 1_000)).toThrow(
            expect.objectContaining({
                refusal: expect.objectContaining({ code: "tooLarge" }),
            }),
        );
    });

    it("never opens the model's sources, nor counts them against the limit", () => {
        const { files, skipped } = openZips(
            [
                zipOf("chair.zip", {
                    "chair.glb": new Uint8Array(100),
                    "source/chair.blend": new Uint8Array(5_000),
                }),
            ],
            1_000,
        );
        expect(files.map((f) => f.name)).toEqual(["chair.glb"]);
        expect(skipped).toEqual(["source/chair.blend"]);
    });

    it("names a zip's unread files when there's no model in it", async () => {
        const result = await importModel(
            [zipOf("fbx.zip", { "cube.fbx": new Uint8Array([1]) })],
            {},
            env,
        );
        expect(result.report.cantImport).toEqual([
            { code: "noModelFile", names: ["cube.fbx"] },
        ]);
    });

    it("tells a zip with a model in it from any other zip, without opening it", () => {
        expect(
            zipHasModel(zipSync({ "chair/scene.gltf": new Uint8Array([1]) })),
        ).toBe(true);
        expect(
            zipHasModel(
                zipSync({
                    "photo.png": new Uint8Array([1]),
                    "__MACOSX/._a.glb": new Uint8Array([1]),
                }),
            ),
        ).toBe(false);
        expect(zipHasModel(new Uint8Array([0x50, 0x4b, 3, 4, 9]))).toBe(false);
    });

    it("refuses a zip listing more entries than a model download has, before reading them", () => {
        const entries = Object.fromEntries(
            Array.from({ length: 5_001 }, (_, i) => [
                `notes/${i}.txt`,
                new Uint8Array(0),
            ]),
        );
        const zip = zipOf("many.zip", entries);
        expect(() => openZips([zip])).toThrow(
            expect.objectContaining({
                refusal: expect.objectContaining({ code: "unreadable" }),
            }),
        );
        expect(zipHasModel(zip.bytes)).toBe(false);
    });

    it("reads entries named from ./ or with Windows separators", () => {
        const { files } = openZips([
            zipOf("w.zip", {
                "./scene.gltf": new Uint8Array([1]),
                "textures\\wood.png": new Uint8Array([1]),
            }),
        ]);
        expect(files.map((f) => f.name)).toEqual([
            "scene.gltf",
            "textures/wood.png",
        ]);
    });

    it("leaves a model's buffer alone when it happens to start like a zip", () => {
        const bin = {
            name: "scene.bin",
            bytes: new Uint8Array([0x50, 0x4b, 3, 4]),
        };
        expect(openZips([bin]).files).toEqual([bin]);
    });

    it("skips folders, macOS metadata and hidden files", () => {
        const { files } = openZips([
            zipOf("m.zip", {
                "__MACOSX/._scene.gltf": new Uint8Array([1]),
                ".DS_Store": new Uint8Array([1]),
                "scene.gltf": new Uint8Array([1]),
            }),
        ]);
        expect(files.map((f) => f.name)).toEqual(["scene.gltf"]);
    });

    it("says a damaged zip can't be read", async () => {
        const result = await importModel(
            [
                {
                    name: "broken.zip",
                    bytes: new Uint8Array([0x50, 0x4b, 3, 4, 9]),
                },
            ],
            {},
            env,
        );
        expect(result.report.cantImport[0]?.code).toBe("unreadable");
    });

    it("leaves files that aren't zips as picked", async () => {
        const files: PickedFile[] = await separateGltf();
        expect(openZips(files)).toEqual({ files, zipName: null, skipped: [] });
    });
});

describe("a model's title from its file name", () => {
    it("uses the file's name without its folder or extension", () => {
        expect(fileTitle("source/CHICKEN.glb", "chicken_model")).toBe(
            "CHICKEN",
        );
    });

    it("uses the zip's name for a file only called scene", () => {
        expect(fileTitle("scene.gltf", "scaffold_stairs_steel")).toBe(
            "scaffold stairs steel",
        );
        expect(fileTitle("scene.gltf", null)).toBe("scene");
    });
});

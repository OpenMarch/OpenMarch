// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeVersionHash, sha256Hex } from "../../library/hash";
import { openLibraryStore, type LibraryStore } from "../../library/store";
import { parseContainer, readModelFile, sourceFileOf } from "../container";
import {
    MODEL_PART_GLB,
    MODEL_PART_SIDECAR,
    saveModelToLibrary,
} from "../library";
import { importModel } from "../pipeline";

const FIXTURES = path.join(__dirname, "fixtures");

let dir: string;
let store: LibraryStore;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "om-model-import-"));
    store = await openLibraryStore({ root: dir });
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("saveModelToLibrary", () => {
    it("stores the GLB and sidecar as a Version, the original as its source", async () => {
        const file = await readModelFile(
            path.join(FIXTURES, "equipment-clean-kit.glb"),
        );
        const result = await importModel(file);
        const saved = await saveModelToLibrary(store, {
            file,
            result,
            name: "Flag",
        });
        expect(saved.outcome).toBe("created");
        // The kit stamp's itemId names the item.
        expect(saved.item.id).toBe("6b1f3c1e-5a43-4d0e-9a51-2f7c8e9d0a11");
        expect(saved.item.kind).toBe("model");
        expect(saved.item.originalFilename).toBe("equipment-clean-kit.glb");
        expect(saved.version.hash).toBe(
            computeVersionHash({
                [MODEL_PART_GLB]: sha256Hex(result.output!.glb),
                [MODEL_PART_SIDECAR]: sha256Hex(result.output!.sidecarBytes),
            }),
        );
        const parts = await store.readVersionParts(
            saved.item.id,
            saved.version.hash,
        );
        expect(Object.keys(parts).sort()).toEqual(["glb", "sidecar"]);
        const source = await store.readSource(
            saved.item.id,
            saved.version.hash,
        );
        expect(Buffer.from(source!.bytes).equals(Buffer.from(file.bytes))).toBe(
            true,
        );

        // The same file again is "already in your Library".
        const again = await saveModelToLibrary(store, {
            file,
            result: await importModel(file),
            name: "Flag again",
        });
        expect(again.outcome).toBe("existing");
        expect(again.version.hash).toBe(saved.version.hash);
    });

    it("refuses a result that isn't ready", async () => {
        const file = await readModelFile(path.join(FIXTURES, "invalid.glb"));
        const result = await importModel(file);
        expect(() =>
            saveModelToLibrary(store, { file, result, name: "Bad" }),
        ).toThrow(/rejected/);
    });
});

describe("sourceFileOf", () => {
    it("embeds a .gltf's resources so the original is one file", async () => {
        const file = await readModelFile(path.join(FIXTURES, "model.gltf"));
        expect(Object.keys(file.resources!).sort()).toEqual([
            "logo.png",
            "model.bin",
        ]);
        const source = sourceFileOf(file);
        const json = parseContainer(source.bytes).json as any;
        expect(json.buffers[0].uri).toMatch(
            /^data:application\/octet-stream;base64,/,
        );
        expect(json.images[0].uri).toMatch(/^data:image\/png;base64,/);
        // The inlined file imports on its own, to the same output.
        const a = await importModel(file);
        const b = await importModel({
            filename: "model.gltf",
            bytes: source.bytes,
        });
        expect(
            Buffer.from(b.output!.glb).equals(Buffer.from(a.output!.glb)),
        ).toBe(true);
        // The .bin on disk is untouched.
        expect((await readFile(path.join(FIXTURES, "model.bin"))).length).toBe(
            file.resources!["model.bin"].length,
        );
    });
});

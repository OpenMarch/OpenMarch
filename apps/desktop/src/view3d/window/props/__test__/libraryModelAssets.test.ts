import { Blob as NodeBlob } from "node:buffer";
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { importModel } from "@/showAssets/modelImport/pipeline";
import { Document } from "@gltf-transform/core";
import {
    env,
    picked,
    writeGlb,
} from "@/showAssets/modelImport/__test__/fixtures";
import {
    _heldLibraryModelCount,
    _setLibraryModelBytes,
    acquireLibraryModel,
    holdChanges,
    mergeByMaterial,
    LibraryModelReleased,
    releaseLibraryModel,
    setDrawnLibraryModels,
    useDrawnLibraryModels,
} from "../libraryModelAssets";
import { renderHook, act } from "@testing-library/react";
import { BoxGeometry, MeshStandardMaterial, SphereGeometry } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Imported models in the 3D View (fork #1000): each stored GLB, read by hash and parsed once for
 * every item drawn as it, and freed from the GPU when the last one lets go.
 */

const JsdomBlob = globalThis.Blob;
afterAll(() => {
    globalThis.Blob = JsdomBlob;
});

let glb: Uint8Array;
beforeAll(async () => {
    // jsdom's Blob can't be read back; the import's PNG encoder reads one
    globalThis.Blob = NodeBlob as unknown as typeof Blob;
    // The import's own output, as the show stores it: plain GLB
    const result = await importModel(
        [picked("Box.gltf"), picked("Box.bin")],
        {},
        env,
    );
    if (!result.ok) throw new Error("the Box fixture should import");
    glb = result.model.parts.model;
});

afterEach(() => _setLibraryModelBytes(null));

describe("acquireLibraryModel", () => {
    it("parses a part once for every user, and frees it when the last lets go", async () => {
        const read = vi.fn(async () => glb);
        _setLibraryModelBytes(read);
        const [a, b] = await Promise.all([
            acquireLibraryModel("box"),
            acquireLibraryModel("box"),
        ]);
        expect(a).toBe(b);
        expect(read).toHaveBeenCalledTimes(1);
        expect(a.length).toBeGreaterThan(0);

        const disposed = vi.fn();
        a[0].geometry.addEventListener("dispose", disposed);
        releaseLibraryModel("box");
        expect(disposed).not.toHaveBeenCalled();
        releaseLibraryModel("box");
        expect(disposed).toHaveBeenCalled();
        expect(_heldLibraryModelCount()).toBe(0);
    });

    it("parses a copy, never the cache's shared bytes", async () => {
        _setLibraryModelBytes(async () => glb);
        const parse = vi.spyOn(GLTFLoader.prototype, "parseAsync");
        await acquireLibraryModel("copy");
        releaseLibraryModel("copy");
        expect(parse.mock.calls[0][0]).not.toBe(glb.buffer);
        parse.mockRestore();
    });

    it("ends a load whose last user let go before it finished", async () => {
        _setLibraryModelBytes(async () => glb);
        const load = acquireLibraryModel("early");
        releaseLibraryModel("early");
        await expect(load).rejects.toBeInstanceOf(LibraryModelReleased);
        expect(_heldLibraryModelCount()).toBe(0);
    });

    it("fails when the show doesn't have the part", async () => {
        _setLibraryModelBytes(async () => undefined);
        await expect(acquireLibraryModel("missing")).rejects.toThrow(
            /no model part missing/,
        );
        releaseLibraryModel("missing");
    });
});

describe("setDrawnLibraryModels", () => {
    it("tells blocks which imported models draw now, only when that changes", () => {
        const { result } = renderHook(() => useDrawnLibraryModels());
        act(() => setDrawnLibraryModels(new Set(["library:a@b"])));
        const first = result.current;
        expect(first.has("library:a@b")).toBe(true);
        act(() => setDrawnLibraryModels(new Set(["library:a@b"])));
        expect(result.current).toBe(first);
        act(() => setDrawnLibraryModels(new Set()));
        expect(result.current.size).toBe(0);
    });
});

describe("mergeByMaterial", () => {
    it("draws the meshes that share a material as one part", () => {
        const wood = new MeshStandardMaterial();
        const cloth = new MeshStandardMaterial();
        const parts = mergeByMaterial([
            { geometry: new BoxGeometry(), material: wood },
            { geometry: new BoxGeometry(2), material: wood },
            { geometry: new SphereGeometry(), material: wood },
            { geometry: new BoxGeometry(), material: cloth },
        ]);
        expect(parts).toHaveLength(2);
        const merged = parts.find((p) => p.material === wood)!;
        // Three boxes' and a sphere's vertices, in one geometry
        expect(merged.geometry.attributes.position.count).toBe(
            24 * 2 + new SphereGeometry().attributes.position.count,
        );
    });

    it("keeps a part whose layout can't merge as it is", () => {
        const wood = new MeshStandardMaterial();
        const plain = new BoxGeometry();
        plain.deleteAttribute("uv");
        const parts = mergeByMaterial([
            { geometry: new BoxGeometry(), material: wood },
            { geometry: plain, material: wood },
        ]);
        expect(parts).toHaveLength(2);
    });
});

/**
 * Twelve cubes, each its own mesh with its own copy of a red material, and one blue: as some
 * exporters write a car's parts. The left six are mirrored, the rest turned.
 */
async function partsWithCopiedMaterials(): Promise<Uint8Array> {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene();
    const corners = [0, 1].flatMap((x) =>
        [0, 1].flatMap((y) => [0, 1].map((z) => [x, y, z])),
    );
    const faces = [
        [0, 1, 3, 2],
        [4, 6, 7, 5],
        [0, 4, 5, 1],
        [2, 3, 7, 6],
        [0, 2, 6, 4],
        [1, 5, 7, 3],
    ].flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
    const cube = (color: [number, number, number, number]) =>
        doc.createMesh().addPrimitive(
            doc
                .createPrimitive()
                .setAttribute(
                    "POSITION",
                    doc
                        .createAccessor()
                        .setType("VEC3")
                        .setArray(new Float32Array(corners.flat()))
                        .setBuffer(buffer),
                )
                // Two attributes, so a writer that interleaves would interleave them
                .setAttribute(
                    "NORMAL",
                    doc
                        .createAccessor()
                        .setType("VEC3")
                        .setArray(
                            new Float32Array(
                                corners.flatMap(([x, y, z]) => {
                                    const l = Math.hypot(
                                        x - 0.5,
                                        y - 0.5,
                                        z - 0.5,
                                    );
                                    return [
                                        (x - 0.5) / l,
                                        (y - 0.5) / l,
                                        (z - 0.5) / l,
                                    ];
                                }),
                            ),
                        )
                        .setBuffer(buffer),
                )
                .setIndices(
                    doc
                        .createAccessor()
                        .setType("SCALAR")
                        .setArray(new Uint16Array(faces))
                        .setBuffer(buffer),
                )
                .setMaterial(doc.createMaterial().setBaseColorFactor(color)),
        );
    for (let i = 0; i < 13; i++) {
        const node = doc
            .createNode()
            .setMesh(cube(i < 12 ? [1, 0, 0, 1] : [0, 0, 1, 1]))
            .setTranslation([i * 2 - 12, 0, 0]);
        if (i < 6) node.setScale([-1, 1, 1]);
        else node.setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
        scene.addChild(node);
    }
    return writeGlb(doc);
}

describe("an imported model's parts (#1201)", () => {
    it("draws parts with copies of one material as one part, in every copy", async () => {
        const result = await importModel(
            [picked("cubes.glb", await partsWithCopiedMaterials())],
            {},
            env,
        );
        if (!result.ok) throw new Error("the cubes should import");
        const { model, distant } = result.model.parts;
        _setLibraryModelBytes(async (hash) =>
            hash === "model" ? model : distant,
        );
        for (const hash of ["model", "distant"]) {
            const parts = await acquireLibraryModel(hash);
            // The red cubes in one draw, the blue one in another
            expect(parts).toHaveLength(2);
            const counts = parts
                .map((p) => p.geometry.attributes.position.count)
                .sort((a, b) => a - b);
            expect(counts[1]).toBe(counts[0] * 12);
            releaseLibraryModel(hash);
        }
    });
});

describe("holdChanges", () => {
    it("holds what's newly needed and lets go of the rest, a changed part included", () => {
        const held = new Map([
            ["chair|high", "a"],
            ["chair|low", "b"],
            ["table|low", "c"],
        ]);
        const needed = new Map([
            ["chair|low", "b"],
            ["table|low", "c2"],
            ["stool|low", "d"],
        ]);
        expect(holdChanges(held, needed)).toEqual({
            acquire: [
                ["table|low", "c2"],
                ["stool|low", "d"],
            ],
            release: [
                ["chair|high", "a"],
                ["table|low", "c"],
            ],
        });
        expect(holdChanges(needed, needed)).toEqual({
            acquire: [],
            release: [],
        });
    });
});

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
import { env, picked } from "@/showAssets/modelImport/__test__/fixtures";
import {
    _heldLibraryModelCount,
    _setLibraryModelBytes,
    acquireLibraryModel,
    LibraryModelReleased,
    releaseLibraryModel,
    setDrawnLibraryModels,
    useDrawnLibraryModels,
} from "../libraryModelAssets";
import { renderHook, act } from "@testing-library/react";

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

    it("leaves the shared bytes alone: it parses a copy", async () => {
        const bytes = glb.slice();
        _setLibraryModelBytes(async () => bytes);
        await acquireLibraryModel("copy");
        releaseLibraryModel("copy");
        expect(bytes).toEqual(glb);
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

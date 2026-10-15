import { describe, expect, it } from "vitest";
import {
    groupLibraryItems,
    groupOf,
    loadLibraryItems,
    sidecarDetail,
    type LibraryBrowserItem,
} from "../libraryItems";
import { createFakeLibrary } from "../../import/__test__/fakeLibrary";
import { sampleLibrary, serveLibrary } from "./libraryFixtures";

const json = (value: object) => new TextEncoder().encode(JSON.stringify(value));

describe("groupOf", () => {
    it("groups by what the item is for", () => {
        expect(groupOf("artwork", "silk")).toBe("silks");
        expect(groupOf("artwork", "baseFloor")).toBe("floors");
        expect(groupOf("model", "floorProp")).toBe("floors");
        expect(groupOf("model", "prop")).toBe("props");
        expect(groupOf("artwork", "propSlot")).toBe("props");
        expect(groupOf("model", "equipment")).toBe("equipment");
        expect(groupOf("model", "garment")).toBe("uniforms");
        expect(groupOf("artwork", "uniformPart")).toBe("uniforms");
        expect(groupOf("uniform", null)).toBe("uniforms");
        expect(groupOf("model", null)).toBe("other");
    });
});

describe("sidecarDetail", () => {
    it("reads a model's kind and an artwork's surface", () => {
        expect(sidecarDetail("model", json({ kind: "equipment" }))).toBe(
            "equipment",
        );
        expect(sidecarDetail("artwork", json({ surface: "silk" }))).toBe(
            "silk",
        );
    });

    it("is null for unknown values and unreadable bytes", () => {
        expect(sidecarDetail("model", json({ kind: "spaceship" }))).toBeNull();
        expect(sidecarDetail("artwork", json({ kind: "prop" }))).toBeNull();
        expect(sidecarDetail("model", new Uint8Array([1, 2]))).toBeNull();
        expect(sidecarDetail("model", undefined)).toBeNull();
    });
});

describe("groupLibraryItems", () => {
    const items = [
        ["b", "Zebra silk", "silks"],
        ["a", "Away silk", "silks"],
        ["c", "Mace", "equipment"],
        ["d", "Tarp", "floors"],
    ].map(
        ([id, name, group]) =>
            ({
                id,
                name,
                group,
                kind: "artwork",
                versionHash: id,
                builtIn: false,
            }) as LibraryBrowserItem,
    );

    it("keeps display order, drops empty groups and sorts by name", () => {
        expect(
            groupLibraryItems(items, "").map((g) => [
                g.group,
                g.items.map((i) => i.name),
            ]),
        ).toEqual([
            ["silks", ["Away silk", "Zebra silk"]],
            ["floors", ["Tarp"]],
            ["equipment", ["Mace"]],
        ]);
    });

    it("filters by name, ignoring case and spaces around", () => {
        expect(
            groupLibraryItems(items, "  SILK ").flatMap((g) =>
                g.items.map((i) => i.name),
            ),
        ).toEqual(["Away silk", "Zebra silk"]);
        expect(groupLibraryItems(items, "nothing")).toEqual([]);
    });
});

describe("loadLibraryItems", () => {
    it("lists items with their newest version and sidecar group", async () => {
        const lib = createFakeLibrary();
        const library = sampleLibrary(7);
        serveLibrary(lib, library);
        const result = await loadLibraryItems(lib.api);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.map((i) => [i.name, i.group])).toEqual([
            ["Home silk", "silks"],
            ["Away silk", "silks"],
            ["Field tarp", "floors"],
            ["Riser 8 × 4", "props"],
            ["Drum major mace", "equipment"],
            ["Band default", "uniforms"],
            ["Mystery", "other"],
        ]);
        expect(result.value[0].versionHash).toBe(
            library[0].summary.versions[1],
        );
        // Uniforms have no sidecar to read.
        expect(lib.calls.readParts).toHaveLength(6);
        expect(lib.calls.readParts[0]).toEqual({
            itemId: library[0].summary.id,
            versionHash: library[0].summary.versions[1],
            roles: ["sidecar"],
        });
    });

    it("caches sidecars by version", async () => {
        const lib = createFakeLibrary();
        serveLibrary(lib, sampleLibrary(8));
        await loadLibraryItems(lib.api);
        await loadLibraryItems(lib.api);
        // Only the unreadable one is asked again.
        expect(lib.calls.readParts).toHaveLength(7);
    });

    it("passes a failed list through", async () => {
        const lib = createFakeLibrary();
        lib.on("list", () => ({
            ok: false,
            error: { code: "corrupt", message: "bad index" },
        }));
        expect(await loadLibraryItems(lib.api)).toEqual({
            ok: false,
            error: { code: "corrupt", message: "bad index" },
        });
    });
});

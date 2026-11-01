// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    planLibraryPrune,
    type PrunableLibraryItem,
} from "../showLibraryPrune";

const h = (c: string) => c.repeat(64);

const item = (
    itemId: string,
    versionHash: string,
    parts: Record<string, string>,
    pins: PrunableLibraryItem["pins"] = [],
): PrunableLibraryItem => ({ itemId, versionHash, parts, pins });

const keys = (refs: { itemId: string; versionHash: string }[]) =>
    refs.map((r) => `${r.itemId}@${r.versionHash}`).sort();

describe("planLibraryPrune", () => {
    const flag = item("flag", h("1"), { original: h("a"), display: h("b") });
    const rifle = item("rifle", h("2"), { glb: h("c"), sidecar: h("d") });

    it("keeps nothing when nothing is referenced", () => {
        const plan = planLibraryPrune({
            items: [flag, rifle],
            blobHashes: [h("a"), h("b"), h("c"), h("d")],
            keep: [],
        });
        expect(keys(plan.items)).toEqual(keys([flag, rifle]));
        expect(plan.blobs.sort()).toEqual([h("a"), h("b"), h("c"), h("d")]);
    });

    it("keeps a referenced Version and its blobs", () => {
        const plan = planLibraryPrune({
            items: [flag, rifle],
            blobHashes: [h("a"), h("b"), h("c"), h("d")],
            keep: [{ itemId: "rifle", versionHash: h("2") }],
        });
        expect(keys(plan.items)).toEqual(keys([flag]));
        expect(plan.blobs.sort()).toEqual([h("a"), h("b")]);
    });

    it("keeps only the referenced Version of an item", () => {
        const rifleV2 = item("rifle", h("3"), { glb: h("e"), sidecar: h("d") });
        const plan = planLibraryPrune({
            items: [rifle, rifleV2],
            blobHashes: [h("c"), h("d"), h("e")],
            keep: [{ itemId: "rifle", versionHash: h("3") }],
        });
        expect(keys(plan.items)).toEqual(keys([rifle]));
        // The shared sidecar stays with the kept Version
        expect(plan.blobs).toEqual([h("c")]);
    });

    it("keeps every Version of an item kept without a Version", () => {
        const rifleV2 = item("rifle", h("3"), { glb: h("e"), sidecar: h("d") });
        const plan = planLibraryPrune({
            items: [rifle, rifleV2, flag],
            blobHashes: [h("a"), h("b"), h("c"), h("d"), h("e")],
            keep: [{ itemId: "rifle" }],
        });
        expect(keys(plan.items)).toEqual(keys([flag]));
    });

    it("keeps what a kept item pins, through any depth", () => {
        const garment = item("garment", h("4"), { glb: h("f") });
        const uniform = item("uniform", h("5"), { sidecar: h("g") }, [
            { itemId: "garment", versionHash: h("4") },
            { itemId: "flag", versionHash: h("1") },
        ]);
        const plan = planLibraryPrune({
            items: [flag, rifle, garment, uniform],
            blobHashes: [h("a"), h("b"), h("c"), h("d"), h("f"), h("g")],
            keep: [{ itemId: "uniform", versionHash: h("5") }],
        });
        expect(keys(plan.items)).toEqual(keys([rifle]));
        expect(plan.blobs.sort()).toEqual([h("c"), h("d")]);
    });

    it("doesn't keep what an unreferenced item pins", () => {
        const uniform = item("uniform", h("5"), { sidecar: h("g") }, [
            { itemId: "flag", versionHash: h("1") },
        ]);
        const plan = planLibraryPrune({
            items: [flag, uniform],
            blobHashes: [h("a"), h("b"), h("g")],
            keep: [],
        });
        expect(keys(plan.items)).toEqual(keys([flag, uniform]));
    });

    it("stops on a pin cycle", () => {
        const a = item("a", h("6"), { glb: h("a") }, [
            { itemId: "b", versionHash: h("7") },
        ]);
        const b = item("b", h("7"), { glb: h("b") }, [
            { itemId: "a", versionHash: h("6") },
        ]);
        const plan = planLibraryPrune({
            items: [a, b],
            blobHashes: [h("a"), h("b")],
            keep: [{ itemId: "a", versionHash: h("6") }],
        });
        expect(plan.items).toEqual([]);
        expect(plan.blobs).toEqual([]);
    });

    it("drops orphan blobs no item points at", () => {
        const plan = planLibraryPrune({
            items: [rifle],
            blobHashes: [h("c"), h("d"), h("9")],
            keep: [{ itemId: "rifle" }],
        });
        expect(plan.items).toEqual([]);
        expect(plan.blobs).toEqual([h("9")]);
    });

    it("ignores a reference to a Version the show doesn't have", () => {
        const plan = planLibraryPrune({
            items: [rifle],
            blobHashes: [h("c"), h("d")],
            keep: [{ itemId: "missing", versionHash: h("8") }],
        });
        expect(keys(plan.items)).toEqual(keys([rifle]));
    });
});

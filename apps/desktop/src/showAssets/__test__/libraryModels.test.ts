import { describe, expect, it } from "vitest";
import type { ShowAsset } from "@/db-functions/showAssets";
import { libraryModels, modelScale, proportionalSize } from "../libraryModels";

const asset = (more: Partial<ShowAsset> = {}): ShowAsset => ({
    id: "0b6f4a52-4f1e-4f8e-9a51-8e9c1c2b3d4e",
    versionHash: "a".repeat(64),
    kind: "model",
    name: "Chair",
    parts: { model: "m".repeat(64), distant: "d".repeat(64), thumbnail: "t" },
    sidecar: {
        sizeM: { width: 0.8, height: 0.7, depth: 0.6 },
        plan: { outline: [], details: [] },
    },
    credits: {},
    createdAt: "2026-11-17 12:00:00",
    ...more,
});

describe("libraryModels", () => {
    it("finds each imported model by the items.model value that names it", () => {
        const models = libraryModels([asset()]);
        const value = `library:0b6f4a52-4f1e-4f8e-9a51-8e9c1c2b3d4e@${"a".repeat(64)}`;
        expect(models.get(value)).toMatchObject({
            value,
            modelHash: "m".repeat(64),
            distantHash: "d".repeat(64),
            lightHash: null,
            sidecar: { sizeM: { width: 0.8 } },
        });
    });

    it("names the Light copy kept beside a model clearly heavier than it (#1091)", () => {
        const withLight = (triangles: number) =>
            asset({
                parts: {
                    model: "m".repeat(64),
                    distant: "d".repeat(64),
                    thumbnail: "t",
                    light: "l".repeat(64),
                },
                sidecar: { ...asset().sidecar, triangles },
            });
        const [heavy] = libraryModels([withLight(900_000)]).values();
        expect(heavy?.lightHash).toBe("l".repeat(64));
        // An Original of 21,000 triangles: its Light copy wouldn't help a stuttering view
        const [light] = libraryModels([withLight(21_000)]).values();
        expect(light?.lightHash).toBeNull();
    });

    it("leaves out other kinds, and models missing a GLB or what the field reads", () => {
        expect(
            libraryModels([
                asset({ kind: "artwork" }),
                asset({ parts: { model: "m" } }),
                asset({ sidecar: { sizeM: { width: 1 } } }),
            ]).size,
        ).toBe(0);
        expect(libraryModels(undefined).size).toBe(0);
    });
});

describe("modelScale", () => {
    const sizeM = { width: 2, depth: 1 };

    it("is 1 at the model's real size, and the factor its Outline grew by", () => {
        expect(modelScale({ width: 2, depth: 1 }, sizeM)).toBe(1);
        expect(modelScale({ width: 1, depth: 0.5 }, sizeM)).toBeCloseTo(0.5);
    });

    it("grows a model stretched one way evenly, keeping its footprint's area", () => {
        expect(modelScale({ width: 8, depth: 1 }, sizeM)).toBeCloseTo(2);
    });

    it("is 1 when either size is missing", () => {
        expect(modelScale({ width: 0, depth: 1 }, sizeM)).toBe(1);
        expect(modelScale({ width: 2, depth: 1 }, { width: 2, depth: 0 })).toBe(
            1,
        );
    });
});

describe("proportionalSize", () => {
    const sizeM = { width: 2, depth: 1, height: 0.5 };

    it("sets one side and keeps the model's proportions in the others", () => {
        expect(proportionalSize(sizeM, "width", 4)).toEqual({
            width: 4,
            depth: 2,
            height: 1,
        });
        expect(proportionalSize(sizeM, "height", 0.25)).toEqual({
            width: 1,
            depth: 0.5,
            height: 0.25,
        });
    });

    it("links a flat model's width and depth, and leaves its height alone", () => {
        const flat = { width: 2, depth: 1, height: 0 };
        expect(proportionalSize(flat, "width", 4)).toEqual({
            width: 4,
            depth: 2,
        });
        expect(proportionalSize(flat, "height", 1)).toBeNull();
        expect(proportionalSize(sizeM, "width", 0)).toBeNull();
    });
});

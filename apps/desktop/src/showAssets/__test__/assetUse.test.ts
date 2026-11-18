import { describe, expect, it } from "vitest";
import type { ShowAsset } from "@/db-functions/showAssets";
import { LARGE_SHOW_ASSET_BYTES, showAssetUse, sizeParts } from "../assetUse";

const asset = (
    id: string,
    parts: Record<string, string>,
    name = id,
): ShowAsset => ({
    id: `0b6f4a52-4f1e-4f8e-9a51-8e9c1c2b3d${id}`,
    versionHash: "a".repeat(64),
    kind: "model",
    name,
    parts,
    sidecar: {},
    credits: {},
    createdAt: "2026-11-17 12:00:00",
});
const value = (a: ShowAsset) => `library:${a.id}@${a.versionHash}`;

const chair = asset("01", { model: "c", distant: "cd", thumbnail: "shared" });
const table = asset("02", { model: "t", thumbnail: "shared" });
const lamp = asset("03", { model: "l", distant: "l" });
const sizes = new Map([
    ["c", 1000],
    ["cd", 100],
    ["shared", 10],
    ["t", 2000],
    ["l", 500],
]);

describe("showAssetUse", () => {
    it("counts what names each asset now, and finds the ones nothing names", () => {
        const use = showAssetUse([chair, table, lamp], sizes, [
            value(chair),
            value(chair),
            null,
            "pit/marimba-5.0",
        ]);
        expect(use.assets.map((row) => row.uses)).toEqual([2, 0, 0]);
        expect(use.unused.map((row) => row.asset.name)).toEqual(["02", "03"]);
    });

    it("sizes each asset by its bytes, a blob it uses twice once", () => {
        const use = showAssetUse([chair, lamp], sizes, []);
        expect(use.assets.map((row) => row.bytes)).toEqual([1110, 500]);
        expect(use.totalBytes).toBe(3610);
    });

    it("frees only the bytes no used asset shares", () => {
        // The table shares the chair's thumbnail, and the chair is used
        const use = showAssetUse([chair, table, lamp], sizes, [value(chair)]);
        expect(use.unusedBytes).toBe(2000 + 500);
    });

    it("finds props naming an asset the show doesn't have", () => {
        const gone = `library:${"9".repeat(8)}-0000-4000-8000-000000000000@${"b".repeat(64)}`;
        const use = showAssetUse([chair], sizes, [gone, gone, value(chair)]);
        expect(use.missing).toEqual([gone]);
        expect(use.missingUses).toBe(2);
    });

    it("says a show is large past 500 MB", () => {
        expect(LARGE_SHOW_ASSET_BYTES).toBe(500 * 1024 * 1024);
    });
});

describe("sizeParts", () => {
    it("picks a unit and keeps one decimal below 10", () => {
        expect(sizeParts(12)).toEqual({ value: "12", unit: "bytes" });
        expect(sizeParts(4.1 * 1024 * 1024)).toEqual({
            value: "4.1",
            unit: "mb",
        });
        expect(sizeParts(820 * 1024)).toEqual({ value: "820", unit: "kb" });
        expect(sizeParts(2 * 1024 ** 3)).toEqual({ value: "2", unit: "gb" });
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { showAssetGroups } from "../showAssetGroups";
import { h, librarySummary, showItem } from "./showFixtures";

describe("showAssetGroups", () => {
    it("groups the show's items like the Library, sorted by name", () => {
        const groups = showAssetGroups(
            [
                showItem(1, "Sunrise silk"),
                showItem(2, "Riser", {
                    kind: "model",
                    sidecar: { kind: "prop" },
                }),
                showItem(3, "Autumn silk"),
                showItem(4, "Tarp", { sidecar: { surface: "baseFloor" } }),
            ],
            [],
        );
        expect(
            groups.map((g) => [g.group, g.items.map((i) => i.name)]),
        ).toEqual([
            ["silks", ["Autumn silk", "Sunrise silk"]],
            ["floors", ["Tarp"]],
            ["props", ["Riser"]],
        ]);
    });

    it("shows one entry per Library item, from its newest embedded Version", () => {
        const old = showItem(1, "Silk v1", {
            embeddedAt: "2026-10-01T00:00:00.000Z",
        });
        const newer = showItem(1, "Silk v2", {
            versionHash: h("b"),
            embeddedAt: "2026-10-03T00:00:00.000Z",
        });
        const [group] = showAssetGroups([newer, old], []);
        expect(group.items).toHaveLength(1);
        expect(group.items[0]).toMatchObject({
            name: "Silk v2",
            versions: 2,
        });
        expect(group.items[0].newest.versionHash).toBe(h("b"));
    });

    it("marks what the Library lacks, and leaves it unknown while the Library is", () => {
        const kept = showItem(1, "Kept");
        const missing = showItem(2, "Missing");
        const [known] = showAssetGroups(
            [kept, missing],
            [librarySummary(kept)],
        );
        expect(
            Object.fromEntries(known.items.map((i) => [i.name, i.inLibrary])),
        ).toEqual({ Kept: true, Missing: false });
        const [unknown] = showAssetGroups([kept, missing], null);
        expect(unknown.items.every((i) => i.inLibrary === null)).toBe(true);
    });

    it("notes a newer Version or changed details in the Library", () => {
        const behind = showItem(1, "Behind");
        const renamed = showItem(2, "Old name");
        const current = showItem(3, "Current");
        const [group] = showAssetGroups(
            [behind, renamed, current],
            [
                librarySummary(behind, {
                    versions: [behind.versionHash, h("f")],
                }),
                librarySummary(renamed, { name: "New name" }),
                librarySummary(current),
            ],
        );
        expect(
            Object.fromEntries(group.items.map((i) => [i.name, i.update])),
        ).toEqual({ Behind: "version", Current: null, "Old name": "metadata" });
    });
});

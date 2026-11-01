// @vitest-environment node
import { describe, expect, it } from "vitest";
import { exportableFieldJson, importedFieldJson } from "../fieldFileFloor";

const floor = {
    itemId: "6b1f3c1e-5a43-4d0e-9a51-2f7c8e9d0a11",
    versionHash: "b".repeat(64),
};

describe("field files and the show's floor (D-23)", () => {
    it("leaves the floor out of an exported field file", () => {
        const json = JSON.stringify({ name: "Gym", floor, useHashes: true });
        expect(JSON.parse(exportableFieldJson(json))).toEqual({
            name: "Gym",
            useHashes: true,
        });
    });

    it("keeps the show's floor when a field file is imported", () => {
        const current = JSON.stringify({ name: "Old", floor });
        const imported = { name: "Gym", useHashes: true };
        expect(JSON.parse(importedFieldJson(imported, current))).toEqual({
            name: "Gym",
            useHashes: true,
            floor,
        });
    });

    it("imports without a floor when the show has none", () => {
        const imported = { name: "Gym" };
        expect(
            JSON.parse(
                importedFieldJson(imported, JSON.stringify({ name: "Old" })),
            ),
        ).toEqual({ name: "Gym" });
    });
});

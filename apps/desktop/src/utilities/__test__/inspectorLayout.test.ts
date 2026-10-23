import { describe, expect, it } from "vitest";
import { inspectorLayout } from "../inspectorLayout";

describe("inspectorLayout", () => {
    it("always shows, with no button, with a mouse on a wide window", () => {
        expect(inspectorLayout(1440, false, null)).toEqual({
            collapsible: false,
            open: true,
        });
        expect(inspectorLayout(1440, false, false)).toEqual({
            collapsible: false,
            open: true,
        });
    });
    it("starts hidden on a portrait tablet and showing on a landscape one", () => {
        expect(inspectorLayout(820, true, null)).toEqual({
            collapsible: true,
            open: false,
        });
        expect(inspectorLayout(1180, true, null)).toEqual({
            collapsible: true,
            open: true,
        });
    });
    it("folds on a narrow window with a mouse too", () => {
        expect(inspectorLayout(800, false, null)).toEqual({
            collapsible: true,
            open: false,
        });
    });
    it("follows the person's choice", () => {
        expect(inspectorLayout(820, true, true).open).toBe(true);
        expect(inspectorLayout(1366, true, false).open).toBe(false);
    });
});

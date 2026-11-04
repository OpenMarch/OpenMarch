import { beforeEach, describe, expect, it, vi } from "vitest";

/** The shape guides' settings (#634): each shown until hidden, and remembered */
describe("shape guides", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    it("are both shown until hidden, each on its own, and stay as set", async () => {
        const { useShapeGuidesStore, SHAPE_GUIDES_STORAGE_KEY } =
            await import("../shapeGuides");
        expect(useShapeGuidesStore.getState().shown).toEqual({
            circle: true,
            angles: true,
        });
        useShapeGuidesStore.getState().toggle("angles");
        expect(useShapeGuidesStore.getState().shown).toEqual({
            circle: true,
            angles: false,
        });
        expect(
            JSON.parse(localStorage.getItem(SHAPE_GUIDES_STORAGE_KEY)!),
        ).toEqual([{ circle: true, angles: false }]);
        vi.resetModules();
        const again = await import("../shapeGuides");
        expect(again.useShapeGuidesStore.getState().shown.angles).toBe(false);
        expect(again.useShapeGuidesStore.getState().shown.circle).toBe(true);
    });
});

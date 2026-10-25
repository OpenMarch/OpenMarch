import { describe, expect, it } from "vitest";
import {
    inspectorLayout,
    inspectorPresentation,
    shouldHintInspector,
    type InspectorLayout,
} from "../inspectorLayout";

const none = { side: null, drawer: false };

describe("inspectorPresentation", () => {
    it("keeps the desktop layout with a mouse on a wide window", () => {
        expect(inspectorPresentation(1440, 900, false)).toBe("fixed");
        // A tall desktop monitor too
        expect(inspectorPresentation(1080, 1920, false)).toBe("fixed");
    });
    it("uses a drawer on narrow windows and portrait tablets", () => {
        expect(inspectorPresentation(744, 1133, true)).toBe("drawer"); // iPad mini
        expect(inspectorPresentation(820, 1180, true)).toBe("drawer"); // iPad Air
        expect(inspectorPresentation(800, 1280, true)).toBe("drawer"); // Galaxy Tab S9
        expect(inspectorPresentation(912, 1368, true)).toBe("drawer"); // Surface Pro
        expect(inspectorPresentation(1032, 1376, true)).toBe("drawer"); // iPad Pro 13
        // The mouse layout never changes: a small desktop window keeps it beside the field
        expect(inspectorPresentation(900, 700, false)).toBe("fixed");
    });
    it("goes beside the field on wide landscape tablets", () => {
        expect(inspectorPresentation(1180, 820, true)).toBe("side");
        expect(inspectorPresentation(1133, 744, true)).toBe("side");
        expect(inspectorPresentation(1368, 912, true)).toBe("side");
    });
});

describe("inspectorLayout", () => {
    it("always shows the fixed panel", () => {
        expect(inspectorLayout(1440, 900, false, none)).toEqual({
            presentation: "fixed",
            open: true,
        });
        expect(
            inspectorLayout(1440, 900, false, { side: false, drawer: false })
                .open,
        ).toBe(true);
    });
    it("starts with the side panel showing and the drawer closed", () => {
        expect(inspectorLayout(1180, 820, true, none).open).toBe(true);
        expect(inspectorLayout(820, 1180, true, none).open).toBe(false);
    });
    it("keeps the two choices apart, so turning the tablet doesn't open the drawer", () => {
        const choices = { side: true, drawer: false };
        expect(inspectorLayout(1180, 820, true, choices).open).toBe(true);
        expect(inspectorLayout(820, 1180, true, choices).open).toBe(false);
        expect(
            inspectorLayout(820, 1180, true, { side: null, drawer: true }).open,
        ).toBe(true);
        expect(
            inspectorLayout(1180, 820, true, { side: false, drawer: true })
                .open,
        ).toBe(false);
    });
});

describe("shouldHintInspector", () => {
    const closed: InspectorLayout = { presentation: "drawer", open: false };
    it("hints when something new is selected behind the closed tab", () => {
        expect(shouldHintInspector([], [3], closed)).toBe(true);
        expect(shouldHintInspector([3], [3, 4], closed)).toBe(true);
        expect(shouldHintInspector([3], [4], closed)).toBe(true);
    });
    it("stays quiet otherwise", () => {
        expect(shouldHintInspector([3], [3], closed)).toBe(false);
        expect(shouldHintInspector([3, 4], [3], closed)).toBe(false);
        expect(shouldHintInspector([3], [], closed)).toBe(false);
        expect(
            shouldHintInspector([], [3], {
                presentation: "drawer",
                open: true,
            }),
        ).toBe(false);
        expect(
            shouldHintInspector([], [3], { presentation: "fixed", open: true }),
        ).toBe(false);
    });
});

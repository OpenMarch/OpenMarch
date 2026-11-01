// @vitest-environment node
import { describe, expect, it } from "vitest";
import { wheelScrollsSideways } from "../timelineWheel";

const wide = {
    scrollWidth: 2000,
    clientWidth: 800,
    scrollHeight: 100,
    clientHeight: 100,
};
const wideAndTall = { ...wide, scrollHeight: 300 };

describe("wheelScrollsSideways", () => {
    it("turns a vertical wheel sideways when the tracks fit", () => {
        expect(wheelScrollsSideways(wide, 0, 100)).toBe(true);
    });
    it("leaves a vertical wheel to scroll the tracks when they overflow", () => {
        expect(wheelScrollsSideways(wideAndTall, 0, 100)).toBe(false);
    });
    it("leaves a horizontal swipe to the browser", () => {
        expect(wheelScrollsSideways(wide, 100, 5)).toBe(false);
    });
    it("does nothing when the timeline does not overflow sideways", () => {
        expect(
            wheelScrollsSideways({ ...wide, scrollWidth: 800 }, 0, 100),
        ).toBe(false);
    });
});

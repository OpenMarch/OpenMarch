import { describe, expect, it } from "vitest";
import {
    HOLD_STYLES,
    holdStyleOf,
    joinedHoldStyle,
    sharedHoldStyle,
} from "../holdStyle";

/** Hold style (ADR 0015 D-5; fork #775): reading a stored style, joined holds, a selection. */

describe("holdStyleOf", () => {
    it("reads the three styles, and anything else as the show setting", () => {
        for (const style of HOLD_STYLES) expect(holdStyleOf(style)).toBe(style);
        expect(holdStyleOf(null)).toBeNull();
        expect(holdStyleOf(undefined)).toBeNull();
        expect(holdStyleOf("default")).toBeNull();
        // A later build's value
        expect(holdStyleOf("slowMarkTime")).toBeNull();
        expect(holdStyleOf(1)).toBeNull();
    });
});

describe("joinedHoldStyle", () => {
    it("is the style of the earliest part that has one", () => {
        expect(joinedHoldStyle([null, "markTime", "stand"])).toBe("markTime");
        expect(joinedHoldStyle(["stand", "markTime"])).toBe("stand");
        expect(joinedHoldStyle([undefined, null])).toBeNull();
        expect(joinedHoldStyle([])).toBeNull();
    });
});

describe("sharedHoldStyle", () => {
    it("is the one style the holds share, the show setting included", () => {
        expect(sharedHoldStyle(["markTime", "markTime"])).toBe("markTime");
        expect(sharedHoldStyle([null, undefined])).toBeNull();
    });

    it("is mixed where they differ, and nothing with no holds", () => {
        expect(sharedHoldStyle(["markTime", null])).toBe("mixed");
        expect(sharedHoldStyle(["stand", "highMarkTime"])).toBe("mixed");
        expect(sharedHoldStyle([])).toBeUndefined();
    });
});

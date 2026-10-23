import { describe, expect, it } from "vitest";
import { parsePreference, resolveInputMode } from "../InputModeStore";

describe("resolveInputMode", () => {
    it("pins touch and mouse regardless of presses", () => {
        expect(resolveInputMode("touch", "mouse", false)).toBe("touch");
        expect(resolveInputMode("mouse", "touch", true)).toBe("pointer");
    });

    it("starts from the device before any press", () => {
        expect(resolveInputMode("auto", null, true)).toBe("touch");
        expect(resolveInputMode("auto", null, false)).toBe("pointer");
    });

    it("follows the last press in auto", () => {
        expect(resolveInputMode("auto", "touch", false)).toBe("touch");
        expect(resolveInputMode("auto", "pen", false)).toBe("touch");
        expect(resolveInputMode("auto", "mouse", true)).toBe("pointer");
    });
});

describe("parsePreference", () => {
    it("falls back to auto for anything unknown", () => {
        expect(parsePreference(null)).toBe("auto");
        expect(parsePreference("bogus")).toBe("auto");
        expect(parsePreference("touch")).toBe("touch");
    });
});

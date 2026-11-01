// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parsePreference, resolveInputMode } from "../InputModeStore";

describe("resolveInputMode", () => {
    it("pins touch and mouse regardless of the device", () => {
        expect(resolveInputMode("touch", false)).toBe("touch");
        expect(resolveInputMode("mouse", true)).toBe("pointer");
    });

    it("follows the device in auto", () => {
        expect(resolveInputMode("auto", true)).toBe("touch");
        expect(resolveInputMode("auto", false)).toBe("pointer");
    });
});

describe("parsePreference", () => {
    it("falls back to auto for anything unknown", () => {
        expect(parsePreference(null)).toBe("auto");
        expect(parsePreference("bogus")).toBe("auto");
        expect(parsePreference("touch")).toBe("touch");
    });
});

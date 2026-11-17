// @vitest-environment node
import { describe, expect, it } from "vitest";
import { windowWinsOverHold } from "../heldRules";

describe("windowWinsOverHold (R2, M6)", () => {
    const hold = { start: 16 };

    it("a window starting inside the hold wins", () => {
        expect(windowWinsOverHold(17, hold)).toBe(true);
        expect(windowWinsOverHold(24, hold)).toBe(true);
    });

    it("a window starting at or before the hold's start moves the hold", () => {
        expect(windowWinsOverHold(16, hold)).toBe(false);
        expect(windowWinsOverHold(8, hold)).toBe(false);
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { heldOneAt, windowWinsOverHold } from "../heldRules";

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

describe("heldOneAt (R1)", () => {
    const marks = [
        { marcherId: 1, start: 16, end: 32 },
        { marcherId: 2, start: 24, end: 32 },
        { marcherId: 3, start: 24, end: 40 },
        { marcherId: 4, start: 28, end: 32 },
    ];

    it("is the hold over the count that starts latest, the lowest marcher id's on a tie", () => {
        expect(heldOneAt(marks, 26)).toEqual(marks[1]);
        expect(heldOneAt([...marks].reverse(), 26)).toEqual(marks[1]);
        // 4's hold starts at 28, so count 28 isn't inside it yet
        expect(heldOneAt(marks, 28)?.marcherId).toBe(2);
        expect(heldOneAt(marks, 30)?.marcherId).toBe(4);
    });

    it("is undefined when no hold is over the count", () => {
        expect(heldOneAt(marks, 16)).toBeUndefined();
        expect(heldOneAt(marks, 41)).toBeUndefined();
        expect(heldOneAt([], 20)).toBeUndefined();
    });
});

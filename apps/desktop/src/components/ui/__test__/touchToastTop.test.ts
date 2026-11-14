// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BELOW_TASK_GAP, touchToastTop } from "../Toaster";

describe("touchToastTop (#933)", () => {
    it("starts just below the toolbar with no task bar showing", () => {
        expect(touchToastTop(56, [])).toBe(64);
    });

    it("starts a touch target below the isolation bar, so its Undo is nowhere near Done", () => {
        // The isolation bar at the field's top, with Done at its right end
        const bar = { top: 64, bottom: 107 };
        expect(touchToastTop(56, [bar])).toBe(107 + BELOW_TASK_GAP);
    });

    it("ignores a task's card lower down the field (the prop tool's)", () => {
        expect(touchToastTop(56, [{ top: 560, bottom: 700 }])).toBe(64);
    });
});

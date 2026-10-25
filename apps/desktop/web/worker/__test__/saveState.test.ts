// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hasUnsavedChanges } from "../saveState";

describe("hasUnsavedChanges", () => {
    it("is true from the change until the save stores it", () => {
        const saved = { path: "/a.dots", changes: 4 };
        expect(hasUnsavedChanges(saved, "/a.dots", 4)).toBe(false);
        // Changed; the save waits on its delay or a transaction
        expect(hasUnsavedChanges(saved, "/a.dots", 5)).toBe(true);
    });
    it("counts a show that was never stored, or a different one, as unsaved", () => {
        expect(hasUnsavedChanges(null, "/a.dots", 0)).toBe(true);
        expect(
            hasUnsavedChanges({ path: "/b.dots", changes: 4 }, "/a.dots", 4),
        ).toBe(true);
    });
});

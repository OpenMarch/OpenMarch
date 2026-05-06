import { describe, expect, it } from "vitest";
import { shouldCancelLightingGroupDragStart } from "@/utilities/lightingGroupEffectDnD";

describe("shouldCancelLightingGroupDragStart", () => {
    it("returns false for plain div target", () => {
        const div = document.createElement("div");
        expect(shouldCancelLightingGroupDragStart(div)).toBe(false);
    });

    it("returns true when target is a button", () => {
        const button = document.createElement("button");
        expect(shouldCancelLightingGroupDragStart(button)).toBe(true);
    });

    it("returns true when target is inside a button", () => {
        const button = document.createElement("button");
        const span = document.createElement("span");
        button.appendChild(span);
        expect(shouldCancelLightingGroupDragStart(span)).toBe(true);
    });

    it("returns true for input", () => {
        const input = document.createElement("input");
        expect(shouldCancelLightingGroupDragStart(input)).toBe(true);
    });

    it("returns true for role=button", () => {
        const el = document.createElement("div");
        el.setAttribute("role", "button");
        expect(shouldCancelLightingGroupDragStart(el)).toBe(true);
    });
});

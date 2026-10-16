import { describe, expect, it } from "vitest";
import { centerAtBase } from "@/field/editor/view";
import { cameraBounds, elementToField, fieldToElement } from "../fieldView";

const field = { width: 1600, height: 850 };

describe("cameraBounds", () => {
    it("puts the element's corners where fieldToElement puts field points", () => {
        const view = centerAtBase(1000, 600, field);
        const { left, right, top, bottom } = cameraBounds(view);
        expect(fieldToElement(view, left, top)).toEqual({ x: 0, y: 0 });
        const corner = fieldToElement(view, right, bottom);
        expect(corner.x).toBeCloseTo(1000);
        expect(corner.y).toBeCloseTo(600);
        // Field y grows down the screen
        expect(top).toBeLessThan(bottom);
    });
});

describe("elementToField", () => {
    it("undoes fieldToElement", () => {
        const view = centerAtBase(1200, 700, field);
        const at = fieldToElement(view, 321.5, 87);
        const back = elementToField(view, at.x, at.y);
        expect(back.x).toBeCloseTo(321.5);
        expect(back.y).toBeCloseTo(87);
    });
});

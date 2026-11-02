import { describe, expect, it } from "vitest";
import { shapeKeywords } from "../useShapePaletteSource";
import { boxTool } from "../../box/boxTool";
import { curveTool, lineTool } from "../../line/lineTool";

/** The words the command bar finds a shape kind by, besides its name (#411, #525) */
describe("a shape's keywords in the command bar", () => {
    it("finds the Line by its own id", () => {
        expect(shapeKeywords(lineTool)).toEqual(["line"]);
    });

    it("finds the Curve by its own words, not the Line's", () => {
        const words = shapeKeywords(curveTool);
        expect(words).toEqual(
            expect.arrayContaining(["curve", "arc-like", "smooth"]),
        );
        expect(words).not.toContain("line");
    });

    it("finds a saved shape by its kind's id and name", () => {
        expect(
            shapeKeywords(lineTool, { id: "s1", label: "Company front" }),
        ).toEqual(["line", "Line"]);
    });

    it("finds the Box by its layouts too", () => {
        expect(shapeKeywords(boxTool)).toContain("stagger");
    });
});

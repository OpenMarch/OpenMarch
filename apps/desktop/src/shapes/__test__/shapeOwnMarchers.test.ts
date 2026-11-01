// @vitest-environment node
import { describe, expect, it } from "vitest";
import { withoutShapeMarchers } from "../field/shapeOwnMarchers";

/**
 * Start flag positions (previous paths, #331) while a shape is open (#417): the shape's own
 * marchers' dots and routes give way to its ghosts and walks; everyone else keeps theirs
 */
describe("start flag positions with a shape open", () => {
    it("leave out the shape's own marchers", () => {
        expect(withoutShapeMarchers([1, 2, 3, 4], new Set([2, 4]))).toEqual([
            1, 3,
        ]);
    });

    it("are everyone's with no shape showing", () => {
        const ids = [1, 2, 3];
        expect(withoutShapeMarchers(ids, null)).toBe(ids);
        expect(withoutShapeMarchers(undefined, new Set([1]))).toBeUndefined();
    });
});

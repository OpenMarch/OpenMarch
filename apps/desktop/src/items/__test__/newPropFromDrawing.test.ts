// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PIXELS_PER_METER } from "../itemOutlines";
import { newPropFromDrawing } from "../newPropFromDrawing";

describe("newPropFromDrawing", () => {
    it("makes a prop at home on the drawing's center, sized in meters", () => {
        expect(
            newPropFromDrawing(
                {
                    outlineType: "rectangle",
                    centerX: 100,
                    centerY: 60,
                    widthPixels: 2 * PIXELS_PER_METER,
                    depthPixels: PIXELS_PER_METER,
                },
                12,
            ),
        ).toEqual({
            kind: "prop",
            surfaceType: "floor",
            home: [100, 60],
            beatId: 12,
            geometry: {
                outlineType: "rectangle",
                width: 2,
                depth: 1,
                customOutline: null,
            },
        });
    });

    it("keeps a drawn shape's points, size-free", () => {
        const prop = newPropFromDrawing(
            {
                outlineType: "polygon",
                centerX: 50,
                centerY: 20,
                widthPixels: 100,
                depthPixels: 40,
                points: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 50, y: 40 },
                ],
            },
            3,
        );
        expect(prop.geometry.customOutline).toEqual({
            points: [
                { x: -0.5, y: -0.5 },
                { x: 0.5, y: -0.5 },
                { x: 0, y: 0.5 },
            ],
        });
    });
});

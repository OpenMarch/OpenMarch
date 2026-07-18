import { describe, expect, it } from "vitest";
import { fabric } from "fabric";
import {
    PROP_SHAPES,
    createPropFabricShape,
    type CreateShapeParams,
} from "../propShapes";

const baseProps: CreateShapeParams["baseProps"] = {
    fill: "#fff",
    stroke: "#000",
};

describe("PROP_SHAPES interaction metadata", () => {
    it("classifies each shape by interaction style", () => {
        expect(PROP_SHAPES.rectangle.interaction).toBe("drag");
        expect(PROP_SHAPES.circle.interaction).toBe("drag");
        expect(PROP_SHAPES.polygon.interaction).toBe("click");
        expect(PROP_SHAPES.arc.interaction).toBe("click");
        expect(PROP_SHAPES.freehand.interaction).toBe("freehand");
        // polygon finishes on double-click; arc auto-completes at 3 points
        expect(PROP_SHAPES.polygon.completeOnDoubleClick).toBe(true);
        expect(PROP_SHAPES.polygon.minPoints).toBe(3);
        expect(PROP_SHAPES.arc.maxPoints).toBe(3);
    });
});

describe("createFabricShape", () => {
    it("rectangle → fabric.Rect sized from width/height", () => {
        const shape = PROP_SHAPES.rectangle.createFabricShape({
            customData: null,
            widthPixels: 40,
            heightPixels: 20,
            baseProps,
        });
        expect(shape).toBeInstanceOf(fabric.Rect);
        expect(shape).toMatchObject({ width: 40, height: 20 });
    });

    it("circle → fabric.Ellipse with rx/ry = half width/height", () => {
        const shape = PROP_SHAPES.circle.createFabricShape({
            customData: null,
            widthPixels: 40,
            heightPixels: 30,
            baseProps,
        });
        expect(shape).toBeInstanceOf(fabric.Ellipse);
        expect(shape).toMatchObject({ rx: 20, ry: 15 });
    });

    it("polygon with valid custom points → fabric.Polygon", () => {
        const shape = PROP_SHAPES.polygon.createFabricShape({
            customData: {
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 5, y: 10 },
                ],
                originalWidth: 10,
                originalHeight: 10,
            },
            widthPixels: 10,
            heightPixels: 10,
            baseProps,
        });
        expect(shape).toBeInstanceOf(fabric.Polygon);
        expect((shape as fabric.Polygon).points).toHaveLength(3);
    });

    it("polygon with too few points → null (caller falls back to rect)", () => {
        const shape = PROP_SHAPES.polygon.createFabricShape({
            customData: { points: [{ x: 0, y: 0 }] },
            widthPixels: 10,
            heightPixels: 10,
            baseProps,
        });
        expect(shape).toBeNull();
    });

    it("arc with 3 custom points → fabric.Path", () => {
        const shape = PROP_SHAPES.arc.createFabricShape({
            customData: {
                points: [
                    { x: 0, y: 0 },
                    { x: 5, y: 10 },
                    { x: 10, y: 0 },
                ],
                originalWidth: 10,
                originalHeight: 10,
            },
            widthPixels: 10,
            heightPixels: 10,
            baseProps,
        });
        expect(shape).toBeInstanceOf(fabric.Path);
    });

    it("freehand closes the path by default, leaves open when closed=false", () => {
        const points = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
        ];
        const closed = PROP_SHAPES.freehand.createFabricShape({
            customData: { points, originalWidth: 10, originalHeight: 10 },
            widthPixels: 10,
            heightPixels: 10,
            baseProps,
        }) as fabric.Path;
        const open = PROP_SHAPES.freehand.createFabricShape({
            customData: {
                points,
                originalWidth: 10,
                originalHeight: 10,
                closed: false,
            },
            widthPixels: 10,
            heightPixels: 10,
            baseProps,
        }) as fabric.Path;
        // A closed path has a trailing "z"/"Z" segment; an open one does not.
        const lastClosed = closed.path![closed.path!.length - 1] as unknown[];
        const lastOpen = open.path![open.path!.length - 1] as unknown[];
        expect(String(lastClosed[0]).toLowerCase()).toBe("z");
        expect(String(lastOpen[0]).toLowerCase()).not.toBe("z");
    });

    it("createPropFabricShape falls back to rectangle for unknown shape", () => {
        const shape = createPropFabricShape("nonsense", {
            customData: null,
            widthPixels: 12,
            heightPixels: 8,
            baseProps,
        });
        expect(shape).toBeInstanceOf(fabric.Rect);
        expect(shape).toMatchObject({ width: 12, height: 8 });
    });

    it("createPropFabricShape falls back to rectangle when custom geometry invalid", () => {
        const shape = createPropFabricShape("polygon", {
            customData: null,
            widthPixels: 12,
            heightPixels: 8,
            baseProps,
        });
        expect(shape).toBeInstanceOf(fabric.Rect);
    });
});

describe("finalize", () => {
    it("rectangle: rejects sub-10px drags", () => {
        const geom = PROP_SHAPES.rectangle.finalize({
            startPoint: { x: 0, y: 0 },
            points: [],
            endPoint: { x: 5, y: 100 },
        });
        expect(geom).toBeNull();
    });

    it("rectangle: builds centered bounding box", () => {
        const geom = PROP_SHAPES.rectangle.finalize({
            startPoint: { x: 100, y: 100 },
            points: [],
            endPoint: { x: 40, y: 60 },
        });
        expect(geom).toEqual({
            shapeType: "rectangle",
            centerX: 70,
            centerY: 80,
            widthPixels: 60,
            heightPixels: 40,
        });
    });

    it("circle: rejects sub-10px radius", () => {
        const geom = PROP_SHAPES.circle.finalize({
            startPoint: { x: 0, y: 0 },
            points: [],
            endPoint: { x: 3, y: 4 }, // radius 5
        });
        expect(geom).toBeNull();
    });

    it("circle: radius from center to endpoint, diameter = width/height", () => {
        const geom = PROP_SHAPES.circle.finalize({
            startPoint: { x: 0, y: 0 },
            points: [],
            endPoint: { x: 30, y: 40 }, // radius 50
        });
        expect(geom).toMatchObject({
            shapeType: "circle",
            centerX: 0,
            centerY: 0,
            widthPixels: 100,
            heightPixels: 100,
            radiusX: 50,
            radiusY: 50,
        });
    });

    it("polygon: needs at least 3 points", () => {
        expect(
            PROP_SHAPES.polygon.finalize({
                startPoint: null,
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ],
            }),
        ).toBeNull();
    });

    it("polygon: preserves points and computes bounding box", () => {
        const geom = PROP_SHAPES.polygon.finalize({
            startPoint: null,
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 5, y: 8 },
            ],
        });
        expect(geom).toMatchObject({
            shapeType: "polygon",
            centerX: 5,
            centerY: 4,
            widthPixels: 10,
            heightPixels: 8,
        });
        expect(geom!.points).toHaveLength(3);
    });

    it("arc: requires exactly 3 points and reorders control point last", () => {
        expect(
            PROP_SHAPES.arc.finalize({ startPoint: null, points: [] }),
        ).toBeNull();
        // click order: endpoint1, endpoint2, control
        const geom = PROP_SHAPES.arc.finalize({
            startPoint: null,
            points: [
                { x: 0, y: 0 }, // endpoint1
                { x: 10, y: 0 }, // endpoint2
                { x: 5, y: 10 }, // control
            ],
        });
        // stored as [endpoint1, control, endpoint2]
        expect(geom!.points).toEqual([
            { x: 0, y: 0 },
            { x: 5, y: 10 },
            { x: 10, y: 0 },
        ]);
    });

    it("freehand: needs 3+ points and simplifies", () => {
        expect(
            PROP_SHAPES.freehand.finalize({
                startPoint: null,
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                ],
            }),
        ).toBeNull();
        // Collinear points collapse to endpoints after simplification.
        const geom = PROP_SHAPES.freehand.finalize({
            startPoint: null,
            points: [
                { x: 0, y: 0 },
                { x: 5, y: 0 },
                { x: 10, y: 0 },
            ],
        });
        expect(geom!.shapeType).toBe("freehand");
        expect(geom!.points).toEqual([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ]);
    });
});

describe("createPreview", () => {
    it("rectangle preview anchors at the min corner", () => {
        const preview = PROP_SHAPES.rectangle.createPreview({
            startPoint: { x: 100, y: 100 },
            points: [],
            currentPoint: { x: 40, y: 60 },
        });
        expect(preview).toBeInstanceOf(fabric.Rect);
        expect(preview).toMatchObject({
            left: 40,
            top: 60,
            width: 60,
            height: 40,
        });
    });

    it("rectangle preview null without a start point", () => {
        expect(
            PROP_SHAPES.rectangle.createPreview({
                startPoint: null,
                points: [],
                currentPoint: { x: 0, y: 0 },
            }),
        ).toBeNull();
    });

    it("circle preview radius = distance to cursor", () => {
        const preview = PROP_SHAPES.circle.createPreview({
            startPoint: { x: 0, y: 0 },
            points: [],
            currentPoint: { x: 3, y: 4 },
        });
        expect(preview).toBeInstanceOf(fabric.Circle);
        expect((preview as fabric.Circle).radius).toBeCloseTo(5);
    });

    it("polygon preview includes the cursor point", () => {
        const preview = PROP_SHAPES.polygon.createPreview({
            startPoint: null,
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ],
            currentPoint: { x: 5, y: 8 },
        });
        expect(preview).toBeInstanceOf(fabric.Polygon);
        expect((preview as fabric.Polygon).points).toHaveLength(3);
    });

    it("arc preview: a line for the first segment, a curve after", () => {
        const line = PROP_SHAPES.arc.createPreview({
            startPoint: null,
            points: [{ x: 0, y: 0 }],
            currentPoint: { x: 10, y: 0 },
        });
        const curve = PROP_SHAPES.arc.createPreview({
            startPoint: null,
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ],
            currentPoint: { x: 5, y: 8 },
        });
        expect(line).toBeInstanceOf(fabric.Path);
        expect(curve).toBeInstanceOf(fabric.Path);
        // The curve preview uses a quadratic (Q) command.
        const hasQuadratic = (curve as fabric.Path).path!.some(
            (seg) => String((seg as unknown[])[0]).toUpperCase() === "Q",
        );
        expect(hasQuadratic).toBe(true);
    });

    it("freehand preview null below 2 points", () => {
        expect(
            PROP_SHAPES.freehand.createPreview({
                startPoint: null,
                points: [{ x: 0, y: 0 }],
                currentPoint: { x: 0, y: 0 },
            }),
        ).toBeNull();
    });
});

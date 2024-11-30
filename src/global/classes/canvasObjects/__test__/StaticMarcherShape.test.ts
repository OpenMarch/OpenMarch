import { beforeEach, describe, expect, it } from "vitest";
import { ShapePath, ShapePoint, VanillaPoint } from "../StaticMarcherShape";
import OpenMarchCanvas from "../OpenMarchCanvas";
import FieldPropertiesTemplates from "../../FieldProperties.templates";
import { falsyUiSettings } from "@/components/canvas/__test__/MocksForCanvas";

describe.todo("StaticMarcherShape", () => {
    let canvas: OpenMarchCanvas;
    const mockFieldProperties =
        FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;

    beforeEach(() => {
        canvas = new OpenMarchCanvas({
            canvasRef: null,
            fieldProperties: mockFieldProperties,
            uiSettings: falsyUiSettings,
        });
    });
});

describe("ShapePoint", () => {
    describe("Generators", () => {
        it("should generate a line point", () => {
            const point = ShapePoint.Line(100, 200);
            expect(point.command).toBe("L");
            expect(point.coordinates).toEqual([{ x: 100, y: 200 }]);
        });

        it("should generate a move point", () => {
            const point = ShapePoint.Move(150, 250);
            expect(point.command).toBe("M");
            expect(point.coordinates).toEqual([{ x: 150, y: 250 }]);
        });

        it("should generate a quadratic curve point", () => {
            const point = ShapePoint.Quadratic(100, 200, 300, 400);
            expect(point.command).toBe("Q");
            expect(point.coordinates).toEqual([
                { x: 100, y: 200 },
                { x: 300, y: 400 },
            ]);
        });

        it("should generate a cubic curve point", () => {
            const point = ShapePoint.Cubic(100, 200, 300, 400, 500, 600);
            expect(point.command).toBe("C");
            expect(point.coordinates).toEqual([
                { x: 100, y: 200 },
                { x: 300, y: 400 },
                { x: 500, y: 600 },
            ]);
        });

        it("should generate a close point", () => {
            const point = ShapePoint.Close();
            expect(point.command).toBe("Z");
            expect(point.coordinates).toEqual([]);
        });
    });

    describe("toString", () => {
        it("should return a string representation of the point", () => {
            const point = ShapePoint.Move(100, 200);
            expect(point.toString()).toBe("M 100 200 ");
        });

        it("should return a string representation of the point", () => {
            const point = ShapePoint.Line(100, 200);
            expect(point.toString()).toBe("L 100 200 ");
        });

        it("should return a string representation of the point", () => {
            const point = ShapePoint.Quadratic(100, 200, 300, 400);
            expect(point.toString()).toBe("Q 100 200 300 400 ");
        });

        it("should return a string representation of the point", () => {
            const point = ShapePoint.Cubic(100, 200, 300, 400, 500, 600);
            expect(point.toString()).toBe("C 100 200 300 400 500 600 ");
        });

        it("should return a string representation of the point", () => {
            const point = ShapePoint.Close();
            expect(point.toString()).toBe("Z  ");
        });
    });

    describe("pointsToString", () => {
        it("should return a string representation of the points", () => {
            const points = [
                ShapePoint.Move(100, 200),
                ShapePoint.Line(100, 200),
                ShapePoint.Quadratic(100, 200, 300, 400),
                ShapePoint.Cubic(100, 200, 300, 400, 500, 600),
                ShapePoint.Close(),
            ];
            expect(ShapePoint.pointsToString(points)).toBe(
                "M 100 200 L 100 200 Q 100 200 300 400 C 100 200 300 400 500 600 Z  ",
            );
        });
    });

    describe("fromArray", () => {
        it("should convert an array of VanillaPoint to an array of ShapePoint", () => {
            const array: VanillaPoint[] = [
                ["M", 100, 200],
                ["L", 100, 200],
                ["Q", 100, 200, 300, 400],
                ["C", 100, 200, 300, 400, 500, 600],
                ["Z"],
            ];
            const points = ShapePoint.fromArray(array);
            expect(points).toEqual([
                ShapePoint.Move(100, 200),
                ShapePoint.Line(100, 200),
                ShapePoint.Quadratic(100, 200, 300, 400),
                ShapePoint.Cubic(100, 200, 300, 400, 500, 600),
                ShapePoint.Close(),
            ]);
        });
    });

    describe("toArray", () => {
        it("should convert a ShapePoint to an array", () => {
            const point = ShapePoint.Move(100, 200);
            expect(point.toArray()).toEqual(["M", 100, 200]);
        });
    });

    describe("pointsToArray", () => {
        it("should convert an array of ShapePoint to an array of arrays", () => {
            const points = [
                ShapePoint.Move(100, 200),
                ShapePoint.Line(100, 200),
                ShapePoint.Quadratic(100, 200, 300, 400),
                ShapePoint.Cubic(100, 200, 300, 400, 500, 600),
                ShapePoint.Close(),
            ];
            expect(ShapePoint.pointsToArray(points)).toEqual([
                ["M", 100, 200],
                ["L", 100, 200],
                ["Q", 100, 200, 300, 400],
                ["C", 100, 200, 300, 400, 500, 600],
                ["Z"],
            ]);
        });
    });

    describe("applyOffset", () => {
        it("should apply an offset to a ShapePoint", () => {
            const point = ShapePoint.Move(100, 200);
            const offset = { x: 50, y: 50 };
            const offsetPoint = point.applyOffset(offset);
            expect(offsetPoint.command).toBe("M");
            expect(offsetPoint.coordinates).toEqual([{ x: 150, y: 250 }]);
        });
    });

    describe("ShapePoint.fromString", () => {
        it("should parse a simple SVG path string", () => {
            const svgPath = "M 100 200 L 300 400 Z";
            const points = ShapePoint.fromString(svgPath);
            expect(points).toEqual([
                ShapePoint.Move(100, 200),
                ShapePoint.Line(300, 400),
                ShapePoint.Close(),
            ]);
        });

        it("should parse a complex SVG path with curves", () => {
            const svgPath = "M 0 0 Q 50 50 100 100 C 150 150 200 200 250 250 Z";
            const points = ShapePoint.fromString(svgPath);
            expect(points).toEqual([
                ShapePoint.Move(0, 0),
                ShapePoint.Quadratic(50, 50, 100, 100),
                ShapePoint.Cubic(150, 150, 200, 200, 250, 250),
                ShapePoint.Close(),
            ]);
        });

        it("should handle multiple subpaths", () => {
            const svgPath = "M 0 0 L 100 100 M 200 200 L 300 300";
            const points = ShapePoint.fromString(svgPath);
            expect(points).toEqual([
                ShapePoint.Move(0, 0),
                ShapePoint.Line(100, 100),
                ShapePoint.Move(200, 200),
                ShapePoint.Line(300, 300),
            ]);
        });

        it("should handle decimal values", () => {
            const svgPath = "M 10.5 20.7 L 30.2 40.9";
            const points = ShapePoint.fromString(svgPath);
            expect(points).toEqual([
                ShapePoint.Move(10.5, 20.7),
                ShapePoint.Line(30.2, 40.9),
            ]);
        });

        it("should handle negative values", () => {
            const svgPath = "M -10 -20 L -30 -40 Q -50 -60 -70 -80";
            const points = ShapePoint.fromString(svgPath);
            expect(points).toEqual([
                ShapePoint.Move(-10, -20),
                ShapePoint.Line(-30, -40),
                ShapePoint.Quadratic(-50, -60, -70, -80),
            ]);
        });
    });
});

describe("ShapePath", () => {
    it("should create a ShapePath from an array of points", () => {
        const points = [
            ShapePoint.Move(100, 200),
            ShapePoint.Line(100, 200),
            ShapePoint.Quadratic(100, 200, 300, 400),
            ShapePoint.Cubic(100, 200, 300, 400, 500, 600),
            ShapePoint.Close(),
        ];
        const shapePath = new ShapePath(points);
        expect(shapePath.points).toEqual(points);
    });

    it("should return the correct points when the path is modified", () => {
        const initialPoints = [
            ShapePoint.Move(100, 200),
            ShapePoint.Line(300, 400),
            ShapePoint.Quadratic(100, 200, 300, 400),
            ShapePoint.Close(),
        ];
        const shapePath = new ShapePath(initialPoints);

        // Modify the path
        (shapePath.path as any as number[][])[0][1] = 300;
        (shapePath.path as any as number[][])[1][2] = -900;
        (shapePath.path as any as number[][])[2][3] = 0;

        const newPoints = [
            ShapePoint.Move(300, 200),
            ShapePoint.Line(300, -900),
            ShapePoint.Quadratic(100, 200, 0, 400),
            ShapePoint.Close(),
        ];

        expect(shapePath.points).toEqual(newPoints);
    });
});

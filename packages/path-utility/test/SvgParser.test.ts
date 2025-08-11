import { describe, it, expect } from "vitest";
import { Path } from "../src/Path";
import { CubicCurve } from "../src/segments/CubicCurve";
import { QuadraticCurve } from "../src/segments/QuadraticCurve";

describe("parseSvg", () => {
    it("should correctly parse the S command", () => {
        const path = Path.fromSvgString(
            "M10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80",
        );
        const segments = path.segments;

        expect(segments[1]).toBeInstanceOf(CubicCurve);
        const curve2 = segments[1] as CubicCurve;
        expect(curve2.startPoint.x).toBe(95);
        expect(curve2.startPoint.y).toBe(80);
        expect(curve2.controlPoint1.x).toBe(125);
        expect(curve2.controlPoint1.y).toBe(150);
        expect(curve2.controlPoint2.x).toBe(150);
        expect(curve2.controlPoint2.y).toBe(150);
        expect(curve2.endPoint.x).toBe(180);
        expect(curve2.endPoint.y).toBe(80);
    });

    it("should correctly parse the s command", () => {
        const path = Path.fromSvgString(
            "M10 80 c 30 -70, 55 -70, 85 0 s 55 70, 85 0",
        );
        const segments = path.segments;

        expect(segments[1]).toBeInstanceOf(CubicCurve);
        const curve2 = segments[1] as CubicCurve;
        expect(curve2.startPoint.x).toBe(95);
        expect(curve2.startPoint.y).toBe(80);
        expect(curve2.controlPoint1.x).toBe(125);
        expect(curve2.controlPoint1.y).toBe(150);
        expect(curve2.controlPoint2.x).toBe(150);
        expect(curve2.controlPoint2.y).toBe(150);
        expect(curve2.endPoint.x).toBe(180);
        expect(curve2.endPoint.y).toBe(80);
    });

    it("should correctly parse the T command", () => {
        const path = Path.fromSvgString("M10 80 Q 40 10, 70 80 T 150 80");
        const segments = path.segments;

        expect(segments[1]).toBeInstanceOf(QuadraticCurve);
        const curve2 = segments[1] as QuadraticCurve;
        expect(curve2.startPoint.x).toBe(70);
        expect(curve2.startPoint.y).toBe(80);
        expect(curve2.controlPoint.x).toBe(100);
        expect(curve2.controlPoint.y).toBe(150);
        expect(curve2.endPoint.x).toBe(150);
        expect(curve2.endPoint.y).toBe(80);
    });

    it("should correctly parse the t command", () => {
        const path = Path.fromSvgString("M10 80 q 30 -70, 60 0 t 80 0");
        const segments = path.segments;

        expect(segments[1]).toBeInstanceOf(QuadraticCurve);
        const curve2 = segments[1] as QuadraticCurve;
        expect(curve2.startPoint.x).toBe(70);
        expect(curve2.startPoint.y).toBe(80);
        expect(curve2.controlPoint.x).toBe(100);
        expect(curve2.controlPoint.y).toBe(150);
        expect(curve2.endPoint.x).toBe(150);
        expect(curve2.endPoint.y).toBe(80);
    });
});

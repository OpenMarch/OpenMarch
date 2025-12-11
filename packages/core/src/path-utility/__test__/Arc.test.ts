import { describe, expect, it } from "vitest";
import { Arc } from "../src/segments/Arc";
import { parseSvg } from "../src/SvgParser";
import { Path } from "../src/Path";
import type { Point } from "../src/interfaces";

describe("Arc segment", () => {
    it("should correctly calculate the length of a 90-degree arc", () => {
        const startPoint: Point = { x: 10, y: 0 };
        const endPoint: Point = { x: 0, y: 10 };
        const rx = 10;
        const ry = 10;
        const arc = new Arc(startPoint, rx, ry, 0, 0, 1, endPoint);

        // Arc of a circle with radius 10 over 90 degrees
        const expectedLength = (2 * Math.PI * 10) / 4; // quarter circle
        expect(arc.getLength()).toBeCloseTo(expectedLength, 1);
    });

    it("should get the correct point at length", () => {
        const startPoint: Point = { x: 10, y: 0 };
        const endPoint: Point = { x: 0, y: 10 };
        const rx = 10;
        const ry = 10;
        const arc = new Arc(startPoint, rx, ry, 0, 0, 1, endPoint);

        const halfLength = arc.getLength() / 2;
        const midPoint = arc.getPointAtLength(halfLength);

        const angle = Math.PI / 4; // 45 degrees
        const expectedX = 10 * Math.cos(angle);
        const expectedY = 10 * Math.sin(angle);

        expect(midPoint.x).toBeCloseTo(expectedX, 1);
        expect(midPoint.y).toBeCloseTo(expectedY, 1);
    });
});

describe("SvgParser with Arcs", () => {
    it("should parse an absolute Arc command", () => {
        const d = "M 10 0 A 10 10 0 0 1 0 10";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(Arc);

        const arc = segments[0] as Arc;
        expect(arc.startPoint).toEqual({ x: 10, y: 0 });
        expect(arc.endPoint).toEqual({ x: 0, y: 10 });
        expect(arc.rx).toBe(10);
        expect(arc.ry).toBe(10);
        expect(arc.largeArcFlag).toBe(0);
        expect(arc.sweepFlag).toBe(1);
    });

    it("should parse a relative Arc command", () => {
        const d = "M 10 0 a 10 10 0 0 1 -10 10";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(Arc);

        const arc = segments[0] as Arc;
        expect(arc.startPoint).toEqual({ x: 10, y: 0 });
        expect(arc.endPoint).toEqual({ x: 0, y: 10 });
    });

    it("should treat zero-radius arc as a line", () => {
        const d = "M 10 0 A 0 0 0 0 1 0 10";
        const path = Path.fromSvgString(d);
        expect(path.segments[0]?.constructor.name).toBe("Line");
    });

    it("should update the start point of an arc", () => {
        const d = "M 10 0 A 10 10 0 0 1 -10 10";
        const path = Path.fromSvgString(d);
        expect(path.segments[0]?.getStartPoint()).toEqual({ x: 10, y: 0 });
        expect(path.segments[0]?.getEndPoint()).toEqual({ x: -10, y: 10 });

        path.setStartPoint({ x: 100, y: 100 });
        expect(path.getStartPoint()).toEqual({ x: 100, y: 100 });
        expect(path.segments[0]?.getEndPoint()).toEqual({ x: -10, y: 10 });
        expect(path.toSvgString()).toBe("M 100 100 A 10 10 0 0 1 -10 10");
    });

    it("should update the end point of an arc", () => {
        const d = "M 10 0 A 10 10 0 0 1 -10 10";
        const path = Path.fromSvgString(d);
        expect(path.segments[0]?.getStartPoint()).toEqual({ x: 10, y: 0 });
        expect(path.segments[0]?.getEndPoint()).toEqual({ x: -10, y: 10 });

        path.setEndPoint({ x: 100, y: 100 });
        expect(path.getLastPoint()).toEqual({ x: 100, y: 100 });
        expect(path.segments[0]?.getStartPoint()).toEqual({ x: 10, y: 0 });
        expect(path.segments[0]?.getEndPoint()).toEqual({ x: 100, y: 100 });
        expect(path.toSvgString()).toBe("M 10 0 A 10 10 0 0 1 100 100");
    });
});

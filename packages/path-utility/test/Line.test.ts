import { describe, expect, it } from "vitest";
import { Line } from "../src/segments/Line";
import { Point } from "../src/interfaces";
import { parseSvg } from "../src/SvgParser";
import { Path } from "../src/Path";

describe("Line segment", () => {
    it("should correctly calculate the length of a straight line", () => {
        const startPoint: Point = { x: 0, y: 0 };
        const endPoint: Point = { x: 10, y: 0 };
        const line = new Line(startPoint, endPoint);
        expect(line.getLength()).toBe(10);
    });

    it("should correctly calculate the length of a diagonal line", () => {
        const startPoint: Point = { x: 0, y: 0 };
        const endPoint: Point = { x: 3, y: 4 };
        const line = new Line(startPoint, endPoint);
        expect(line.getLength()).toBe(5);
    });

    it("should get the correct point at length", () => {
        const startPoint: Point = { x: 0, y: 0 };
        const endPoint: Point = { x: 10, y: 0 };
        const line = new Line(startPoint, endPoint);
        const midPoint = line.getPointAtLength(5);
        expect(midPoint).toEqual({ x: 5, y: 0 });
    });
});

describe("SvgParser with Line commands", () => {
    it("should parse an absolute Lineto command", () => {
        const d = "M 0 0 L 10 20";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(Line);
        const line = segments[0] as Line;
        expect(line.startPoint).toEqual({ x: 0, y: 0 });
        expect(line.endPoint).toEqual({ x: 10, y: 20 });
    });

    it("should parse a relative lineto command", () => {
        const d = "M 10 10 l 10 20";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(Line);
        const line = segments[0] as Line;
        expect(line.startPoint).toEqual({ x: 10, y: 10 });
        expect(line.endPoint).toEqual({ x: 20, y: 30 });
    });

    it("should parse multiple lineto commands", () => {
        const d = "M 10 10 L 20 20 L 30 10";
        const segments = parseSvg(d);
        expect(segments.length).toBe(2);
        expect(segments[0]).toBeInstanceOf(Line);
        expect(segments[1]).toBeInstanceOf(Line);
        const line1 = segments[0] as Line;
        const line2 = segments[1] as Line;
        expect(line1.endPoint).toEqual({ x: 20, y: 20 });
        expect(line2.endPoint).toEqual({ x: 30, y: 10 });
    });

    it("should parse implicit lineto commands", () => {
        const d = "M 10 10 20 20 30 10";
        const segments = parseSvg(d);
        expect(segments.length).toBe(2);
        expect(segments[0]).toBeInstanceOf(Line);
        expect(segments[1]).toBeInstanceOf(Line);
        const line1 = segments[0] as Line;
        const line2 = segments[1] as Line;
        expect(line1.endPoint).toEqual({ x: 20, y: 20 });
        expect(line2.endPoint).toEqual({ x: 30, y: 10 });
    });

    it("should parse an absolute Horizontal lineto command", () => {
        const d = "M 10 10 H 30";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(Line);
        const line = segments[0] as Line;
        expect(line.endPoint).toEqual({ x: 30, y: 10 });
    });

    it("should parse a relative horizontal lineto command", () => {
        const d = "M 10 10 h 30";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(Line);
        const line = segments[0] as Line;
        expect(line.endPoint).toEqual({ x: 40, y: 10 });
    });

    it("should parse an absolute Vertical lineto command", () => {
        const d = "M 10 10 V 30";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(Line);
        const line = segments[0] as Line;
        expect(line.endPoint).toEqual({ x: 10, y: 30 });
    });

    it("should parse a relative vertical lineto command", () => {
        const d = "M 10 10 v 30";
        const segments = parseSvg(d);
        expect(segments.length).toBe(1);
        expect(segments[0]).toBeInstanceOf(Line);
        const line = segments[0] as Line;
        expect(line.endPoint).toEqual({ x: 10, y: 40 });
    });

    it("should parse a ClosePath command", () => {
        const d = "M 10 10 H 90 V 50 H 10 Z";
        const path = Path.fromSvgString(d);
        expect(path.segments.length).toBe(4);
        const lastSegment = path.segments[3] as Line;
        expect(lastSegment).toBeInstanceOf(Line);
        expect(lastSegment.endPoint).toEqual({ x: 10, y: 10 });
    });
});

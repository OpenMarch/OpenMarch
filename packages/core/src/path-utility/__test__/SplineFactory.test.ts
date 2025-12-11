import { describe, it, expect } from "vitest";
import { SplineFactory } from "../src/SplineFactory";
import { Path } from "../src/Path";
import type { Point } from "../src/interfaces";

describe("SplineFactory", () => {
    describe("createCatmullRomSplineFromRelativePoints", () => {
        it("should create a spline from relative points with default origin", () => {
            const relativePoints: Point[] = [
                { x: 10, y: 10 },
                { x: 10, y: 0 },
                { x: 0, y: -10 },
            ];

            const path =
                SplineFactory.createCatmullRomSplineFromRelativePoints(
                    relativePoints,
                );
            expect(path).toBeInstanceOf(Path);

            const absolutePoints = [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
                { x: 20, y: 10 },
                { x: 20, y: 0 },
            ];
            const expectedPath =
                SplineFactory.createCatmullRomSpline(absolutePoints);

            expect(path.toSvgString()).toBe(expectedPath.toSvgString());
        });

        it("should create a spline from relative points with a custom origin", () => {
            const relativePoints: Point[] = [
                { x: 10, y: 10 },
                { x: 10, y: 0 },
            ];
            const origin: Point = { x: 5, y: 5 };

            const path = SplineFactory.createCatmullRomSplineFromRelativePoints(
                relativePoints,
                origin,
            );
            expect(path).toBeInstanceOf(Path);

            const absolutePoints = [
                { x: 5, y: 5 },
                { x: 15, y: 15 },
                { x: 25, y: 15 },
            ];
            const expectedPath =
                SplineFactory.createCatmullRomSpline(absolutePoints);

            expect(path.toSvgString()).toBe(expectedPath.toSvgString());
        });

        it("should return an empty path if no relative points are provided", () => {
            const path = SplineFactory.createCatmullRomSplineFromRelativePoints(
                [],
            );
            expect(path).toBeInstanceOf(Path);
            expect(path.segments.length).toBe(0);
        });
    });
});

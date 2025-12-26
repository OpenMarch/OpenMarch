import { describe, it, expect } from "vitest";
import { ShapePath } from "../ShapePath";
import { ShapePoint } from "../ShapePoint";
import { rgbaToString } from "@openmarch/core";

describe("ShapePath - Enhanced Selectable Behavior", () => {
    describe("disableControl", () => {
        it("should keep selectable = true when control is disabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.disableControl();

            // Key change: should remain selectable even when control is disabled
            expect(shapePath.selectable).toBe(true);
        });

        it("should change cursor to pointer when control disabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.disableControl();

            expect(shapePath.hoverCursor).toBe("pointer");
        });

        it("should use dashed stroke when control disabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.disableControl();

            expect(shapePath.strokeDashArray).toEqual([5, 3]);
        });

        it("should use temp path color when control disabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.disableControl();

            expect(shapePath.stroke).toBe(
                rgbaToString(ShapePath.fieldTheme.tempPath),
            );
        });

        it("should use transparent background when control disabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.disableControl();

            expect(shapePath.backgroundColor).toBe("transparent");
        });

        it("should reduce stroke width when control disabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.disableControl();

            expect(shapePath.strokeWidth).toBe(1);
        });
    });

    describe("enableControl", () => {
        it("should keep selectable = true when control enabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.enableControl();

            expect(shapePath.selectable).toBe(true);
        });

        it("should change cursor to move when control enabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.enableControl();

            expect(shapePath.hoverCursor).toBe("move");
        });

        it("should use solid stroke when control enabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.disableControl(); // First disable to set dashed
            shapePath.enableControl();

            expect(shapePath.strokeDashArray).toEqual([]);
        });

        it("should use shape color when control enabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.enableControl();

            expect(shapePath.stroke).toBe(
                rgbaToString(ShapePath.fieldTheme.shape),
            );
        });

        it("should use semi-transparent background when control enabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.enableControl();

            expect(shapePath.backgroundColor).toBe(
                rgbaToString({
                    ...ShapePath.fieldTheme.tempPath,
                    a: 0.2,
                }),
            );
        });

        it("should increase stroke width when control enabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.enableControl();

            expect(shapePath.strokeWidth).toBe(2);
        });
    });

    describe("constructor", () => {
        it("should initialize with control disabled by default", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);

            // Should be in disabled state initially
            expect(shapePath.strokeDashArray).toEqual([5, 3]);
            expect(shapePath.selectable).toBe(true);
        });
    });

    describe("control state transitions", () => {
        it("should correctly transition from disabled to enabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);

            // Start disabled
            expect(shapePath.strokeDashArray).toEqual([5, 3]);
            expect(shapePath.hoverCursor).toBe("pointer");

            // Enable control
            shapePath.enableControl();

            expect(shapePath.strokeDashArray).toEqual([]);
            expect(shapePath.hoverCursor).toBe("move");
            expect(shapePath.selectable).toBe(true);
        });

        it("should correctly transition from enabled to disabled", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);
            shapePath.enableControl();

            // Verify enabled state
            expect(shapePath.hoverCursor).toBe("move");

            // Disable control
            shapePath.disableControl();

            expect(shapePath.hoverCursor).toBe("pointer");
            expect(shapePath.selectable).toBe(true);
        });

        it("should handle multiple enable/disable cycles", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const shapePath = new ShapePath(points);

            for (let i = 0; i < 3; i++) {
                shapePath.enableControl();
                expect(shapePath.selectable).toBe(true);
                expect(shapePath.hoverCursor).toBe("move");

                shapePath.disableControl();
                expect(shapePath.selectable).toBe(true);
                expect(shapePath.hoverCursor).toBe("pointer");
            }
        });
    });
});
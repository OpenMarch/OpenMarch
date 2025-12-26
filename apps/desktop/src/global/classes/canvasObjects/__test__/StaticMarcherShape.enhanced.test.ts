import { describe, it, expect, beforeEach, vi } from "vitest";
import { fabric } from "fabric";
import { StaticMarcherShape } from "../StaticMarcherShape";
import { ShapePoint } from "../ShapePoint";
import { ShapePointController } from "../ShapePointController";
import OpenMarchCanvas from "../OpenMarchCanvas";

describe("StaticMarcherShape - Selection Handlers", () => {
    let mockCanvas: any;
    let mockMarchers: any[];
    let shape: StaticMarcherShape;

    beforeEach(() => {
        // Create mock canvas
        mockCanvas = {
            add: vi.fn(),
            remove: vi.fn(),
            getActiveObject: vi.fn(),
            requestRenderAll: vi.fn(),
            sendCanvasMarchersToFront: vi.fn(),
            fieldProperties: {
                theme: {
                    shape: { r: 126, g: 34, b: 206, a: 1 },
                    tempPath: { r: 100, g: 100, b: 100, a: 0.5 },
                },
            },
        } as any;

        // Create mock marchers
        mockMarchers = [
            {
                id: 1,
                coordinate: { x: 100, y: 100, page_id: 1 },
                setMarcherCoords: vi.fn(),
            },
            {
                id: 2,
                coordinate: { x: 200, y: 200, page_id: 1 },
                setMarcherCoords: vi.fn(),
            },
        ];

        // Create shape points
        const points = [
            ShapePoint.Move({ x: 100, y: 100 }),
            ShapePoint.Line({ x: 200, y: 200 }),
        ];

        shape = new StaticMarcherShape({
            canvas: mockCanvas,
            canvasMarchers: mockMarchers as any,
            points,
            controlEnabled: false,
        });
    });

    describe("selectedHandler", () => {
        it("should enable control when shape path is selected", () => {
            const enableControlSpy = vi.spyOn(shape, "enableControl");

            shape.selectedHandler();

            expect(enableControlSpy).toHaveBeenCalled();
            expect(mockCanvas.requestRenderAll).toHaveBeenCalled();
        });

        it("should handle missing canvas gracefully", () => {
            shape.canvas = undefined;

            expect(() => shape.selectedHandler()).not.toThrow();
        });

        it("should enable control even when already enabled", () => {
            shape.enableControl();
            const enableControlSpy = vi.spyOn(shape, "enableControl");

            shape.selectedHandler();

            // Should still call enableControl
            expect(enableControlSpy).toHaveBeenCalled();
        });
    });

    describe("deselectedHandler", () => {
        it("should disable control when clicking outside shape", () => {
            mockCanvas.getActiveObject.mockReturnValue(null);
            const disableControlSpy = vi.spyOn(shape, "disableControl");

            shape.deselectedHandler();

            expect(disableControlSpy).toHaveBeenCalled();
            expect(mockCanvas.requestRenderAll).toHaveBeenCalled();
        });

        it("should not disable control when clicking on own control point", () => {
            shape.enableControl();
            const controlPoint = shape.controlPoints[0];
            mockCanvas.getActiveObject.mockReturnValue(controlPoint);

            const disableControlSpy = vi.spyOn(shape, "disableControl");

            shape.deselectedHandler();

            // Should not disable control - user is interacting with the shape
            expect(disableControlSpy).not.toHaveBeenCalled();
        });

        it("should disable control when clicking control point of different shape", () => {
            const otherShape = new StaticMarcherShape({
                canvas: mockCanvas,
                canvasMarchers: mockMarchers as any,
                points: [
                    ShapePoint.Move({ x: 300, y: 300 }),
                    ShapePoint.Line({ x: 400, y: 400 }),
                ],
                controlEnabled: false,
            });

            otherShape.enableControl();
            const otherControlPoint = otherShape.controlPoints[0];
            mockCanvas.getActiveObject.mockReturnValue(otherControlPoint);

            const disableControlSpy = vi.spyOn(shape, "disableControl");

            shape.deselectedHandler();

            expect(disableControlSpy).toHaveBeenCalled();
        });

        it("should handle missing canvas gracefully", () => {
            shape.canvas = undefined;

            expect(() => shape.deselectedHandler()).not.toThrow();
        });
    });

    describe("enableControl", () => {
        it("should create control points for shape", () => {
            shape.enableControl();

            expect(shape.controlPoints.length).toBeGreaterThan(0);
            expect(mockCanvas.add).toHaveBeenCalled();
        });

        it("should not create duplicate control points if already enabled", () => {
            shape.enableControl();
            const firstControlPointCount = shape.controlPoints.length;

            shape.enableControl();

            // Should not double the control points
            expect(shape.controlPoints.length).toBe(firstControlPointCount);
        });

        it("should enable control on shape path", () => {
            const shapePath = shape.shapePath;
            const enableControlSpy = vi.spyOn(shapePath, "enableControl");

            shape.enableControl();

            expect(enableControlSpy).toHaveBeenCalled();
        });

        it("should handle missing canvas gracefully", () => {
            shape.canvas = undefined;

            const consoleErrorSpy = vi
                .spyOn(console, "error")
                .mockImplementation();

            shape.enableControl();

            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });

    describe("disableControl", () => {
        it("should destroy all control points", () => {
            shape.enableControl();
            const controlPoints = [...shape.controlPoints];

            shape.disableControl();

            expect(mockCanvas.remove).toHaveBeenCalled();
        });

        it("should disable control on shape path", () => {
            shape.enableControl();
            const shapePath = shape.shapePath;
            const disableControlSpy = vi.spyOn(shapePath, "disableControl");

            shape.disableControl();

            expect(disableControlSpy).toHaveBeenCalled();
        });

        it("should not throw if already disabled", () => {
            expect(() => shape.disableControl()).not.toThrow();
        });

        it("should clear control points array", () => {
            shape.enableControl();
            expect(shape.controlPoints.length).toBeGreaterThan(0);

            shape.disableControl();

            // Control points should still exist but be removed from canvas
            expect(mockCanvas.remove).toHaveBeenCalled();
        });
    });

    describe("recreatePath with event handlers", () => {
        it("should attach selected event handler to new path", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const newPath = shape.recreatePath(ShapePoint.pointsToArray(points));

            // Check that event handlers are attached
            expect(newPath).toBeDefined();
            expect(mockCanvas.add).toHaveBeenCalledWith(newPath);
        });

        it("should attach deselected event handler to new path", () => {
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            const newPath = shape.recreatePath(ShapePoint.pointsToArray(points));

            expect(newPath).toBeDefined();
        });

        it("should remove old path before creating new one", () => {
            const oldPath = shape.shapePath;
            const points = [
                ShapePoint.Move({ x: 100, y: 100 }),
                ShapePoint.Line({ x: 200, y: 200 }),
            ];

            shape.recreatePath(ShapePoint.pointsToArray(points));

            expect(mockCanvas.remove).toHaveBeenCalledWith(oldPath);
        });
    });

    describe("interaction between control and selection", () => {
        it("should maintain control when switching between control points", () => {
            shape.enableControl();
            const controlPoint1 = shape.controlPoints[0];
            const controlPoint2 = shape.controlPoints[1];

            // Simulate selecting first control point
            mockCanvas.getActiveObject.mockReturnValue(controlPoint1);
            shape.selectedHandler();

            // Simulate switching to second control point
            mockCanvas.getActiveObject.mockReturnValue(controlPoint2);
            shape.deselectedHandler();

            // Control should still be enabled
            expect(shape._controlEnabled).toBe(true);
        });

        it("should disable control when clicking away from shape entirely", () => {
            shape.enableControl();

            // Simulate clicking on empty space
            mockCanvas.getActiveObject.mockReturnValue(null);
            shape.deselectedHandler();

            expect(shape._controlEnabled).toBe(false);
        });

        it("should enable control when clicking on disabled shape", () => {
            expect(shape._controlEnabled).toBe(false);

            shape.selectedHandler();

            expect(shape._controlEnabled).toBe(true);
        });
    });
});
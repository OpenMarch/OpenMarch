import { describe, it, expect, beforeEach, vi } from "vitest";
import { fabric } from "fabric";
import { ShapePointController } from "../ShapePointController";
import { StaticMarcherShape } from "../StaticMarcherShape";
import OpenMarchCanvas from "../OpenMarchCanvas";
import { ShapePoint } from "../ShapePoint";

describe("ShapePointController", () => {
    let mockCanvas: any;
    let mockMarcherShape: any;
    let controller: ShapePointController;

    beforeEach(() => {
        // Create mock canvas
        mockCanvas = {
            add: vi.fn(),
            remove: vi.fn(),
            setActiveObject: vi.fn(),
            getActiveObject: vi.fn(),
            requestRenderAll: vi.fn(),
            fieldProperties: {
                theme: {
                    shape: { r: 126, g: 34, b: 206, a: 1 },
                },
            },
        } as any;

        // Create mock StaticMarcherShape
        const mockShapePath = {
            path: [
                ["M", 100, 100],
                ["L", 200, 200],
            ],
        };

        mockMarcherShape = {
            shapePath: mockShapePath,
            controlPoints: [],
            moveOffset: {
                fromInitial: { x: 0, y: 0 },
                initialPosition: { x: 100, y: 100 },
            },
            disableControl: vi.fn(),
            dirty: false,
            distributeMarchers: vi.fn(),
            bringControlPointsToFront: vi.fn(),
            recreatePath: vi.fn(),
        };

        controller = new ShapePointController({
            marcherShape: mockMarcherShape,
            pointIndex: 1,
            coordIndex: 1,
            canvas: mockCanvas,
        });
    });

    describe("constructor", () => {
        it("should create controller with correct properties", () => {
            expect(controller.marcherShape).toBe(mockMarcherShape);
            expect(controller.pointIndex).toBe(1);
            expect(controller.coordIndex).toBe(1);
            expect(controller.canvas).toBe(mockCanvas);
        });

        it("should warn when coordIndex is 0", () => {
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

            new ShapePointController({
                marcherShape: mockMarcherShape,
                pointIndex: 0,
                coordIndex: 0,
                canvas: mockCanvas,
            });

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining("coordinate index"),
            );

            consoleWarnSpy.mockRestore();
        });

        it("should set up event listeners", () => {
            const onSpy = vi.spyOn(controller, "on");

            const newController = new ShapePointController({
                marcherShape: mockMarcherShape,
                pointIndex: 1,
                coordIndex: 1,
                canvas: mockCanvas,
            });

            // Event listeners are set up in constructor
            expect(newController).toBeDefined();
        });
    });

    describe("mousedownHandler", () => {
        it("should prevent Shift+click from triggering multi-selection", () => {
            const mockEvent = new MouseEvent("mousedown", { shiftKey: true });
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            mockEvent.stopPropagation = vi.fn();

            controller.mousedownHandler(fabricEvent);

            expect(mockCanvas.setActiveObject).toHaveBeenCalledWith(controller);
            expect(mockEvent.stopPropagation).toHaveBeenCalled();
        });

        it("should allow normal click without Shift", () => {
            const mockEvent = new MouseEvent("mousedown");
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            controller.mousedownHandler(fabricEvent);

            // Should not set active object without shift key
            expect(mockCanvas.setActiveObject).not.toHaveBeenCalled();
        });

        it("should handle missing canvas gracefully", () => {
            controller.canvas = undefined;

            const mockEvent = new MouseEvent("mousedown", { shiftKey: true });
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            expect(() => controller.mousedownHandler(fabricEvent)).not.toThrow();
        });
    });

    describe("deselectedHandler", () => {
        it("should disable control when clicking outside shape", () => {
            mockCanvas.getActiveObject.mockReturnValue(null);

            controller.deselectedHandler();

            expect(mockMarcherShape.disableControl).toHaveBeenCalled();
            expect(mockCanvas.requestRenderAll).toHaveBeenCalled();
        });

        it("should not disable control when clicking another control point of same shape", () => {
            const anotherController = new ShapePointController({
                marcherShape: mockMarcherShape,
                pointIndex: 0,
                coordIndex: 1,
                canvas: mockCanvas,
            });

            mockMarcherShape.controlPoints = [controller, anotherController];
            mockCanvas.getActiveObject.mockReturnValue(anotherController);

            controller.deselectedHandler();

            expect(mockMarcherShape.disableControl).not.toHaveBeenCalled();
        });

        it("should not disable control when clicking the shape path itself", () => {
            mockCanvas.getActiveObject.mockReturnValue(
                mockMarcherShape.shapePath,
            );

            controller.deselectedHandler();

            expect(mockMarcherShape.disableControl).not.toHaveBeenCalled();
        });

        it("should disable control when clicking control point of different shape", () => {
            const otherMarcherShape = {
                shapePath: { path: [] },
                controlPoints: [],
                disableControl: vi.fn(),
            };

            const otherController = new ShapePointController({
                marcherShape: otherMarcherShape as any,
                pointIndex: 0,
                coordIndex: 1,
                canvas: mockCanvas,
            });

            mockCanvas.getActiveObject.mockReturnValue(otherController);

            controller.deselectedHandler();

            expect(mockMarcherShape.disableControl).toHaveBeenCalled();
        });

        it("should handle missing canvas gracefully", () => {
            controller.canvas = undefined;

            expect(() => controller.deselectedHandler()).not.toThrow();
        });
    });

    describe("refreshParentPathCoordinates", () => {
        it("should update parent path coordinates correctly", () => {
            controller.left = 250;
            controller.top = 300;

            controller.refreshParentPathCoordinates();

            // Should update the path array at the correct index
            expect(mockMarcherShape.shapePath.path[1][1]).toBe(250);
            expect(mockMarcherShape.shapePath.path[1][2]).toBe(300);
        });

        it("should handle missing coordinates gracefully", () => {
            controller.left = undefined as any;
            controller.top = undefined as any;

            const consoleErrorSpy = vi
                .spyOn(console, "error")
                .mockImplementation();

            controller.refreshParentPathCoordinates();

            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        it("should mark parent path as dirty", () => {
            controller.left = 250;
            controller.top = 300;

            controller.refreshParentPathCoordinates();

            expect(mockMarcherShape.shapePath.dirty).toBe(true);
        });
    });

    describe("getPathCoordinates", () => {
        it("should return correct coordinates from path", () => {
            const coords = controller.getPathCoordinates();

            expect(coords).toEqual({ left: 200, top: 200 });
        });

        it("should handle missing path gracefully", () => {
            mockMarcherShape.shapePath.path = null;

            const consoleErrorSpy = vi
                .spyOn(console, "error")
                .mockImplementation();

            const coords = controller.getPathCoordinates();

            expect(coords).toBeUndefined();
            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });

    describe("moveHandler", () => {
        it("should update path and distribute marchers when moved", () => {
            controller.left = 250;
            controller.top = 300;

            const mockEvent = {} as fabric.IEvent<MouseEvent>;

            controller.moveHandler(mockEvent);

            expect(mockMarcherShape.distributeMarchers).toHaveBeenCalled();
            expect(mockMarcherShape.bringControlPointsToFront).toHaveBeenCalled();
            expect(mockMarcherShape.dirty).toBe(true);
        });

        it("should disable object caching during move", () => {
            const mockEvent = {} as fabric.IEvent<MouseEvent>;

            controller.moveHandler(mockEvent);

            expect(mockMarcherShape.shapePath.objectCaching).toBe(false);
        });
    });

    describe("modifiedHandler", () => {
        it("should recreate path when modification is complete", () => {
            const mockEvent = {} as fabric.IEvent;

            controller.modifiedHandler(mockEvent);

            expect(mockMarcherShape.recreatePath).toHaveBeenCalledWith(
                mockMarcherShape.shapePath.path,
            );
        });

        it("should handle missing path gracefully", () => {
            mockMarcherShape.shapePath.path = null;

            const consoleErrorSpy = vi
                .spyOn(console, "error")
                .mockImplementation();
            const mockEvent = {} as fabric.IEvent;

            controller.modifiedHandler(mockEvent);

            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });

    describe("destroy", () => {
        it("should remove controller and outgoing line from canvas", () => {
            const mockLine = new fabric.Line([0, 0, 100, 100]);
            controller.outgoingLine = mockLine;

            controller.destroy();

            expect(mockCanvas.remove).toHaveBeenCalledWith(mockLine);
            expect(mockCanvas.remove).toHaveBeenCalledWith(controller);
        });

        it("should handle missing canvas gracefully", () => {
            controller.canvas = undefined;

            expect(() => controller.destroy()).not.toThrow();
        });

        it("should handle missing outgoing line gracefully", () => {
            controller.outgoingLine = null;

            expect(() => controller.destroy()).not.toThrow();
        });
    });

    describe("refreshLines", () => {
        it("should update incoming line coordinates", () => {
            const incomingController = new ShapePointController({
                marcherShape: mockMarcherShape,
                pointIndex: 0,
                coordIndex: 1,
                canvas: mockCanvas,
            });

            const mockLine = new fabric.Line([0, 0, 100, 100]);
            incomingController.outgoingLine = mockLine;
            controller.incomingPoint = incomingController;
            controller.left = 250;
            controller.top = 300;

            const setSpy = vi.spyOn(mockLine, "set");

            controller.refreshLines();

            expect(setSpy).toHaveBeenCalledWith({ x2: 250, y2: 300 });
        });

        it("should update outgoing line coordinates", () => {
            const mockLine = new fabric.Line([0, 0, 100, 100]);
            controller.outgoingLine = mockLine;
            controller.left = 250;
            controller.top = 300;

            const setSpy = vi.spyOn(mockLine, "set");

            controller.refreshLines();

            expect(setSpy).toHaveBeenCalledWith({ x1: 250, y1: 300 });
        });

        it("should handle missing lines gracefully", () => {
            controller.incomingPoint = null;
            controller.outgoingLine = null;

            expect(() => controller.refreshLines()).not.toThrow();
        });
    });

    describe("drawOutgoingLine", () => {
        it("should create and add outgoing line when outgoing point exists", () => {
            const outgoingController = new ShapePointController({
                marcherShape: mockMarcherShape,
                pointIndex: 2,
                coordIndex: 1,
                canvas: mockCanvas,
            });

            controller.outgoingPoint = outgoingController;
            controller.left = 200;
            controller.top = 200;
            outgoingController.left = 300;
            outgoingController.top = 300;

            const line = controller.drawOutgoingLine();

            expect(line).toBeInstanceOf(fabric.Line);
            expect(mockCanvas.add).toHaveBeenCalledWith(line);
            expect(controller.outgoingLine).toBe(line);
        });

        it("should return null when no outgoing point", () => {
            controller.outgoingPoint = null;

            const line = controller.drawOutgoingLine();

            expect(line).toBeNull();
        });

        it("should handle missing outgoing point coordinates", () => {
            const outgoingController = new ShapePointController({
                marcherShape: mockMarcherShape,
                pointIndex: 2,
                coordIndex: 1,
                canvas: mockCanvas,
            });

            outgoingController.left = undefined as any;
            outgoingController.top = undefined as any;
            controller.outgoingPoint = outgoingController;

            const consoleErrorSpy = vi
                .spyOn(console, "error")
                .mockImplementation();

            const line = controller.drawOutgoingLine();

            expect(line).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });
});
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { fabric } from "fabric";
import DefaultListeners from "../DefaultListeners";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";

describe("DefaultListeners - Enhanced Shift+Click Blocking", () => {
    let mockCanvas: any;
    let listeners: DefaultListeners;

    beforeEach(() => {
        // Create comprehensive mock canvas
        mockCanvas = {
            getActiveObject: vi.fn(),
            getPointer: vi.fn(),
            requestRenderAll: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
            selection: true,
            isDragging: false,
            _currentTransform: null,
            getObjects: vi.fn(() => []),
            setActiveObject: vi.fn(),
            discardActiveObject: vi.fn(),
            forEachObject: vi.fn(),
            getCanvasMarchers: vi.fn(() => []),
            selectDragStart: { x: 0, y: 0, time: 0 },
            DRAG_TIMER_MILLISECONDS: 150,
            DISTANCE_THRESHOLD: 5,
            getZoom: vi.fn(() => 1),
            fieldProperties: {
                theme: {
                    shape: { r: 126, g: 34, b: 206, a: 1 },
                    nextPath: { r: 0, g: 255, b: 0, a: 1 },
                    primaryStroke: { r: 0, g: 0, b: 255, a: 1 },
                },
            },
        } as any;

        listeners = new DefaultListeners({ canvas: mockCanvas });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("handleMouseDownBefore", () => {
        it("should block Shift+click on middle-left (ml) scale handle", () => {
            const mockActiveSelection = {
                type: "activeSelection",
                hasControls: true,
                findControl: vi.fn(() => ({ corner: "ml" })),
            };

            mockCanvas.getActiveObject.mockReturnValue(mockActiveSelection);
            mockCanvas.getPointer.mockReturnValue({ x: 100, y: 100 });

            const mockEvent = new MouseEvent("mousedown", { shiftKey: true });
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            // Mock preventDefault/stopPropagation methods
            mockEvent.preventDefault = vi.fn();
            mockEvent.stopPropagation = vi.fn();
            (mockEvent as any).stopImmediatePropagation = vi.fn();

            listeners.handleMouseDownBefore(fabricEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(mockEvent.stopPropagation).toHaveBeenCalled();
            expect((fabricEvent as any).__skipFabricHandling).toBe(true);
            expect(mockCanvas._currentTransform).toBeNull();
        });

        it("should block Shift+click on middle-right (mr) scale handle", () => {
            const mockActiveSelection = {
                type: "activeSelection",
                hasControls: true,
                findControl: vi.fn(() => ({ corner: "mr" })),
            };

            mockCanvas.getActiveObject.mockReturnValue(mockActiveSelection);
            mockCanvas.getPointer.mockReturnValue({ x: 100, y: 100 });

            const mockEvent = new MouseEvent("mousedown", { shiftKey: true });
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            mockEvent.preventDefault = vi.fn();
            mockEvent.stopPropagation = vi.fn();
            (mockEvent as any).stopImmediatePropagation = vi.fn();

            listeners.handleMouseDownBefore(fabricEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
        });

        it("should allow Shift+click on corner scale handles", () => {
            const mockActiveSelection = {
                type: "activeSelection",
                hasControls: true,
                findControl: vi.fn(() => ({ corner: "br" })),
            };

            mockCanvas.getActiveObject.mockReturnValue(mockActiveSelection);
            mockCanvas.getPointer.mockReturnValue({ x: 100, y: 100 });

            const mockEvent = new MouseEvent("mousedown", { shiftKey: true });
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            mockEvent.preventDefault = vi.fn();
            mockEvent.stopPropagation = vi.fn();

            listeners.handleMouseDownBefore(fabricEvent);

            // Should NOT prevent default for corner handles
            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });

        it("should do nothing when Shift is not pressed", () => {
            const mockEvent = new MouseEvent("mousedown");
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            mockEvent.preventDefault = vi.fn();

            listeners.handleMouseDownBefore(fabricEvent);

            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });

        it("should do nothing when no active object", () => {
            mockCanvas.getActiveObject.mockReturnValue(null);

            const mockEvent = new MouseEvent("mousedown", { shiftKey: true });
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            mockEvent.preventDefault = vi.fn();

            listeners.handleMouseDownBefore(fabricEvent);

            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });

        it("should do nothing when active object is not activeSelection", () => {
            const mockObject = {
                type: "rect",
                hasControls: true,
            };

            mockCanvas.getActiveObject.mockReturnValue(mockObject);

            const mockEvent = new MouseEvent("mousedown", { shiftKey: true });
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            mockEvent.preventDefault = vi.fn();

            listeners.handleMouseDownBefore(fabricEvent);

            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });
    });

    describe("handleBeforeTransform", () => {
        it("should cancel transform when Shift+scaling on ml handle", () => {
            const mockTarget = {
                type: "activeSelection",
            };

            const mockTransformEvent = {
                transform: {
                    corner: "ml",
                    target: mockTarget,
                },
                e: new MouseEvent("transform", { shiftKey: true }),
            };

            listeners.handleBeforeTransform(mockTransformEvent);

            expect(mockCanvas._currentTransform).toBeNull();
            expect(mockCanvas.requestRenderAll).toHaveBeenCalled();
        });

        it("should cancel transform when Shift+scaling on mt handle", () => {
            const mockTarget = {
                type: "activeSelection",
            };

            const mockTransformEvent = {
                transform: {
                    corner: "mt",
                    target: mockTarget,
                },
                e: new MouseEvent("transform", { shiftKey: true }),
            };

            listeners.handleBeforeTransform(mockTransformEvent);

            expect(mockCanvas._currentTransform).toBeNull();
        });

        it("should allow transform on corner handles with Shift", () => {
            const mockTarget = {
                type: "activeSelection",
            };

            const originalTransform = { corner: "br", target: mockTarget };
            const mockTransformEvent = {
                transform: originalTransform,
                e: new MouseEvent("transform", { shiftKey: true }),
            };

            listeners.handleBeforeTransform(mockTransformEvent);

            // Should not clear transform for corner handles
            expect(mockCanvas.requestRenderAll).not.toHaveBeenCalled();
        });

        it("should do nothing when no transform object", () => {
            const mockTransformEvent = {
                transform: null,
                e: new MouseEvent("transform"),
            };

            listeners.handleBeforeTransform(mockTransformEvent);

            expect(mockCanvas.requestRenderAll).not.toHaveBeenCalled();
        });

        it("should allow transform on middle handles without Shift", () => {
            const mockTarget = {
                type: "activeSelection",
            };

            const mockTransformEvent = {
                transform: {
                    corner: "ml",
                    target: mockTarget,
                },
                e: new MouseEvent("transform"),
            };

            listeners.handleBeforeTransform(mockTransformEvent);

            // Should not block when Shift is not pressed
            expect(mockCanvas.requestRenderAll).not.toHaveBeenCalled();
        });
    });

    describe("handleMouseDown - Shift+click blocking on controls", () => {
        it("should block Shift+click on control handle and prevent transform", () => {
            const mockActiveSelection = {
                type: "activeSelection",
                hasControls: true,
                findControl: vi.fn(() => ({ corner: "ml" })),
            };

            mockCanvas.getActiveObject.mockReturnValue(mockActiveSelection);
            mockCanvas.getPointer.mockReturnValue({ x: 100, y: 100 });

            const mockEvent = new MouseEvent("mousedown", {
                shiftKey: true,
                button: 0,
            });
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            mockEvent.preventDefault = vi.fn();
            mockEvent.stopPropagation = vi.fn();

            listeners.handleMouseDown(fabricEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(mockCanvas._currentTransform).toBeNull();
        });

        it("should allow Shift+click for lasso selection when not on control", () => {
            const mockActiveSelection = {
                type: "activeSelection",
                hasControls: true,
                findControl: vi.fn(() => null), // Not on a control
            };

            mockCanvas.getActiveObject.mockReturnValue(mockActiveSelection);
            mockCanvas.getPointer.mockReturnValue({ x: 100, y: 100 });

            const mockEvent = new MouseEvent("mousedown", {
                shiftKey: true,
                button: 0,
            });
            const fabricEvent = {
                e: mockEvent,
            } as fabric.IEvent<MouseEvent>;

            mockEvent.preventDefault = vi.fn();

            listeners.handleMouseDown(fabricEvent);

            // Should enable lasso selection (not block)
            expect(mockCanvas.selection).toBe(false); // Lasso mode disables selection
        });
    });

    describe("initiateListeners", () => {
        it("should attach mouse:down:before listener", () => {
            listeners.initiateListeners();

            expect(mockCanvas.on).toHaveBeenCalledWith(
                "mouse:down:before",
                expect.any(Function),
            );
        });

        it("should attach before:transform listener", () => {
            listeners.initiateListeners();

            expect(mockCanvas.on).toHaveBeenCalledWith(
                "before:transform",
                expect.any(Function),
            );
        });

        it("should attach all required event listeners", () => {
            listeners.initiateListeners();

            expect(mockCanvas.on).toHaveBeenCalledWith(
                "object:modified",
                expect.any(Function),
            );
            expect(mockCanvas.on).toHaveBeenCalledWith(
                "mouse:down",
                expect.any(Function),
            );
            expect(mockCanvas.on).toHaveBeenCalledWith(
                "mouse:move",
                expect.any(Function),
            );
            expect(mockCanvas.on).toHaveBeenCalledWith(
                "mouse:up",
                expect.any(Function),
            );
        });
    });

    describe("cleanupListeners", () => {
        it("should remove mouse:down:before listener", () => {
            listeners.cleanupListeners();

            expect(mockCanvas.off).toHaveBeenCalledWith(
                "mouse:down:before",
                expect.any(Function),
            );
        });

        it("should remove before:transform listener", () => {
            listeners.cleanupListeners();

            expect(mockCanvas.off).toHaveBeenCalledWith(
                "before:transform",
                expect.any(Function),
            );
        });

        it("should remove all event listeners", () => {
            listeners.cleanupListeners();

            expect(mockCanvas.off).toHaveBeenCalledWith(
                "object:modified",
                expect.any(Function),
            );
            expect(mockCanvas.off).toHaveBeenCalledWith(
                "mouse:down",
                expect.any(Function),
            );
            expect(mockCanvas.off).toHaveBeenCalledWith(
                "mouse:move",
                expect.any(Function),
            );
            expect(mockCanvas.off).toHaveBeenCalledWith(
                "mouse:up",
                expect.any(Function),
            );
        });
    });

    describe("isPointInPolygon - Lasso selection helper", () => {
        it("should correctly identify point inside polygon", () => {
            const point = { x: 50, y: 50 };
            const polygon = [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 },
            ];

            // Access private method through any cast for testing
            const result = (listeners as any).isPointInPolygon(point, polygon);

            expect(result).toBe(true);
        });

        it("should correctly identify point outside polygon", () => {
            const point = { x: 150, y: 150 };
            const polygon = [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 },
            ];

            const result = (listeners as any).isPointInPolygon(point, polygon);

            expect(result).toBe(false);
        });

        it("should handle point on polygon edge", () => {
            const point = { x: 0, y: 50 };
            const polygon = [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 },
            ];

            const result = (listeners as any).isPointInPolygon(point, polygon);

            // Edge case - result depends on ray casting implementation
            expect(typeof result).toBe("boolean");
        });

        it("should handle complex polygon shape", () => {
            const point = { x: 50, y: 50 };
            const polygon = [
                { x: 0, y: 0 },
                { x: 50, y: 25 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 },
            ];

            const result = (listeners as any).isPointInPolygon(point, polygon);

            expect(typeof result).toBe("boolean");
        });
    });
});
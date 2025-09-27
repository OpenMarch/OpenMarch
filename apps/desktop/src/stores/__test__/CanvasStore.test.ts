import { describe, expect, it, beforeEach, vi } from "vitest";
import { useCanvasStore, setCanvasStore } from "../CanvasStore";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";

describe("CanvasStore", () => {
    beforeEach(() => {
        // Reset the canvas store before each test
        setCanvasStore(null);
    });

    describe("useCanvasStore", () => {
        it("should initialize with null canvas", () => {
            const state = useCanvasStore.getState();
            expect(state.canvas).toBeNull();
        });

        it("should set and get canvas instance", () => {
            const mockCanvas = {
                getObjects: vi.fn().mockReturnValue([]),
                getWidth: vi.fn().mockReturnValue(800),
                getHeight: vi.fn().mockReturnValue(600),
                setViewportTransform: vi.fn(),
                requestRenderAll: vi.fn(),
            } as unknown as OpenMarchCanvas;

            useCanvasStore.getState().setCanvas(mockCanvas);
            const state = useCanvasStore.getState();
            expect(state.canvas).toBe(mockCanvas);
        });

        it("should handle setting canvas to null", () => {
            const mockCanvas = {} as OpenMarchCanvas;

            useCanvasStore.getState().setCanvas(mockCanvas);
            let state = useCanvasStore.getState();
            expect(state.canvas).toBe(mockCanvas);

            useCanvasStore.getState().setCanvas(null);
            state = useCanvasStore.getState();
            expect(state.canvas).toBeNull();
        });

        it("should track viewport state", () => {
            const state = useCanvasStore.getState();

            // Initial viewport state
            expect(state.viewport).toEqual({
                zoom: 1,
                panX: 0,
                panY: 0,
            });
        });
    });

    describe("zoomToCollisions", () => {
        it("should do nothing when canvas is null", () => {
            useCanvasStore.getState().setCanvas(null);
            // Should not throw
            expect(() =>
                useCanvasStore.getState().zoomToCollisions(),
            ).not.toThrow();
        });

        it("should do nothing when no collision markers exist", () => {
            const mockCanvas = {
                getObjects: vi.fn().mockReturnValue([]),
                getWidth: vi.fn().mockReturnValue(800),
                getHeight: vi.fn().mockReturnValue(600),
                setViewportTransform: vi.fn(),
                requestRenderAll: vi.fn(),
            } as unknown as OpenMarchCanvas;

            useCanvasStore.getState().setCanvas(mockCanvas);
            useCanvasStore.getState().zoomToCollisions();

            expect(mockCanvas.getObjects).toHaveBeenCalled();
            expect(mockCanvas.setViewportTransform).not.toHaveBeenCalled();
            expect(mockCanvas.requestRenderAll).not.toHaveBeenCalled();
        });

        it("should zoom to collision markers when they exist", () => {
            const mockCollisionMarkers = [
                {
                    isCollisionMarker: true,
                    left: 100,
                    top: 100,
                    radius: 10,
                },
                {
                    isCollisionMarker: true,
                    left: 200,
                    top: 200,
                    radius: 15,
                },
            ];

            const mockCanvas = {
                getObjects: vi.fn().mockReturnValue(mockCollisionMarkers),
                getWidth: vi.fn().mockReturnValue(800),
                getHeight: vi.fn().mockReturnValue(600),
                setViewportTransform: vi.fn(),
                requestRenderAll: vi.fn(),
            } as unknown as OpenMarchCanvas;

            useCanvasStore.getState().setCanvas(mockCanvas);
            useCanvasStore.getState().zoomToCollisions();

            expect(mockCanvas.getObjects).toHaveBeenCalled();
            expect(mockCanvas.getWidth).toHaveBeenCalled();
            expect(mockCanvas.getHeight).toHaveBeenCalled();
            expect(mockCanvas.setViewportTransform).toHaveBeenCalled();
            expect(mockCanvas.requestRenderAll).toHaveBeenCalled();

            // Check that the viewport transform was called with correct array structure
            const transformCall = (mockCanvas.setViewportTransform as any).mock
                .calls[0][0];
            expect(transformCall).toHaveLength(6);
            expect(transformCall[0]).toBeGreaterThan(0); // zoom X
            expect(transformCall[3]).toBeGreaterThan(0); // zoom Y
        });

        it("should calculate correct bounding box for multiple collision markers", () => {
            const mockCollisionMarkers = [
                {
                    isCollisionMarker: true,
                    left: 50,
                    top: 50,
                    radius: 5,
                },
                {
                    isCollisionMarker: true,
                    left: 350,
                    top: 250,
                    radius: 10,
                },
            ];

            const mockCanvas = {
                getObjects: vi.fn().mockReturnValue(mockCollisionMarkers),
                getWidth: vi.fn().mockReturnValue(800),
                getHeight: vi.fn().mockReturnValue(600),
                setViewportTransform: vi.fn(),
                requestRenderAll: vi.fn(),
            } as unknown as OpenMarchCanvas;

            useCanvasStore.getState().setCanvas(mockCanvas);
            useCanvasStore.getState().zoomToCollisions();

            const transformCall = (mockCanvas.setViewportTransform as any).mock
                .calls[0][0];

            // Zoom should be capped at 1.5 * 0.7 = 1.05
            expect(transformCall[0]).toBeLessThanOrEqual(1.05);
            expect(transformCall[3]).toBeLessThanOrEqual(1.05);

            // Should be the same zoom for both X and Y
            expect(transformCall[0]).toBe(transformCall[3]);
        });
    });

    describe("zoomToFit", () => {
        it("should do nothing when canvas is null", () => {
            useCanvasStore.getState().setCanvas(null);
            expect(() => useCanvasStore.getState().zoomToFit()).not.toThrow();
        });

        it("should zoom to fit all objects when no specific objects provided", () => {
            const mockObjects = [
                { left: 100, top: 100, width: 50, height: 50 },
                { left: 200, top: 200, width: 50, height: 50 },
            ];

            const mockCanvas = {
                getObjects: vi.fn().mockReturnValue(mockObjects),
                getWidth: vi.fn().mockReturnValue(800),
                getHeight: vi.fn().mockReturnValue(600),
                setViewportTransform: vi.fn(),
                requestRenderAll: vi.fn(),
            } as unknown as OpenMarchCanvas;

            useCanvasStore.getState().setCanvas(mockCanvas);
            useCanvasStore.getState().zoomToFit();

            expect(mockCanvas.getObjects).toHaveBeenCalled();
            expect(mockCanvas.setViewportTransform).toHaveBeenCalled();
            expect(mockCanvas.requestRenderAll).toHaveBeenCalled();
        });
    });

    describe("resetViewport", () => {
        it("should reset viewport to default values", () => {
            const mockCanvas = {
                setViewportTransform: vi.fn(),
                requestRenderAll: vi.fn(),
            } as unknown as OpenMarchCanvas;

            useCanvasStore.getState().setCanvas(mockCanvas);
            useCanvasStore.getState().resetViewport();

            expect(mockCanvas.setViewportTransform).toHaveBeenCalledWith([
                1, 0, 0, 1, 0, 0,
            ]);
            expect(mockCanvas.requestRenderAll).toHaveBeenCalled();
        });
    });

    describe("backward compatibility exports", () => {
        it("should work with setCanvasStore export", () => {
            const mockCanvas = {} as OpenMarchCanvas;
            setCanvasStore(mockCanvas);

            const state = useCanvasStore.getState();
            expect(state.canvas).toBe(mockCanvas);
        });
    });
});

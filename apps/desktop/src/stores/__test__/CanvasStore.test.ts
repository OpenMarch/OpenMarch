import { describe, expect, it, beforeEach, vi } from "vitest";
import { canvasManager, useCanvasStore } from "../CanvasStore";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { renderHook } from "@testing-library/react";

describe("CanvasStore", () => {
    beforeEach(() => {
        // Reset the canvas manager before each test
        canvasManager.setCanvas(null);
    });

    describe("canvasManager", () => {
        it("should initialize with null canvas", () => {
            expect(canvasManager.getCanvas()).toBeNull();
        });

        it("should set and get canvas instance", () => {
            const mockCanvas = {
                getObjects: vi.fn().mockReturnValue([]),
                getWidth: vi.fn().mockReturnValue(800),
                getHeight: vi.fn().mockReturnValue(600),
                setViewportTransform: vi.fn(),
                requestRenderAll: vi.fn(),
            } as unknown as OpenMarchCanvas;

            canvasManager.setCanvas(mockCanvas);
            expect(canvasManager.getCanvas()).toBe(mockCanvas);
        });

        it("should handle setting canvas to null", () => {
            const mockCanvas = {} as OpenMarchCanvas;
            canvasManager.setCanvas(mockCanvas);
            expect(canvasManager.getCanvas()).toBe(mockCanvas);

            canvasManager.setCanvas(null);
            expect(canvasManager.getCanvas()).toBeNull();
        });
    });

    describe("zoomToCollisions", () => {
        it("should do nothing when canvas is null", () => {
            canvasManager.setCanvas(null);
            // Should not throw
            expect(() => canvasManager.zoomToCollisions()).not.toThrow();
        });

        it("should do nothing when no collision markers exist", () => {
            const mockCanvas = {
                getObjects: vi.fn().mockReturnValue([]),
                getWidth: vi.fn().mockReturnValue(800),
                getHeight: vi.fn().mockReturnValue(600),
                setViewportTransform: vi.fn(),
                requestRenderAll: vi.fn(),
            } as unknown as OpenMarchCanvas;

            canvasManager.setCanvas(mockCanvas);
            canvasManager.zoomToCollisions();

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

            canvasManager.setCanvas(mockCanvas);
            canvasManager.zoomToCollisions();

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

            canvasManager.setCanvas(mockCanvas);
            canvasManager.zoomToCollisions();

            const transformCall = (mockCanvas.setViewportTransform as any).mock
                .calls[0][0];

            // Zoom should be capped at 1.5 * 0.7 = 1.05
            expect(transformCall[0]).toBeLessThanOrEqual(1.05);
            expect(transformCall[3]).toBeLessThanOrEqual(1.05);

            // Should be the same zoom for both X and Y
            expect(transformCall[0]).toBe(transformCall[3]);
        });
    });

    describe("useCanvasStore hook", () => {
        it("should return stable function references", () => {
            const { result, rerender } = renderHook(() => useCanvasStore());

            const firstSetCanvas = result.current.setCanvas;
            const firstZoomToCollisions = result.current.zoomToCollisions;

            rerender();

            expect(result.current.setCanvas).toBe(firstSetCanvas);
            expect(result.current.zoomToCollisions).toBe(firstZoomToCollisions);
        });

        it("should call canvasManager methods", () => {
            const { result } = renderHook(() => useCanvasStore());
            const mockCanvas = {} as OpenMarchCanvas;

            result.current.setCanvas(mockCanvas);
            expect(canvasManager.getCanvas()).toBe(mockCanvas);

            result.current.setCanvas(null);
            expect(canvasManager.getCanvas()).toBeNull();
        });
    });
});

import { create } from "zustand";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";

interface ViewportState {
    zoom: number;
    panX: number;
    panY: number;
}

interface CanvasStore {
    canvas: OpenMarchCanvas | null;
    viewport: ViewportState;
    setCanvas: (canvas: OpenMarchCanvas | null) => void;
    zoomToCollisions: () => void;
    zoomToFit: (objects?: any[]) => void;
    resetViewport: () => void;
    setViewport: (zoom: number, panX: number, panY: number) => void;
    getViewportState: () => ViewportState;
}

// Helper functions to reduce complexity
const calculateCollisionBounds = (collisionMarkers: any[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const marker of collisionMarkers) {
        const left = marker.left || 0;
        const top = marker.top || 0;
        const radius = (marker as any).radius || 0;

        minX = Math.min(minX, left - radius);
        minY = Math.min(minY, top - radius);
        maxX = Math.max(maxX, left + radius);
        maxY = Math.max(maxY, top + radius);
    }

    return { minX, minY, maxX, maxY };
};

const calculateObjectBounds = (objects: any[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const obj of objects) {
        const left = obj.left || 0;
        const top = obj.top || 0;
        const width = obj.width || 0;
        const height = obj.height || 0;

        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, left + width);
        maxY = Math.max(maxY, top + height);
    }

    return { minX, minY, maxX, maxY };
};

const applyViewportTransform = (
    canvas: OpenMarchCanvas,
    zoom: number,
    panX: number,
    panY: number,
    set: (state: Partial<CanvasStore>) => void,
) => {
    canvas.setViewportTransform([zoom, 0, 0, zoom, panX, panY]);
    canvas.requestRenderAll();
    set({ viewport: { zoom, panX, panY } });
};

export const useCanvasStore = create<CanvasStore>((set, get) => ({
    canvas: null,
    viewport: {
        zoom: 1,
        panX: 0,
        panY: 0,
    },

    setCanvas: (canvas) => set({ canvas }),

    zoomToCollisions: () => {
        const { canvas } = get();
        if (!canvas) return;

        const collisionMarkers = canvas
            .getObjects()
            .filter((obj: any) => obj.isCollisionMarker);

        if (collisionMarkers.length === 0) return;

        const { minX, minY, maxX, maxY } =
            calculateCollisionBounds(collisionMarkers);

        // Add padding around the bounding box
        const padding = 100;
        const paddedMinX = minX - padding;
        const paddedMinY = minY - padding;
        const paddedMaxX = maxX + padding;
        const paddedMaxY = maxY + padding;

        // Calculate center and dimensions
        const centerX = (paddedMinX + paddedMaxX) / 2;
        const centerY = (paddedMinY + paddedMaxY) / 2;
        const width = paddedMaxX - paddedMinX;
        const height = paddedMaxY - paddedMinY;

        // Get canvas dimensions
        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();

        // Calculate zoom level
        const zoomX = canvasWidth / width;
        const zoomY = canvasHeight / height;
        const zoom = Math.min(zoomX, zoomY, 1.5) * 0.7;

        // Calculate pan to center
        const panX = canvasWidth / 2 - centerX * zoom;
        const panY = canvasHeight / 2 - centerY * zoom;

        applyViewportTransform(canvas, zoom, panX, panY, set);
    },

    zoomToFit: (objects) => {
        const { canvas } = get();
        if (!canvas) return;

        const targetObjects = objects || canvas.getObjects();
        if (targetObjects.length === 0) return;

        const { minX, minY, maxX, maxY } = calculateObjectBounds(targetObjects);

        // Add padding
        const padding = 50;
        const paddedMinX = minX - padding;
        const paddedMinY = minY - padding;
        const paddedMaxX = maxX + padding;
        const paddedMaxY = maxY + padding;

        // Calculate center and dimensions
        const centerX = (paddedMinX + paddedMaxX) / 2;
        const centerY = (paddedMinY + paddedMaxY) / 2;
        const width = paddedMaxX - paddedMinX;
        const height = paddedMaxY - paddedMinY;

        // Get canvas dimensions
        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();

        // Calculate zoom to fit
        const zoomX = canvasWidth / width;
        const zoomY = canvasHeight / height;
        const zoom = Math.min(zoomX, zoomY, 2);

        // Calculate pan to center
        const panX = canvasWidth / 2 - centerX * zoom;
        const panY = canvasHeight / 2 - centerY * zoom;

        applyViewportTransform(canvas, zoom, panX, panY, set);
    },

    resetViewport: () => {
        const { canvas } = get();
        if (!canvas) return;

        applyViewportTransform(canvas, 1, 0, 0, set);
    },

    setViewport: (zoom, panX, panY) => {
        const { canvas } = get();
        if (!canvas) return;

        applyViewportTransform(canvas, zoom, panX, panY, set);
    },

    getViewportState: () => {
        const { canvas, viewport } = get();
        if (!canvas || !canvas.viewportTransform) return viewport;

        const transform = canvas.viewportTransform;
        return {
            zoom: transform[0],
            panX: transform[4],
            panY: transform[5],
        };
    },
}));

// Backward compatibility exports
export const setCanvasStore = (canvas: OpenMarchCanvas | null) =>
    useCanvasStore.getState().setCanvas(canvas);
export const zoomToCollisions = () =>
    useCanvasStore.getState().zoomToCollisions();

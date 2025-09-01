import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";

class CanvasManager {
    private canvas: OpenMarchCanvas | null = null;

    setCanvas(canvas: OpenMarchCanvas | null) {
        this.canvas = canvas;
    }

    getCanvas(): OpenMarchCanvas | null {
        return this.canvas;
    }

    zoomToCollisions() {
        if (!this.canvas) return;

        // Get all collision markers on the canvas
        const collisionMarkers = this.canvas
            .getObjects()
            .filter((obj: any) => obj.isCollisionMarker);

        if (collisionMarkers.length === 0) return;

        // Calculate bounding box for all collision markers
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

        // Add more padding around the bounding box for better context
        const padding = 100;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        // Calculate the center and dimensions of the bounding box
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const width = maxX - minX;
        const height = maxY - minY;

        // Get canvas dimensions
        const canvasWidth = this.canvas.getWidth();
        const canvasHeight = this.canvas.getHeight();

        // Calculate zoom level to fit all collision markers with more context
        const zoomX = canvasWidth / width;
        const zoomY = canvasHeight / height;
        const zoom = Math.min(zoomX, zoomY, 1.5) * 0.7; // Reduced zoom for better context

        // Calculate pan to center the collision markers
        const panX = canvasWidth / 2 - centerX * zoom;
        const panY = canvasHeight / 2 - centerY * zoom;

        // Apply the viewport transformation
        this.canvas.setViewportTransform([zoom, 0, 0, zoom, panX, panY]);
        this.canvas.requestRenderAll();
    }
}

// Singleton instance
export const canvasManager = new CanvasManager();

// Direct exports for use in components (not hooks)
export const setCanvasStore = (canvas: OpenMarchCanvas | null) =>
    canvasManager.setCanvas(canvas);
export const zoomToCollisions = () => canvasManager.zoomToCollisions();

// Optional: Export a hook that returns stable references
// This can be used in React components but doesn't manage state
export function useCanvasStore() {
    // These are stable references that never change
    return {
        setCanvas: setCanvasStore,
        zoomToCollisions: zoomToCollisions,
    };
}

/**
 * Plain arithmetic for the import preview stage (package C1.10): where the
 * reviewed model sits, where each view's camera goes, and the thumbnail
 * size. No three.js objects, so it tests in node.
 */
export type Vec3 = [number, number, number];

export interface Bounds {
    min: Vec3;
    max: Vec3;
}

export type PreviewView = "front" | "side" | "top";
export const PREVIEW_VIEWS: readonly PreviewView[] = ["front", "side", "top"];

/**
 * The translation that stands the model on the floor, centered on the
 * origin. Grips and points stay in the model's own meters: a clicked world
 * point minus this offset is the point in the normalized GLB.
 */
export function placementOffset(bounds: Bounds): Vec3 {
    return [
        -(bounds.min[0] + bounds.max[0]) / 2,
        -bounds.min[1],
        -(bounds.min[2] + bounds.max[2]) / 2,
    ];
}

export function boundsSize(bounds: Bounds): Vec3 {
    return [
        bounds.max[0] - bounds.min[0],
        bounds.max[1] - bounds.min[1],
        bounds.max[2] - bounds.min[2],
    ];
}

/**
 * The camera for a view of the placed scene (model plus the 1.8 m reference
 * figure), framed so the whole `size` box fits a `fovDeg` vertical field of
 * view at `aspect`. Front looks along -Z (the audience side, like the 3D
 * View's top-down front at the bottom), side along -X, top straight down
 * with front at the bottom.
 */
export function viewCamera(
    size: Vec3,
    center: Vec3,
    view: PreviewView,
    fovDeg = 35,
    aspect = 1.5,
): { position: Vec3; target: Vec3; up: Vec3 } {
    const radius = Math.max(0.05, Math.hypot(size[0], size[1], size[2]) / 2);
    const vFov = (fovDeg * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.05;
    const [cx, cy, cz] = center;
    switch (view) {
        case "front":
            return {
                position: [cx, cy + radius * 0.25, cz + distance],
                target: [cx, cy, cz],
                up: [0, 1, 0],
            };
        case "side":
            return {
                position: [cx + distance, cy + radius * 0.25, cz],
                target: [cx, cy, cz],
                up: [0, 1, 0],
            };
        case "top":
            return {
                position: [cx, cy + distance, cz],
                target: [cx, cy, cz],
                // Front (+Z) at the bottom of the screen.
                up: [0, 0, -1],
            };
    }
}

/** A thumbnail's pixel size: at most `max` on the long edge, never enlarged. */
export function thumbnailSize(
    width: number,
    height: number,
    max = 256,
): { width: number; height: number } {
    const scale = Math.min(1, max / Math.max(width, height, 1));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

/** A grid that covers the scene with whole-meter cells (at most 200). */
export function gridFor(size: Vec3): { size: number; divisions: number } {
    const extent = Math.max(4, Math.ceil(Math.max(size[0], size[2]) * 1.6 + 2));
    const even = extent + (extent % 2);
    return { size: even, divisions: Math.min(200, even) };
}

/**
 * How bright the field's floor is under a point (pathways step 4i): the theme's background with the
 * show's field image over it at its opacity, read once into a small grid (100 × 60 samples over the
 * field) whenever either changes. The order lane uses it to decide how strong a wash it needs.
 */
import type { FieldPlanImage } from "@/field/fieldPlan";
import type { Rgb } from "./orderLane";

/** Brightness (gamma-encoded, 0 to 1) at a point in field units */
export interface FloorSampler {
    brightnessAt(x: number, y: number): number;
}

const COLUMNS = 100;
const ROWS = 60;

const brightness = (r: number, g: number, b: number) =>
    (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/**
 * A floor that's one color on the field (`width` × `height`, field units) and `outside` beyond it,
 * where the app's own background shows through the field canvas
 */
export const solidFloor = (
    background: Rgb,
    field?: { width: number; height: number; outside: number },
): FloorSampler => {
    const v = brightness(background.r, background.g, background.b);
    return {
        brightnessAt: (x, y) =>
            field && isOutside(x, y, field) ? field.outside : v,
    };
};

const isOutside = (
    x: number,
    y: number,
    { width, height }: { width: number; height: number },
) => x < 0 || y < 0 || x > width || y > height;

/**
 * The floor of a field `width` × `height` (field units): `background`, with `image` drawn at
 * `placement` and its opacity when there is one. Falls back to the plain background where a canvas
 * can't be read (tests, an image that failed to draw).
 */
export function makeFloorSampler({
    background,
    image,
    placement,
    width,
    height,
    outside = 1,
}: {
    background: Rgb;
    image: CanvasImageSource | null;
    placement: FieldPlanImage | null;
    width: number;
    height: number;
    /** Brightness beyond the field, where the app's background shows (0 to 1) */
    outside?: number;
}): FloorSampler {
    const field = { width, height, outside };
    if (
        !image ||
        !placement ||
        typeof OffscreenCanvas === "undefined" ||
        width <= 0 ||
        height <= 0
    )
        return solidFloor(background, field);
    try {
        const canvas = new OffscreenCanvas(COLUMNS, ROWS);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return solidFloor(background, field);
        ctx.fillStyle = `rgb(${background.r},${background.g},${background.b})`;
        ctx.fillRect(0, 0, COLUMNS, ROWS);
        ctx.globalAlpha = placement.opacity;
        const sx = COLUMNS / width;
        const sy = ROWS / height;
        ctx.drawImage(
            image,
            placement.x * sx,
            placement.y * sy,
            placement.width * sx,
            placement.height * sy,
        );
        const data = ctx.getImageData(0, 0, COLUMNS, ROWS).data;
        const grid = new Float32Array(COLUMNS * ROWS);
        for (let i = 0; i < grid.length; i++)
            grid[i] = brightness(
                data[i * 4]!,
                data[i * 4 + 1]!,
                data[i * 4 + 2]!,
            );
        return {
            brightnessAt: (x, y) => {
                if (isOutside(x, y, field)) return outside;
                const c = Math.min(
                    COLUMNS - 1,
                    Math.max(0, Math.floor(x * sx)),
                );
                const r = Math.min(ROWS - 1, Math.max(0, Math.floor(y * sy)));
                return grid[r * COLUMNS + c]!;
            },
        };
    } catch {
        return solidFloor(background, field);
    }
}

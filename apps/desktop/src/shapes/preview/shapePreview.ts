import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import type { ShapeContext, XY } from "../types";

/**
 * A shape's small picture (#378): its own spots, and its outline where the kind has one, made
 * from the kind's geometry each time the app runs. No kind draws an icon, so a new kind or a
 * saved shape looks like itself in the Shapes tab, the ring, the library and the command bar.
 * Everything here is pure.
 */
export interface ShapePreview {
    /** The spots, in picture units from the top left ({@link PREVIEW_VIEW} across) */
    readonly spots: readonly XY[];
    /** The kind's outline, closed, in the same units; null when the kind has none */
    readonly outline: readonly XY[] | null;
}

/** How many spots the picture shows: a 3 × 3 box, enough to read as the shape and stay small */
export const PREVIEW_SPOTS = 9;
/** The picture's size, in its own units */
export const PREVIEW_VIEW = 24;
/** Room left at the picture's edges, so the spots' dots aren't cut off */
const PAD = 3;
/** Half the square the shape is laid out in, in steps */
const HALF = 4;
/**
 * How far the picture's outline stands off the spots, as a share of the shape's size (#382). A
 * kind's outline runs through its edge spots; pushed out, the dots sit inside a clear shape
 * instead of on top of its line.
 */
const OUTLINE_GAP = 0.22;

/** One field unit per step, on a half-step grid: only the picture's proportions matter */
const ENV: ToolEnv = {
    stepPx: 1,
    snap: true,
    constrain: false,
    gridSnap: ({ x, y }) => ({
        x: Math.round(x * 2) / 2,
        y: Math.round(y * 2) / 2,
    }),
    hitRadius: 0,
};
const CTX: ShapeContext = { stepPx: 1, snapPoint: ENV.gridSnap };

const PREVIEWS = new WeakMap<AnyToolKind, ShapePreview>();

/**
 * The picture of a shape of `kind`: {@link PREVIEW_SPOTS} spots filling a square, as picking the
 * kind with a square shape open would lay them out. A saved shape keeps its intervals, so a wide
 * box looks wide. The same kind gives the same picture.
 */
export function shapePreview(kind: AnyToolKind): ShapePreview {
    const known = PREVIEWS.get(kind);
    if (known) return known;
    const n = PREVIEW_SPOTS;
    // A saved shape's kind sets the saved intervals as it fills the frame
    const params = kind.fromFrame(
        {
            center: { x: 0, y: 0 },
            halfWidth: HALF,
            halfDepth: HALF,
            rotation: 0,
            flipX: false,
            flipY: false,
        },
        n,
        ENV,
    );
    const spots = kind.shape
        .generate(params, n, CTX)
        .map(({ x, y }): XY => ({ x, y }));
    const outline = kind.outline?.(params, n) ?? null;
    const preview = fitToView(spots, outline && standOff(outline, spots));
    PREVIEWS.set(kind, preview);
    return preview;
}

/**
 * `outline` pushed outward by {@link OUTLINE_GAP} of the spots' size, each corner along its two
 * edges' normals so every edge moves the same distance
 */
function standOff(outline: readonly XY[], spots: readonly XY[]): XY[] {
    const xs = spots.map((p) => p.x);
    const ys = spots.map((p) => p.y);
    const gap =
        OUTLINE_GAP *
        Math.max(
            Math.max(...xs) - Math.min(...xs),
            Math.max(...ys) - Math.min(...ys),
        );
    const n = outline.length;
    if (n < 3 || gap === 0) return [...outline];
    // Twice the signed area: which side of each edge is outside
    let area = 0;
    for (let i = 0; i < n; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % n];
        area += a.x * b.y - b.x * a.y;
    }
    const side = area > 0 ? 1 : -1;
    const normal = (a: XY, b: XY): XY => {
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return {
            x: (side * (b.y - a.y)) / length,
            y: (side * (a.x - b.x)) / length,
        };
    };
    return outline.map((p, i) => {
        const before = normal(outline[(i - 1 + n) % n], p);
        const after = normal(p, outline[(i + 1) % n]);
        // A miter: the corner moves far enough that both edges move by `gap`
        const k =
            gap / Math.max(1 + before.x * after.x + before.y * after.y, 0.25);
        return {
            x: p.x + (before.x + after.x) * k,
            y: p.y + (before.y + after.y) * k,
        };
    });
}

/** `spots` and `outline` scaled into the picture, centered, keeping their proportions */
function fitToView(
    spots: readonly XY[],
    outline: readonly XY[] | null,
): ShapePreview {
    const all = [...spots, ...(outline ?? [])];
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX;
    const depth = Math.max(...ys) - minY;
    const room = PREVIEW_VIEW - 2 * PAD;
    const k = Math.max(width, depth) > 0 ? room / Math.max(width, depth) : 0;
    const offsetX = (PREVIEW_VIEW - width * k) / 2;
    const offsetY = (PREVIEW_VIEW - depth * k) / 2;
    const place = ({ x, y }: XY): XY => ({
        x: offsetX + (x - minX) * k,
        y: offsetY + (y - minY) * k,
    });
    return {
        spots: spots.map(place),
        outline: outline && outline.map(place),
    };
}

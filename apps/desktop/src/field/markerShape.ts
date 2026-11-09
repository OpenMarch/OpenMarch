import type { MarcherLook } from "@/entity-components/appearance";

/**
 * A marcher's marker shape (`resolveMarcherLook`), and its outline at any size, so what stands
 * for a marcher off its dot (its start ghost, where it is at the start flag, the rings round it)
 * takes the marcher's own shape instead of always a circle. Sized as the marchers layer and the
 * drill-chart export draw a marcher of radius `r` (5 field units at full size): a square of side
 * `r·√π·1.2`, an equilateral triangle `2.4r` wide, and an X out to `±1.2r` with lines `0.4r`
 * wide. Renderer-independent: the SVG overlay and the WebGL dot batch draw from it.
 */
export type MarkerShape = MarcherLook["shape"];

/**
 * Whether a marker stands in for a marcher in its own shape (true), or is always a circle. One
 * switch for every marker that does: start ghosts, a shape's spots, start flag dots, isolation's
 * start and end marks and member rings. Selection rings on the marchers follow the shape on their own.
 */
export const MARKERS_FOLLOW_MARCHER_SHAPE = true;

/** The shape a marker of a marcher in `shape` is drawn in. */
export const markerShapeOf = (shape: MarkerShape | undefined): MarkerShape =>
    MARKERS_FOLLOW_MARCHER_SHAPE && shape ? shape : "circle";

/**
 * The shape a ring round a marcher in `shape` is drawn in: an X has no edge to follow, so its
 * ring is a circle.
 */
export const ringShapeOf = (shape: MarkerShape | undefined): MarkerShape => {
    const drawn = markerShapeOf(shape);
    return drawn === "cross" ? "circle" : drawn;
};

/**
 * The shape a shape's spots are drawn in, from the shapes of the marchers who will stand on them:
 * theirs when they all share one, else a circle (a spot isn't tied to one marcher while the shape
 * is drawn). An X's spots are circles, as a spot is a filled dot with an edge.
 */
export function spotShapeOf(shapes: readonly MarkerShape[]): MarkerShape {
    const first = shapes[0];
    if (first === undefined || shapes.some((s) => s !== first)) return "circle";
    return ringShapeOf(first);
}

/** Half a square marker's side, for a marcher of radius `r`. */
export const squareHalf = (r: number) => r * Math.sqrt(Math.PI) * 0.6;
/** Half a triangle marker's width, and half its height. */
export const triangleHalfWidth = (r: number) => r * 1.2;
export const triangleHalfHeight = (r: number) =>
    (triangleHalfWidth(r) * Math.sqrt(3)) / 2;
/** How far an X's arms reach along each axis, and how wide its lines are. */
export const crossReach = (r: number) => r * 1.2;
export const crossLineWidth = (r: number) => r * 0.4;

/** The farthest any marker of radius `r` reaches from its center along an axis: an X's line ends. */
export const markerExtent = (r: number) => r * 1.35;

/**
 * An SVG path for a marker of radius `r` centered on `(x, y)`, y down: a closed outline for a
 * circle, square or triangle (apex up), and an X's two lines (stroke them `crossLineWidth`).
 */
export function markerPath(
    shape: MarkerShape,
    x: number,
    y: number,
    r: number,
): string {
    const n = (v: number) => +v.toFixed(3);
    switch (shape) {
        case "square": {
            const h = squareHalf(r);
            return `M${n(x - h)} ${n(y - h)}H${n(x + h)}V${n(y + h)}H${n(x - h)}Z`;
        }
        case "triangle": {
            const hw = triangleHalfWidth(r);
            const hh = triangleHalfHeight(r);
            return `M${n(x - hw)} ${n(y + hh)}L${n(x)} ${n(y - hh)}L${n(x + hw)} ${n(y + hh)}Z`;
        }
        case "cross": {
            const s = crossReach(r);
            return `M${n(x - s)} ${n(y - s)}L${n(x + s)} ${n(y + s)}M${n(x - s)} ${n(y + s)}L${n(x + s)} ${n(y - s)}`;
        }
        default:
            return `M${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x + r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x - r)} ${n(y)}Z`;
    }
}

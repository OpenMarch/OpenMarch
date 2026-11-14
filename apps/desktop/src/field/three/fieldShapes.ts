import { ShapeUtils, Vector2 } from "three";
import type { FieldPlanShape } from "@/field/fieldPlan";

/**
 * The plan's filled shapes (the painted yard numbers) as triangles, built once
 * per plan: the field is static.
 *
 * Each outline is filled with triangles (three's ear clipping) and edged with
 * a one-pixel strip outside it whose alpha falls from 1 to 0 across it. The
 * fill's vertices never move: shifting them by their miters would turn the
 * ear clipping's thin slivers inside out, and they'd overlap. MSAA is off on the field (`fieldQuality.ts`), so the strip
 * is what smooths the edge, as the lines' shader does (#249). Both move with the zoom in the vertex
 * shader (`FieldLayer`), from each vertex's `offsets` (its miter, pointing
 * away from the fill) times its `edges` value in device pixels; only the
 * strip's outer edge has one.
 */
export type FieldShapeMesh = {
    /** x, y, 0 per vertex, in field units. */
    positions: Float32Array;
    /** The unit miter away from the fill, x and y per vertex. */
    offsets: Float32Array;
    /** Device pixels along the miter: 0 on the fill's edge (which never moves), 1 on the strip's outer edge. */
    edges: Float32Array;
    /** r, g, b, a per vertex, 0 to 1. */
    colors: Float32Array;
    indices: Uint32Array;
    /** The first `fillIndexCount` indices are the fill; the rest, the edge strips. */
    fillIndexCount: number;
};

type Point = [x: number, y: number];
type Rgba01 = [r: number, g: number, b: number, a: number];

/** Quadratic curves are split into this many lines. */
export const SHAPE_CURVE_SEGMENTS = 8;
/** A miter is at most this many times the strip's width, so sharp tips don't spike. */
const MITER_LIMIT = 2;

// Each match is one command letter and its numbers.
const PATH_COMMAND = /([MLQZ])([^MLQZ]*)/g; // cspell:disable-line

/**
 * The closed outlines of a path of absolute M, L, Q and Z commands, curves
 * flattened, without repeated points.
 */
export function shapePathContours(
    path: string,
    curveSegments = SHAPE_CURVE_SEGMENTS,
): Point[][] {
    const contours: Point[][] = [];
    let contour: Point[] = [];
    let at: Point = [0, 0];
    const finish = () => {
        const cleaned = withoutRepeats(contour);
        if (cleaned.length >= 3) contours.push(cleaned);
        contour = [];
    };
    for (const [, command, args] of path.matchAll(PATH_COMMAND)) {
        const n = args
            .trim()
            .split(/[\s,]+/)
            .filter(Boolean)
            .map(Number);
        switch (command) {
            case "M":
                finish();
                at = [n[0]!, n[1]!];
                contour.push(at);
                break;
            case "L":
                for (let i = 0; i + 1 < n.length; i += 2) {
                    at = [n[i]!, n[i + 1]!];
                    contour.push(at);
                }
                break;
            case "Q":
                for (let i = 0; i + 3 < n.length; i += 4) {
                    const [x0, y0] = at;
                    const [cx, cy, x1, y1] = n.slice(i, i + 4) as [
                        number,
                        number,
                        number,
                        number,
                    ];
                    for (let s = 1; s <= curveSegments; s++) {
                        const t = s / curveSegments;
                        const u = 1 - t;
                        contour.push([
                            u * u * x0 + 2 * u * t * cx + t * t * x1,
                            u * u * y0 + 2 * u * t * cy + t * t * y1,
                        ]);
                    }
                    at = [x1, y1];
                }
                break;
            case "Z":
                finish();
                break;
        }
    }
    finish();
    return contours;
}

function withoutRepeats(points: Point[]): Point[] {
    const out: Point[] = [];
    for (const p of points) {
        const last = out[out.length - 1];
        if (last && same(last, p)) continue;
        out.push(p);
    }
    while (out.length > 1 && same(out[0]!, out[out.length - 1]!)) out.pop();
    return out;
}

const same = (a: Point, b: Point) =>
    Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/** Twice the signed area (shoelace); its sign is the winding. */
export function signedArea2(contour: Point[]): number {
    let sum = 0;
    for (let i = 0; i < contour.length; i++) {
        const [x0, y0] = contour[i]!;
        const [x1, y1] = contour[(i + 1) % contour.length]!;
        sum += x0 * y1 - x1 * y0;
    }
    return sum;
}

function contains(contour: Point[], [x, y]: Point): boolean {
    let inside = false;
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
        const [xi, yi] = contour[i]!;
        const [xj, yj] = contour[j]!;
        const crosses = yi > y ? yj <= y : yj > y;
        if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}

/**
 * Groups outlines into filled outlines and their holes by how deeply each is
 * nested, whatever its winding: a digit's counter (in 0, 4, 6, 8 and 9) is a
 * hole of the outline around it, also when the number is turned or mirrored.
 */
export function groupHoles(
    contours: Point[][],
): { outline: Point[]; holes: Point[][] }[] {
    const containers = contours.map((c, i) =>
        contours
            .map((_, j) => j)
            .filter((j) => j !== i && contains(contours[j]!, c[0]!)),
    );
    const depth = containers.map((list) => list.length);
    const groups = new Map<number, { outline: Point[]; holes: Point[][] }>();
    contours.forEach((outline, i) => {
        if (depth[i]! % 2 === 0) groups.set(i, { outline, holes: [] });
    });
    contours.forEach((hole, i) => {
        if (depth[i]! % 2 === 0) return;
        // The nearest container: the one nested one level less
        const parent = containers[i]!.find((j) => depth[j] === depth[i]! - 1);
        if (parent !== undefined) groups.get(parent)?.holes.push(hole);
    });
    return [...groups.values()];
}

/** Triangulates the plan's shapes, with antialiasing strips on every edge. */
export function fieldShapeMesh(
    shapes: readonly FieldPlanShape[],
    curveSegments = SHAPE_CURVE_SEGMENTS,
): FieldShapeMesh {
    const positions: number[] = [];
    const offsets: number[] = [];
    const edges: number[] = [];
    const colors: number[] = [];
    const fill: number[] = [];
    const strips: number[] = [];

    for (const shape of shapes) {
        const { r, g, b, a } = shape.color;
        const color: Rgba01 = [r / 255, g / 255, b / 255, a];
        for (const { outline, holes } of groupHoles(
            shapePathContours(shape.path, curveSegments),
        )) {
            // Each outline's vertices: fill edge (inner) then strip edge (outer)
            const firsts: number[] = [];
            const all = [outline, ...holes];
            all.forEach((contour, k) => {
                firsts.push(positions.length / 3);
                // Away from the fill: outside an outline, inside a hole
                const awaySign =
                    (signedArea2(contour) > 0 ? 1 : -1) * (k === 0 ? 1 : -1);
                addContour(contour, awaySign, color, {
                    positions,
                    offsets,
                    edges,
                    colors,
                });
            });
            // Fill, from the inner vertices (every other vertex)
            const faces = ShapeUtils.triangulateShape(
                outline.map(([x, y]) => new Vector2(x, y)),
                holes.map((h) => h.map(([x, y]) => new Vector2(x, y))),
            );
            const vertexOf = (index: number) => {
                let k = 0;
                let rest = index;
                while (rest >= all[k]!.length) rest -= all[k++]!.length;
                return firsts[k]! + rest * 2;
            };
            for (const face of faces)
                for (const i of face) fill.push(vertexOf(i));
            // Strips: a quad per edge
            all.forEach((contour, k) => {
                const n = contour.length;
                for (let i = 0; i < n; i++) {
                    const a = firsts[k]! + i * 2;
                    const b = firsts[k]! + ((i + 1) % n) * 2;
                    strips.push(a, b, b + 1, a, b + 1, a + 1);
                }
            });
        }
    }

    return {
        positions: new Float32Array(positions),
        offsets: new Float32Array(offsets),
        edges: new Float32Array(edges),
        colors: new Float32Array(colors),
        indices: new Uint32Array([...fill, ...strips]),
        fillIndexCount: fill.length,
    };
}

function addContour(
    contour: Point[],
    awaySign: number,
    color: Rgba01,
    out: {
        positions: number[];
        offsets: number[];
        edges: number[];
        colors: number[];
    },
) {
    const n = contour.length;
    // The normal of edge i (from point i to i + 1), pointing away from the fill
    const normals = contour.map((p, i) => {
        const q = contour[(i + 1) % n]!;
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const length = Math.hypot(dx, dy) || 1;
        // (dy, -dx) is outside a positive-area outline
        return [(awaySign * dy) / length, (awaySign * -dx) / length] as Point;
    });
    contour.forEach(([x, y], i) => {
        const before = normals[(i - 1 + n) % n]!;
        const after = normals[i]!;
        let mx = before[0] + after[0];
        let my = before[1] + after[1];
        const length = Math.hypot(mx, my);
        if (length < 1e-9) {
            mx = after[0];
            my = after[1];
        } else {
            mx /= length;
            my /= length;
        }
        const cos = mx * after[0] + my * after[1];
        const scale = Math.min(1 / Math.max(cos, 1e-6), MITER_LIMIT);
        for (const edge of [0, 1]) {
            out.positions.push(x, y, 0);
            out.offsets.push(mx * scale, my * scale);
            out.edges.push(edge);
            out.colors.push(...color);
        }
    });
}

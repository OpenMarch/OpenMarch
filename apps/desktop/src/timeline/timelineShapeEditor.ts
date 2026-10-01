import {
    normalizeStartAngle,
    type PathStyle,
    type ShapeGeometry,
    type ShapeKind,
    type ShapeRow,
    type TransitionRow,
    type XY,
} from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import {
    createTimelineShape,
    deleteTimelineShape,
    updateTimelineShape,
    type ModifiedTimelineShapeArgs,
    type NewTimelineShapeArgs,
} from "@/db-functions/timelineShapes";
import type { TimelineViewShape } from "./timelineViewModel";

/**
 * The inspector's shape editor (P8.2): spec shapes (`line`, `freehand`, `circle`, `box` and
 * `block`, spec 5.2) drawn and edited in absolute field coordinates (D-5). Pure apart from
 * `applyShapeEdit`, which runs the planned db-function.
 *
 * - A change that would write nothing is planned as `null` and skipped, since an edit that writes
 *   nothing is refused by `transactionWithHistory`.
 * - A shape that transitions use stays valid for them where the editor chooses the numbers: a
 *   shape converted to a block gets a cell for every slot of every transition using it (I-T4).
 *   Where the user chooses them (fewer rows or columns, or a block for a follow-the-leader move,
 *   I-T3), the change is planned as given and the database refuses it (E-T3/E-T4); the editor
 *   disables what it can show is refused, with the reason.
 * - Geometry is validated by the db-functions (I-S1, E-S1) before anything is written.
 */

/** A transition that ends in a shape. */
export interface ShapeUse {
    transitionId: number;
    style: PathStyle;
    slotCount: number;
}

/** A shape as the editor shows it. */
export interface ShapeEditTarget {
    id: number;
    name: string | null;
    shape: ShapeRow;
    /** The resolver store version the rows were read at (the stale-plan guard) */
    version: number;
    /** The transitions whose destination is this shape, by id */
    usedBy: ShapeUse[];
    /** The cells a block must have: the most slots of any transition using it, 0 when unused */
    minCells: number;
}

/** One control's change. */
export type ShapeEdit =
    | { kind: "rename"; name: string }
    | { kind: "kind"; to: ShapeKind }
    | { kind: "geometry"; geometry: ShapeGeometry }
    | { kind: "delete" };

/** The db-function call a change becomes. */
export type PlannedShapeEdit =
    | { fn: "create"; args: NewTimelineShapeArgs }
    | { fn: "update"; args: ModifiedTimelineShapeArgs }
    | { fn: "delete"; shapeId: number };

/**
 * Where a new shape goes when no marcher places it, and the sizes the editor picks when it has to
 * (a degenerate selection, a kind change from a shape with no width). Field units, like every
 * coordinate in the timeline.
 */
export interface ShapeFrame {
    /** The middle of the field */
    center: XY;
    /** A new shape's width and height, and a circle's diameter */
    size: number;
    /** The spacing between a new block's rows and columns */
    spacing: number;
}

/** A new shape's size and a new block's spacing, in steps. */
const NEW_SHAPE_STEPS = 16;
const NEW_BLOCK_SPACING_STEPS = 2;

/**
 * The frame for a field `width` × `height` with `pixelsPerStep` field units per step: its middle,
 * 16 steps across and 2 steps between a block's cells. With no field yet, the origin, in units of
 * one.
 */
export function shapeFrameFor(
    field: { width: number; height: number; pixelsPerStep: number } | null,
): ShapeFrame {
    if (!field)
        return {
            center: [0, 0],
            size: NEW_SHAPE_STEPS,
            spacing: NEW_BLOCK_SPACING_STEPS,
        };
    return {
        center: [field.width / 2, field.height / 2],
        size: NEW_SHAPE_STEPS * field.pixelsPerStep,
        spacing: NEW_BLOCK_SPACING_STEPS * field.pixelsPerStep,
    };
}

export const SHAPE_KINDS: readonly ShapeKind[] = [
    "line",
    "freehand",
    "circle",
    "box",
    "block",
];

/** The cells a new block has when no transition needs more: 4 × 4. */
export const DEFAULT_BLOCK_CELLS = 16;
/** Points a circle becomes when it turns into a freehand path (open, so its ends differ). */
const CIRCLE_TO_FREEHAND_SEGMENTS = 16;
/** Past this many marchers, a new line is fitted to their bounds rather than their farthest pair. */
const MAX_FARTHEST_PAIR = 2000;

/** The editor's view of every shape, by id. */
export function buildShapeEditTargets(
    shapes: Readonly<Record<number, ShapeRow>>,
    named: readonly TimelineViewShape[],
    transitions: Readonly<Record<number, TransitionRow>>,
    version: number,
): ShapeEditTarget[] {
    const names = new Map(named.map((s) => [s.id, s.name]));
    const uses = new Map<number, ShapeUse[]>();
    for (const row of Object.values(transitions)) {
        if (row.dest === null) continue;
        const list = uses.get(row.dest) ?? [];
        list.push({
            transitionId: row.id,
            style: row.style,
            slotCount: row.slots,
        });
        uses.set(row.dest, list);
    }
    return Object.entries(shapes)
        .map(([key, shape]) => {
            const id = Number(key);
            const usedBy = (uses.get(id) ?? []).sort(
                (a, b) => a.transitionId - b.transitionId,
            );
            return {
                id,
                name: names.get(id) ?? null,
                shape,
                version,
                usedBy,
                minCells: usedBy.reduce((m, u) => Math.max(m, u.slotCount), 0),
            };
        })
        .sort((a, b) => a.id - b.id);
}

/** Why the shape can't become `kind`, or null when it can: a follow-the-leader move can't end on a block (I-T3). */
export function kindBlocker(
    target: ShapeEditTarget,
    kind: ShapeKind,
): "ftlBlock" | null {
    if (kind !== "block" || target.shape.kind === "block") return null;
    return target.usedBy.some((u) => u.style === "follow_the_leader")
        ? "ftlBlock"
        : null;
}

/** Why the shape can't be deleted, or null when it can: a transition uses it (I-D1). */
export function deleteBlocker(target: ShapeEditTarget): "inUse" | null {
    return target.usedBy.length > 0 ? "inUse" : null;
}

/** The transitions whose slots a block needs `minCells` for: the ones with the most slots. */
export function blockNeeds(target: ShapeEditTarget): number[] {
    return target.usedBy
        .filter((u) => u.slotCount === target.minCells)
        .map((u) => u.transitionId);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

const boundsOf = (points: readonly XY[]): Bounds => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
};

/**
 * The box's corners in traversal order (spec 5.2), as an open path: it doesn't return to the
 * origin. Freehand samples at `i/(n-1)` (R-13), so a path that ended where it started would put
 * its first and last slots on the same spot.
 */
const boxOutline = (origin: XY, width: number, height: number): XY[] => [
    [origin[0], origin[1]],
    [origin[0] + width, origin[1]],
    [origin[0] + width, origin[1] + height],
    [origin[0], origin[1] + height],
];

/** The smallest axis-aligned box around a shape. */
export function shapeBounds(shape: ShapeRow): Bounds {
    switch (shape.kind) {
        case "line":
        case "freehand":
            return boundsOf(shape.geometry.points);
        case "circle":
            return {
                minX: shape.geometry.center[0] - shape.geometry.radius,
                minY: shape.geometry.center[1] - shape.geometry.radius,
                maxX: shape.geometry.center[0] + shape.geometry.radius,
                maxY: shape.geometry.center[1] + shape.geometry.radius,
            };
        case "box":
            return boundsOf([
                shape.geometry.origin,
                [
                    shape.geometry.origin[0] + shape.geometry.width,
                    shape.geometry.origin[1] + shape.geometry.height,
                ],
            ]);
        case "block": {
            const b = shape.geometry;
            // The corner cells bound the grid, whatever the spacing's signs
            return boundsOf([
                b.origin,
                [
                    b.origin[0] + (b.cols - 1) * b.spacing[0],
                    b.origin[1] + (b.rows - 1) * b.spacing[1],
                ],
            ]);
        }
    }
}

/** `bounds` with any side shorter than `size` widened to `size` about its middle. */
const widen = (bounds: Bounds, size: number): Bounds => {
    const out = { ...bounds };
    if (!(out.maxX - out.minX > 0)) {
        const cx = (out.minX + out.maxX) / 2;
        out.minX = cx - size / 2;
        out.maxX = cx + size / 2;
    }
    if (!(out.maxY - out.minY > 0)) {
        const cy = (out.minY + out.maxY) / 2;
        out.minY = cy - size / 2;
        out.maxY = cy + size / 2;
    }
    return out;
};

const centered = (center: XY, size: number): Bounds => ({
    minX: center[0] - size / 2,
    minY: center[1] - size / 2,
    maxX: center[0] + size / 2,
    maxY: center[1] + size / 2,
});

/** A block's rows and columns for `cells` cells, as square as can be: columns first. */
export function gridFor(cells: number): { rows: number; cols: number } {
    const n = Math.max(1, Math.ceil(cells));
    const cols = Math.ceil(Math.sqrt(n));
    return { rows: Math.ceil(n / cols), cols };
}

/**
 * A shape of `kind` filling `bounds` (widened where it has no size). A block gets at least
 * `cells` cells, spread over the bounds, or `frame.spacing` apart along a side with one cell.
 */
function shapeInBounds(
    kind: ShapeKind,
    rawBounds: Bounds,
    frame: ShapeFrame,
    cells: number,
): ShapeRow {
    const b = widen(rawBounds, frame.size);
    const width = b.maxX - b.minX;
    const height = b.maxY - b.minY;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    switch (kind) {
        case "line":
            return {
                kind,
                geometry: {
                    points:
                        width >= height
                            ? [
                                  [b.minX, cy],
                                  [b.maxX, cy],
                              ]
                            : [
                                  [cx, b.minY],
                                  [cx, b.maxY],
                              ],
                },
            };
        case "freehand":
            return {
                kind,
                geometry: {
                    points: boxOutline([b.minX, b.minY], width, height),
                },
            };
        case "circle":
            return {
                kind,
                geometry: {
                    center: [cx, cy],
                    radius: Math.max(width, height) / 2,
                    start_angle: 0,
                    clockwise: false,
                },
            };
        case "box":
            return {
                kind,
                geometry: { origin: [b.minX, b.minY], width, height },
            };
        case "block": {
            const { rows, cols } = gridFor(cells);
            return {
                kind,
                geometry: {
                    origin: [b.minX, b.minY],
                    rows,
                    cols,
                    spacing: [
                        cols > 1 ? width / (cols - 1) : frame.spacing,
                        rows > 1 ? height / (rows - 1) : frame.spacing,
                    ],
                },
            };
        }
    }
}

const pathLength = (points: readonly XY[]) => {
    let length = 0;
    for (let i = 1; i < points.length; i++)
        length += Math.hypot(
            points[i]![0] - points[i - 1]![0],
            points[i]![1] - points[i - 1]![1],
        );
    return length;
};

/** The two points farthest apart, in their order in `points`; null when every point is the same. */
function farthestPair(points: readonly XY[]): [XY, XY] | null {
    let best: [XY, XY] | null = null;
    let bestDistance = 0;
    for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
            const d = Math.hypot(
                points[j]![0] - points[i]![0],
                points[j]![1] - points[i]![1],
            );
            if (d > bestDistance) {
                bestDistance = d;
                best = [points[i]!, points[j]!];
            }
        }
    return best;
}

const copy = (p: XY): XY => [p[0], p[1]];

/**
 * A new shape of `kind` drawn through `points`, the selected marchers where they stand (in the
 * selection's order):
 *
 * - a line between the two that are farthest apart;
 * - a freehand path through all of them, in order;
 * - a circle about their middle, through the first (with their mean distance as the radius when
 *   the first stands on the middle);
 * - a box around them;
 * - a block with a cell for each of them, spread over the box around them.
 *
 * With no points, the shape is `frame.size` across at the field's middle; with one, it is
 * centered on that point. Where the points don't make a valid shape (all on one spot), it falls
 * back to the box around them, widened to `frame.size`.
 */
export function newShapeThrough(
    kind: ShapeKind,
    points: readonly XY[],
    frame: ShapeFrame,
): ShapeRow {
    if (points.length === 0)
        return shapeInBounds(
            kind,
            centered(frame.center, frame.size),
            frame,
            DEFAULT_BLOCK_CELLS,
        );
    if (points.length === 1)
        return shapeInBounds(
            kind,
            centered(points[0]!, frame.size),
            frame,
            DEFAULT_BLOCK_CELLS,
        );
    const bounds = boundsOf(points);
    switch (kind) {
        case "line": {
            const pair =
                points.length <= MAX_FARTHEST_PAIR
                    ? farthestPair(points)
                    : null;
            if (pair)
                return {
                    kind,
                    geometry: { points: [copy(pair[0]), copy(pair[1])] },
                };
            break;
        }
        case "freehand":
            if (pathLength(points) > 0)
                return { kind, geometry: { points: points.map(copy) } };
            break;
        case "circle": {
            const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
            const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
            const first = points[0]!;
            const toFirst = Math.hypot(first[0] - cx, first[1] - cy);
            const radius =
                toFirst > 0
                    ? toFirst
                    : points.reduce(
                          (s, p) => s + Math.hypot(p[0] - cx, p[1] - cy),
                          0,
                      ) / points.length;
            if (radius > 0) {
                const angle =
                    toFirst > 0
                        ? normalizeStartAngle(
                              Math.atan2(first[1] - cy, first[0] - cx),
                          )
                        : 0;
                return {
                    kind,
                    geometry: {
                        center: [cx, cy],
                        radius,
                        start_angle: angle,
                        clockwise: false,
                    },
                };
            }
            break;
        }
        case "box":
        case "block":
            return shapeInBounds(kind, bounds, frame, points.length);
    }
    return shapeInBounds(kind, bounds, frame, points.length);
}

/**
 * `shape` as a shape of `kind`, drawn in the area the old one covered. Path kinds keep their path
 * where they can: a line becomes a freehand path through its two points, a freehand path becomes
 * a line between its two points farthest apart, and a box or circle becomes an open freehand path
 * along its outline (its two ends are different places, so no two slots land together).
 * Everything else fills the old shape's bounds. A new block has a cell for every slot of the
 * transitions using the shape (`minCells`, I-T4), and at least 4 × 4. The slots of the
 * transitions using the shape are spread over the new shape, so their marchers end in new places.
 */
export function convertShape(
    shape: ShapeRow,
    kind: ShapeKind,
    frame: ShapeFrame,
    minCells: number,
): ShapeRow {
    if (kind === "freehand") {
        if (shape.kind === "line")
            return {
                kind,
                geometry: { points: shape.geometry.points.map(copy) },
            };
        if (shape.kind === "box") {
            const { origin, width, height } = shape.geometry;
            return {
                kind,
                geometry: { points: boxOutline(origin, width, height) },
            };
        }
        if (shape.kind === "circle") {
            const { center, radius, start_angle, clockwise } = shape.geometry;
            const sign = clockwise ? -1 : 1;
            const points: XY[] = [];
            // Open: the last point stops one segment short of the start
            for (let i = 0; i < CIRCLE_TO_FREEHAND_SEGMENTS; i++) {
                const theta =
                    start_angle +
                    (sign * 2 * Math.PI * i) / CIRCLE_TO_FREEHAND_SEGMENTS;
                points.push([
                    center[0] + radius * Math.cos(theta),
                    center[1] + radius * Math.sin(theta),
                ]);
            }
            return { kind, geometry: { points } };
        }
    }
    if (kind === "line" && shape.kind === "freehand") {
        const pair = farthestPair(shape.geometry.points);
        if (pair)
            return {
                kind,
                geometry: { points: [copy(pair[0]), copy(pair[1])] },
            };
    }
    return shapeInBounds(
        kind,
        shapeBounds(shape),
        frame,
        Math.max(minCells, DEFAULT_BLOCK_CELLS),
    );
}

/** The geometry as it will be stored: a circle's start angle normalized (I-S1). */
function normalized(kind: ShapeKind, geometry: ShapeGeometry): ShapeGeometry {
    if (kind !== "circle") return geometry;
    const g = geometry as Extract<ShapeRow, { kind: "circle" }>["geometry"];
    return { ...g, start_angle: normalizeStartAngle(g.start_angle) };
}

const sameGeometry = (a: ShapeGeometry, b: ShapeGeometry) =>
    JSON.stringify(a) === JSON.stringify(b);

/**
 * The db-function call for one control's change, or null when it changes nothing. Values are
 * planned as given: the db-functions refuse invalid geometry (E-S1) and the database refuses a
 * change that breaks a transition using the shape (E-T3/E-T4).
 */
export function planShapeEdit(
    target: ShapeEditTarget,
    edit: ShapeEdit,
    frame: ShapeFrame,
): PlannedShapeEdit | null {
    switch (edit.kind) {
        case "rename": {
            const name = edit.name.trim() === "" ? null : edit.name.trim();
            if (name === target.name) return null;
            return { fn: "update", args: { id: target.id, name } };
        }
        case "kind": {
            if (edit.to === target.shape.kind) return null;
            const converted = convertShape(
                target.shape,
                edit.to,
                frame,
                target.minCells,
            );
            return {
                fn: "update",
                args: {
                    id: target.id,
                    kind: converted.kind,
                    geometry: converted.geometry,
                },
            };
        }
        case "geometry": {
            const kind = target.shape.kind;
            const geometry = normalized(kind, edit.geometry);
            if (sameGeometry(geometry, target.shape.geometry)) return null;
            return { fn: "update", args: { id: target.id, geometry } };
        }
        case "delete":
            return { fn: "delete", shapeId: target.id };
    }
}

/** A new shape of `kind` through `points` (see `newShapeThrough`), as a create. */
export function planNewShape(
    kind: ShapeKind,
    points: readonly XY[],
    frame: ShapeFrame,
): PlannedShapeEdit {
    const shape = newShapeThrough(kind, points, frame);
    return {
        fn: "create",
        args: { kind: shape.kind, geometry: shape.geometry },
    };
}

/**
 * Runs a planned change as one undoable edit.
 *
 * @returns the id of the shape it created, or null for an update or delete
 */
export async function applyShapeEdit(
    db: DbConnection,
    plan: PlannedShapeEdit,
): Promise<number | null> {
    switch (plan.fn) {
        case "create":
            return (await createTimelineShape({ db, newShape: plan.args })).id;
        case "update":
            await updateTimelineShape({ db, modified: plan.args });
            return null;
        case "delete":
            await deleteTimelineShape({ db, shapeId: plan.shapeId });
            return null;
    }
}

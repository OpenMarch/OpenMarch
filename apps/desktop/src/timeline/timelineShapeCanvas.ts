import { normalizeStartAngle, type ShapeRow, type XY } from "@openmarch/core";
import { create } from "zustand";
import type { ShapeEditTarget } from "./timelineShapeEditor";

/**
 * Drawing and dragging a spec shape on the canvas in timeline mode (P7.11). The shape picked in
 * the inspector's shape editor (P8.2) is drawn as an outline with handles. Dragging a handle
 * reshapes or moves the shape locally; releasing it commits one geometry edit through the same
 * editor, so the change is planned, guarded and refused exactly like a typed one.
 *
 * Everything here is pure apart from the small store the editor and the canvas share.
 */

/** What dragging a handle does. */
export type ShapeHandleRole =
    /** A line or freehand point */
    | "point"
    /** Moves the whole shape */
    | "move"
    /** A circle's point at its start angle: sets the radius and the start angle */
    | "rim"
    /** A box's origin corner; the opposite corner stays put */
    | "origin"
    /** A box's corner opposite the origin: sets the width and height */
    | "corner"
    /** A block's last cell: sets the spacing */
    | "spacing";

export interface ShapeHandle {
    /** The handle's index in `shapeHandles(shape)`; stable for a kind and point count */
    readonly id: number;
    readonly role: ShapeHandleRole;
    /** Where it sits, in field units */
    readonly at: XY;
}

/** What to draw for a shape. */
export interface ShapeOutline {
    /** The outline, in traversal order where the kind has one */
    readonly points: XY[];
    /** Whether the outline returns to its first point */
    readonly closed: boolean;
    /** A block's cells, row-major; empty for the other kinds */
    readonly cells: XY[];
}

/** Segments a circle's outline is drawn with. */
export const CIRCLE_OUTLINE_SEGMENTS = 64;

const middleOf = (points: readonly XY[]): XY => {
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
    return [(minX + maxX) / 2, (minY + maxY) / 2];
};

const blockCell = (
    g: Extract<ShapeRow, { kind: "block" }>["geometry"],
    row: number,
    col: number,
): XY => [g.origin[0] + col * g.spacing[0], g.origin[1] + row * g.spacing[1]];

/** The outline and cells to draw for `shape`. */
export function shapeOutline(shape: ShapeRow): ShapeOutline {
    switch (shape.kind) {
        case "line":
        case "freehand":
            return {
                points: shape.geometry.points.map((p): XY => [p[0], p[1]]),
                closed: false,
                cells: [],
            };
        case "circle": {
            const { center, radius, start_angle, clockwise } = shape.geometry;
            const sign = clockwise ? -1 : 1;
            const points: XY[] = [];
            for (let i = 0; i < CIRCLE_OUTLINE_SEGMENTS; i++) {
                const theta =
                    start_angle +
                    (sign * 2 * Math.PI * i) / CIRCLE_OUTLINE_SEGMENTS;
                points.push([
                    center[0] + radius * Math.cos(theta),
                    center[1] + radius * Math.sin(theta),
                ]);
            }
            return { points, closed: true, cells: [] };
        }
        case "box": {
            const { origin, width, height } = shape.geometry;
            return {
                points: [
                    [origin[0], origin[1]],
                    [origin[0] + width, origin[1]],
                    [origin[0] + width, origin[1] + height],
                    [origin[0], origin[1] + height],
                ],
                closed: true,
                cells: [],
            };
        }
        case "block": {
            const g = shape.geometry;
            const cells: XY[] = [];
            for (let row = 0; row < g.rows; row++)
                for (let col = 0; col < g.cols; col++)
                    cells.push(blockCell(g, row, col));
            const last = blockCell(g, g.rows - 1, g.cols - 1);
            return {
                points: [
                    [g.origin[0], g.origin[1]],
                    [last[0], g.origin[1]],
                    [last[0], last[1]],
                    [g.origin[0], last[1]],
                ],
                closed: true,
                cells,
            };
        }
    }
}

/**
 * The handles to draw on `shape`, in a fixed order per kind:
 *
 * - line and freehand: one per point, then a move handle at the middle of their bounds;
 * - circle: a move handle at the center, then a rim handle at the start angle;
 * - box: the origin corner, the opposite corner, then a move handle at the middle;
 * - block: a move handle at the origin, then a spacing handle on the last cell when the block has
 *   more than one row or column.
 */
export function shapeHandles(shape: ShapeRow): ShapeHandle[] {
    const handles: Omit<ShapeHandle, "id">[] = [];
    switch (shape.kind) {
        case "line":
        case "freehand":
            for (const p of shape.geometry.points)
                handles.push({ role: "point", at: [p[0], p[1]] });
            handles.push({
                role: "move",
                at: middleOf(shape.geometry.points),
            });
            break;
        case "circle": {
            const { center, radius, start_angle } = shape.geometry;
            handles.push({ role: "move", at: [center[0], center[1]] });
            handles.push({
                role: "rim",
                at: [
                    center[0] + radius * Math.cos(start_angle),
                    center[1] + radius * Math.sin(start_angle),
                ],
            });
            break;
        }
        case "box": {
            const { origin, width, height } = shape.geometry;
            handles.push({ role: "origin", at: [origin[0], origin[1]] });
            handles.push({
                role: "corner",
                at: [origin[0] + width, origin[1] + height],
            });
            handles.push({
                role: "move",
                at: [origin[0] + width / 2, origin[1] + height / 2],
            });
            break;
        }
        case "block": {
            const g = shape.geometry;
            handles.push({ role: "move", at: [g.origin[0], g.origin[1]] });
            if (g.rows > 1 || g.cols > 1)
                handles.push({
                    role: "spacing",
                    at: blockCell(g, g.rows - 1, g.cols - 1),
                });
            break;
        }
    }
    return handles.map((h, id) => ({ ...h, id }));
}

/** `shape` moved by `delta`, every point the same distance. */
export function translateShape(shape: ShapeRow, delta: XY): ShapeRow {
    const [dx, dy] = delta;
    const by = (p: XY): XY => [p[0] + dx, p[1] + dy];
    switch (shape.kind) {
        case "line":
        case "freehand":
            return {
                kind: shape.kind,
                geometry: { points: shape.geometry.points.map(by) },
            };
        case "circle":
            return {
                kind: "circle",
                geometry: {
                    ...shape.geometry,
                    center: by(shape.geometry.center),
                },
            };
        case "box":
            return {
                kind: "box",
                geometry: {
                    ...shape.geometry,
                    origin: by(shape.geometry.origin),
                },
            };
        case "block":
            return {
                kind: "block",
                geometry: {
                    ...shape.geometry,
                    origin: by(shape.geometry.origin),
                },
            };
    }
}

/**
 * `shape` after dragging handle `handleId` of `shapeHandles(shape)` to `to`. The result isn't
 * validated: a drag that leaves a shape invalid (a box turned inside out, a line with both ends
 * together) is refused when it is committed (E-S1). An unknown handle changes nothing.
 */
export function dragHandle(
    shape: ShapeRow,
    handleId: number,
    to: XY,
): ShapeRow {
    const handle = shapeHandles(shape)[handleId];
    if (!handle) return shape;
    const target: XY = [to[0], to[1]];
    if (handle.role === "move")
        return translateShape(shape, [
            target[0] - handle.at[0],
            target[1] - handle.at[1],
        ]);
    switch (shape.kind) {
        case "line":
        case "freehand":
            return {
                kind: shape.kind,
                geometry: {
                    points: shape.geometry.points.map((p, i) =>
                        i === handleId ? target : [p[0], p[1]],
                    ),
                },
            };
        case "circle": {
            const { center } = shape.geometry;
            const dx = target[0] - center[0];
            const dy = target[1] - center[1];
            const radius = Math.hypot(dx, dy);
            return {
                kind: "circle",
                geometry: {
                    ...shape.geometry,
                    radius,
                    // A rim dropped on the center keeps its angle; the zero radius is refused
                    start_angle:
                        radius > 0
                            ? normalizeStartAngle(Math.atan2(dy, dx))
                            : shape.geometry.start_angle,
                },
            };
        }
        case "box":
            return dragBoxCorner(shape.geometry, handle.role, target);
        case "block":
            return dragBlockSpacing(shape.geometry, target);
    }
}

/** A box with its origin (`role` "origin") or far corner moved to `target`; the other stays. */
function dragBoxCorner(
    { origin, width, height }: Extract<ShapeRow, { kind: "box" }>["geometry"],
    role: ShapeHandleRole,
    target: XY,
): ShapeRow {
    if (role === "origin")
        return {
            kind: "box",
            geometry: {
                origin: target,
                width: origin[0] + width - target[0],
                height: origin[1] + height - target[1],
            },
        };
    return {
        kind: "box",
        geometry: {
            origin: [origin[0], origin[1]],
            width: target[0] - origin[0],
            height: target[1] - origin[1],
        },
    };
}

/** A block whose last cell is at `target`: its spacing, along each side with more than one cell. */
function dragBlockSpacing(
    g: Extract<ShapeRow, { kind: "block" }>["geometry"],
    target: XY,
): ShapeRow {
    return {
        kind: "block",
        geometry: {
            ...g,
            spacing: [
                g.cols > 1
                    ? (target[0] - g.origin[0]) / (g.cols - 1)
                    : g.spacing[0],
                g.rows > 1
                    ? (target[1] - g.origin[1]) / (g.rows - 1)
                    : g.spacing[1],
            ],
        },
    };
}

// ---------------------------------------------------------------------------
// The editor's link to the canvas
// ---------------------------------------------------------------------------

/**
 * What became of a drag's commit:
 *
 * - `started`: an edit is being planned and written;
 * - `unchanged`: the dragged shape is the stored one (or another kind), so nothing was written;
 * - `busy`: another edit was pending, so the drag was dropped (the editor says so).
 */
export type ShapeCommitResult = "started" | "unchanged" | "busy";

export interface TimelineShapeCanvasState {
    /** The shape picked in the inspector's shape editor, as the editor shows it; null for none */
    target: ShapeEditTarget | null;
    /**
     * True while the editor is planning or writing an edit, or waiting for shapes read after it.
     * The canvas keeps what it drew and takes no drags until it is false again.
     */
    pending: boolean;
    /**
     * Commits a new geometry for `target` as one edit, through the editor (its stale-plan guard,
     * one `transactionWithHistory`, refusals through `toastTimelineError`). Null with no target.
     * Says whether an edit started; when it didn't, nothing was saved and the canvas puts the
     * shape back as the editor has it.
     */
    commit: ((shape: ShapeRow) => ShapeCommitResult) | null;
    set: (
        state: Pick<TimelineShapeCanvasState, "target" | "pending" | "commit">,
    ) => void;
}

/** The shape the inspector's editor has picked, for the canvas to draw. */
export const useTimelineShapeCanvasStore = create<TimelineShapeCanvasState>(
    (set) => ({
        target: null,
        pending: false,
        commit: null,
        set: (state) => set(state),
    }),
);

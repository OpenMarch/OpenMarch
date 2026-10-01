import { fabric } from "fabric";
import { FieldProperties, type ShapeRow, type XY } from "@openmarch/core";
import { NoControls } from "@/components/canvas/CanvasConstants";
import {
    dragHandle,
    shapeHandles,
    shapeOutline,
    type ShapeHandle,
} from "@/timeline/timelineShapeCanvas";

/** The colors the overlay draws with, as CSS colors. */
export interface TimelineShapeOverlayColors {
    /** The outline, the cells and the handles' rims */
    shape: string;
    /** The handles' fill */
    handleFill: string;
}

/**
 * A press shorter than both of these is a click, not a drag, so it commits nothing. The canvas
 * uses the same numbers for marchers (`OpenMarchCanvas.DRAG_TIMER_MILLISECONDS` and
 * `DISTANCE_THRESHOLD`).
 */
export interface DragThreshold {
    milliseconds: number;
    /** Screen pixels between the press and the release */
    distance: number;
}

export const DEFAULT_DRAG_THRESHOLD: DragThreshold = {
    milliseconds: 300,
    distance: 20,
};

const HANDLE_RADIUS = 6;
const MOVE_HANDLE_SIZE = 12;
const CELL_RADIUS = 3;

/** A handle on the canvas, and which of `shapeHandles` it is. */
export type TimelineShapeHandleObject = fabric.Object & {
    timelineShapeHandle: ShapeHandle;
};

/**
 * Whether `object` is a handle of a `TimelineShapeOverlay`. The canvas's selection listeners treat
 * handles as transparent: pressing one must start its drag, not change which marchers are
 * selected, and a rubber-band selection must not pick one up.
 */
export function isTimelineShapeHandle(
    object: unknown,
): object is TimelineShapeHandleObject {
    return (
        typeof object === "object" &&
        object !== null &&
        "timelineShapeHandle" in object
    );
}

interface DragState {
    handle: TimelineShapeHandleObject;
    time: number;
    x: number;
    y: number;
    cancelled: boolean;
}

const mouseOf = (options: unknown): MouseEvent | null => {
    const e = (options as { e?: unknown } | undefined)?.e;
    return e && typeof (e as MouseEvent).clientX === "number"
        ? (e as MouseEvent)
        : null;
};

/**
 * A spec shape drawn on the canvas in timeline mode (P7.11): its outline (a block's cells too)
 * and, when interactive, a handle for each of `shapeHandles`. Dragging a handle redraws the shape
 * locally on every mouse move and writes nothing; releasing it calls `onCommit` once with the new
 * shape. A press shorter than the drag threshold, or a drag cancelled with Escape, puts the shape
 * back and commits nothing. Page mode never creates one; its shapes are `MarcherShape`s.
 *
 * Move handles are drawn above the others, so a shape whose handles land on one spot (a block
 * with no spacing, a freehand point at the middle of its bounds) can always be moved.
 *
 * Coordinates are field units. Like the marcher dots and the timeline paths, everything is offset
 * by half a grid line, so the outline runs through the dots it places.
 */
export default class TimelineShapeOverlay {
    static readonly gridOffset = FieldProperties.GRID_STROKE_WIDTH / 2;

    private outline: fabric.Polyline | null = null;
    private cells: fabric.Circle[] = [];
    /** In `shapeHandles` order */
    private handles: TimelineShapeHandleObject[] = [];
    /** The shape as drawn when the drag started; drags are planned from it */
    private base: ShapeRow | null = null;
    /** The shape as drawn now, during a drag */
    private preview: ShapeRow | null = null;
    private interactive = false;
    private drag: DragState | null = null;

    constructor(
        private readonly canvas: fabric.Canvas,
        private colors: TimelineShapeOverlayColors,
        private readonly onCommit: (shape: ShapeRow) => void,
        private readonly threshold: DragThreshold = DEFAULT_DRAG_THRESHOLD,
    ) {}

    /** The shape as drawn now (the dragged one during a drag), or null when nothing is drawn. */
    get shown(): ShapeRow | null {
        return this.preview;
    }

    /** The handles on the canvas, in `shapeHandles` order. */
    get handleObjects(): readonly TimelineShapeHandleObject[] {
        return this.handles;
    }

    /** Draws `shape`, replacing whatever was drawn. Handles are drawn only when `interactive`. */
    show(shape: ShapeRow, interactive: boolean): void {
        this.clear();
        this.base = shape;
        this.preview = shape;
        this.interactive = interactive;
        const outline = shapeOutline(shape);
        this.outline = new fabric.Polyline(
            this.toCanvasPoints(outline.points, outline.closed),
            {
                stroke: this.colors.shape,
                strokeWidth: 2,
                fill: "",
                objectCaching: false,
                ...NoControls,
            },
        );
        this.canvas.add(this.outline);
        for (const cell of outline.cells) {
            const dot = new fabric.Circle({
                radius: CELL_RADIUS,
                fill: this.colors.shape,
                originX: "center",
                originY: "center",
                left: cell[0] + TimelineShapeOverlay.gridOffset,
                top: cell[1] + TimelineShapeOverlay.gridOffset,
                ...NoControls,
            });
            this.cells.push(dot);
            this.canvas.add(dot);
        }
        if (interactive) {
            this.handles = shapeHandles(shape).map((h) => this.makeHandle(h));
            for (const handle of this.inZOrder()) this.canvas.add(handle);
        }
        this.bringToFront();
        this.canvas.requestRenderAll();
    }

    /** New colors (the field theme changed); redraws what is drawn. */
    setColors(colors: TimelineShapeOverlayColors): void {
        this.colors = colors;
        if (this.base && !this.drag) this.show(this.base, this.interactive);
    }

    /**
     * Lets the handles be dragged, or not (while an edit is pending). A drag already under way
     * keeps going, so its release still reaches `onCommit`, which can refuse it.
     */
    setInteractive(interactive: boolean): void {
        this.interactive = interactive;
        for (const handle of this.handles)
            handle.set({ selectable: interactive, evented: interactive });
        this.canvas.requestRenderAll();
    }

    /** Puts the handles above everything else, move handles last, so marchers can't take a drag. */
    bringToFront(): void {
        this.outline?.bringToFront();
        for (const handle of this.inZOrder()) handle.bringToFront();
    }

    /** Removes everything this overlay drew. */
    clear(): void {
        this.endDrag();
        const active = this.canvas.getActiveObject();
        if (active && (this.handles as fabric.Object[]).includes(active))
            this.canvas.discardActiveObject();
        if (this.outline) this.canvas.remove(this.outline);
        for (const cell of this.cells) this.canvas.remove(cell);
        for (const handle of this.handles) this.canvas.remove(handle);
        this.outline = null;
        this.cells = [];
        this.handles = [];
        this.base = null;
        this.preview = null;
        this.canvas.requestRenderAll();
    }

    /** Point handles first, then move handles, which win where handles overlap. */
    private inZOrder(): TimelineShapeHandleObject[] {
        return [
            ...this.handles.filter(
                (h) => h.timelineShapeHandle.role !== "move",
            ),
            ...this.handles.filter(
                (h) => h.timelineShapeHandle.role === "move",
            ),
        ];
    }

    private makeHandle(handle: ShapeHandle): TimelineShapeHandleObject {
        const common = {
            left: handle.at[0] + TimelineShapeOverlay.gridOffset,
            top: handle.at[1] + TimelineShapeOverlay.gridOffset,
            originX: "center",
            originY: "center",
            fill: this.colors.handleFill,
            stroke: this.colors.shape,
            strokeWidth: 3,
            hasControls: false,
            hasBorders: false,
            hoverCursor: handle.role === "move" ? "move" : "pointer",
        } as const;
        const object = (
            handle.role === "move"
                ? new fabric.Rect({
                      ...common,
                      width: MOVE_HANDLE_SIZE,
                      height: MOVE_HANDLE_SIZE,
                  })
                : new fabric.Circle({ ...common, radius: HANDLE_RADIUS })
        ) as TimelineShapeHandleObject;
        object.timelineShapeHandle = handle;
        object.on("mousedown", (options) => this.startDrag(object, options));
        object.on("moving", () => this.handleMoving(object));
        object.on("modified", (options) =>
            this.handleModified(object, options),
        );
        object.on("mouseup", () => this.endDrag());
        return object;
    }

    private readonly onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || !this.drag || !this.base) return;
        this.drag.cancelled = true;
        this.preview = this.base;
        this.layout(this.base, null);
    };

    private startDrag(handle: TimelineShapeHandleObject, options: unknown) {
        this.endDrag();
        const e = mouseOf(options);
        this.drag = {
            handle,
            time: Date.now(),
            x: e?.clientX ?? 0,
            y: e?.clientY ?? 0,
            cancelled: false,
        };
        window.addEventListener("keydown", this.onKeyDown);
    }

    private endDrag() {
        if (!this.drag) return;
        this.drag = null;
        window.removeEventListener("keydown", this.onKeyDown);
    }

    /** Where a handle object sits, in field units. */
    private fieldPointOf(object: fabric.Object): XY {
        return [
            (object.left ?? 0) - TimelineShapeOverlay.gridOffset,
            (object.top ?? 0) - TimelineShapeOverlay.gridOffset,
        ];
    }

    private handleMoving(object: TimelineShapeHandleObject): void {
        if (!this.base) return;
        if (this.drag?.cancelled) {
            // Cancelled with Escape: the handle stays where the shape has it
            this.layout(this.base, null);
            return;
        }
        this.preview = dragHandle(
            this.base,
            object.timelineShapeHandle.id,
            this.fieldPointOf(object),
        );
        this.layout(this.preview, object);
    }

    /** Whether the release ends a press too short and too small to be a drag. */
    private isClick(options: unknown): boolean {
        const drag = this.drag;
        const e = mouseOf(options);
        if (!drag || !e) return false;
        return (
            Date.now() - drag.time < this.threshold.milliseconds &&
            Math.hypot(e.clientX - drag.x, e.clientY - drag.y) <
                this.threshold.distance
        );
    }

    private handleModified(
        object: TimelineShapeHandleObject,
        options: unknown,
    ): void {
        if (!this.base) return;
        if (this.drag?.cancelled || this.isClick(options)) {
            this.preview = this.base;
            this.layout(this.base, null);
            this.endDrag();
            return;
        }
        this.endDrag();
        const shape = dragHandle(
            this.base,
            object.timelineShapeHandle.id,
            this.fieldPointOf(object),
        );
        this.preview = shape;
        // Later drags (before the edit comes back) start from what is drawn
        this.base = shape;
        this.layout(shape, null);
        this.onCommit(shape);
    }

    /** Moves the outline, cells and handles (except `dragging`) to `shape`. */
    private layout(shape: ShapeRow, dragging: fabric.Object | null): void {
        const outline = shapeOutline(shape);
        if (this.outline) {
            this.outline.points = this.toCanvasPoints(
                outline.points,
                outline.closed,
            );
            // fabric 5 keeps left/top/pathOffset from construction; recompute them for new points
            (
                this.outline as unknown as {
                    _setPositionDimensions: (options: object) => void;
                }
            )._setPositionDimensions({});
            this.outline.dirty = true;
            this.outline.setCoords();
        }
        outline.cells.forEach((cell, i) => {
            const dot = this.cells[i];
            if (!dot) return;
            dot.set({
                left: cell[0] + TimelineShapeOverlay.gridOffset,
                top: cell[1] + TimelineShapeOverlay.gridOffset,
            });
            dot.setCoords();
        });
        const handles = shapeHandles(shape);
        this.handles.forEach((object, i) => {
            const handle = handles[i];
            if (!handle) return;
            object.timelineShapeHandle = handle;
            if (object === dragging) return;
            object.set({
                left: handle.at[0] + TimelineShapeOverlay.gridOffset,
                top: handle.at[1] + TimelineShapeOverlay.gridOffset,
            });
            object.setCoords();
        });
        this.canvas.requestRenderAll();
    }

    private toCanvasPoints(points: readonly XY[], closed: boolean) {
        const offset = TimelineShapeOverlay.gridOffset;
        const out = points.map(
            (p) => new fabric.Point(p[0] + offset, p[1] + offset),
        );
        if (closed && out.length > 0) out.push(out[0]!);
        if (out.length === 1) out.push(out[0]!);
        return out;
    }
}

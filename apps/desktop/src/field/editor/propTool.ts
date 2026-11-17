import type { OutlineType } from "@/db-functions/items";
import {
    ITEM_OUTLINES,
    placeOutline,
    type DrawnOutline,
    type OutlinePath,
} from "@/items/itemOutlines";
import type { FieldPoint, FieldPointer } from "./fieldEditor";

/**
 * The prop tool (C2.1, from PR 1013's prop drawing): draws a new prop's
 * Outline on the field. A rectangle or circle is a drag, from a corner or
 * the center, and finishes on release. An arc is three clicks (its ends,
 * then its bulge), and a polygon a click per corner, finished with a
 * double-click once it has three (or its Finish button, tablet 1.4).
 * Freehand is a drag, finished on release. A press lost before its release
 * (a second finger landed to move the view) draws nothing: a drag is
 * dropped, and a click's corner taken back.
 * Points snap as a marcher's coordinates do, except freehand's. A drawing
 * too small to be meant is dropped and the tool stays on; a finished one goes
 * to the app, which makes the prop and turns the tool off.
 *
 * With a stamp it places a fixed footprint instead (front ensemble equipment, whose size is its
 * model's): the footprint follows the pointer, centered and snapped, turned as the stamp says for
 * that spot, with a notch in the edge built toward the audience so a turn shows, and a click
 * places it.
 * Nothing keeps it on the field: equipment can stand past either sideline.
 */

/** A fixed footprint to place with a click, in field units. */
export type PropToolStamp = {
    readonly widthPixels: number;
    readonly depthPixels: number;
    /** Its turn, in degrees clockwise on screen, centered at `center`; 0 when absent */
    readonly rotationAt?: (center: FieldPoint) => number;
};

/** What the overlay draws for the prop tool, and what the field test API reads. */
export type PropToolShape = {
    readonly outlineType: OutlineType;
    /** The Outline being drawn, or null before there's enough of it. */
    readonly preview: OutlinePath | null;
    /** Corners clicked so far (a polygon's or an arc's); 0 for a drag. */
    readonly points: number;
    /** Whether {@link PropTool.finishNow} would finish it: a polygon with enough corners. */
    readonly canFinish: boolean;
};

export type PropToolPorts = {
    /** A point snapped as a marcher's coordinates are. */
    snap(point: FieldPoint): FieldPoint;
    /** An Outline was finished: for the app to make the prop. */
    finished(outline: DrawnOutline): void;
    /** The shape changed. */
    changed(): void;
    /** Whether a press is the second of a double-click. */
    isDoubleClick(pointer: FieldPointer): boolean;
};

export class PropTool {
    private readonly handler;
    private start: FieldPoint | null = null;
    private points: FieldPoint[] = [];
    private current: FieldPoint | null = null;
    /** A drag or freehand line is being drawn with the button down. */
    private dragging = false;
    /** A click's press, until its release: the corners before it, should it be lost. */
    private clickHeld: FieldPoint[] | null = null;
    private snapshot: PropToolShape;

    constructor(
        readonly outlineType: OutlineType,
        private readonly ports: PropToolPorts,
        private readonly stamp: PropToolStamp | null = null,
    ) {
        this.handler = ITEM_OUTLINES[outlineType];
        this.snapshot = {
            outlineType,
            preview: null,
            points: 0,
            canFinish: false,
        };
    }

    press(pointer: FieldPointer) {
        if (this.stamp) {
            this.place(this.stamp, this.ports.snap(pointer.field));
            return;
        }
        const { interaction } = this.handler;
        if (interaction === "click") {
            this.click(pointer);
            return;
        }
        const point =
            interaction === "freehand"
                ? pointer.field
                : this.ports.snap(pointer.field);
        this.start = point;
        this.points = [point];
        this.current = point;
        this.dragging = true;
        this.update();
    }

    move(pointer: FieldPointer) {
        if (this.stamp) {
            const center = this.ports.snap(pointer.field);
            this.snapshot = {
                outlineType: this.outlineType,
                preview: {
                    points: stampOutline(
                        this.stamp,
                        center,
                        this.stamp.rotationAt?.(center) ?? 0,
                    ),
                    closed: true,
                },
                points: 0,
                canFinish: false,
            };
            this.ports.changed();
            return;
        }
        const { interaction } = this.handler;
        if (interaction === "freehand") {
            if (!this.dragging) return;
            this.points.push(pointer.field);
            this.current = pointer.field;
        } else {
            if (interaction === "drag" && !this.dragging) return;
            if (interaction === "click" && this.points.length === 0) return;
            this.current = this.ports.snap(pointer.field);
        }
        this.update();
    }

    release(pointer: FieldPointer) {
        this.clickHeld = null;
        if (!this.dragging) return;
        this.dragging = false;
        if (this.handler.interaction === "drag")
            this.finish(this.ports.snap(pointer.field));
        else this.finish();
    }

    shape(): PropToolShape {
        return this.snapshot;
    }

    /** The press was lost before its release: what it drew is dropped. */
    cancel() {
        if (this.dragging) {
            this.dragging = false;
            this.start = null;
            this.points = [];
            this.current = null;
            this.update();
            return;
        }
        const before = this.clickHeld;
        this.clickHeld = null;
        if (!before) return;
        this.points = before;
        this.current = before.at(-1) ?? null;
        this.update();
    }

    /** Finishes a polygon now, as its double-click does. Returns whether it could. */
    finishNow(): boolean {
        if (!this.canFinish() || this.clickHeld) return false;
        this.finish();
        return true;
    }

    /** Takes back the last corner clicked. Returns whether there was one. */
    removeLastPoint(): boolean {
        if (this.handler.interaction !== "click" || this.clickHeld)
            return false;
        if (this.points.length === 0) return false;
        this.points = this.points.slice(0, -1);
        this.current = this.points.at(-1) ?? null;
        this.update();
        return true;
    }

    private canFinish(): boolean {
        const {
            interaction,
            completeOnDoubleClick,
            minPoints = 0,
        } = this.handler;
        return (
            interaction === "click" &&
            completeOnDoubleClick === true &&
            this.points.length >= Math.max(minPoints, 1)
        );
    }

    private click(pointer: FieldPointer) {
        const {
            maxPoints,
            minPoints = 0,
            completeOnDoubleClick,
        } = this.handler;
        if (
            completeOnDoubleClick &&
            this.points.length > 0 &&
            this.ports.isDoubleClick(pointer)
        ) {
            // Its first click already placed the last corner
            if (this.points.length >= minPoints) this.finish();
            return;
        }
        const point = this.ports.snap(pointer.field);
        this.clickHeld = [...this.points];
        this.points.push(point);
        this.current = point;
        if (maxPoints && this.points.length === maxPoints) this.finish();
        else this.update();
    }

    private place(stamp: PropToolStamp, center: FieldPoint) {
        this.snapshot = {
            outlineType: this.outlineType,
            preview: null,
            points: 0,
            canFinish: false,
        };
        this.ports.changed();
        this.ports.finished({
            outlineType: this.outlineType,
            centerX: center.x,
            centerY: center.y,
            widthPixels: stamp.widthPixels,
            depthPixels: stamp.depthPixels,
            rotation: stamp.rotationAt?.(center) ?? 0,
        });
    }

    private finish(endPoint?: FieldPoint) {
        const outline = this.handler.finalize({
            startPoint: this.start,
            points: this.points,
            endPoint,
        });
        this.start = null;
        this.points = [];
        this.current = null;
        this.clickHeld = null;
        this.update();
        if (outline) this.ports.finished(outline);
    }

    private update() {
        const preview = this.current
            ? this.handler.preview({
                  startPoint: this.start,
                  points: this.points,
                  currentPoint: this.current,
              })
            : null;
        this.snapshot = {
            outlineType: this.outlineType,
            preview,
            points:
                this.handler.interaction === "click" ? this.points.length : 0,
            canFinish: this.canFinish(),
        };
        this.ports.changed();
    }
}

/**
 * A stamp's outline: its footprint with a notch in the middle of the edge its model has toward the
 * audience as built (+y, before turning), turned `degrees` clockwise on screen around `center`.
 */
function stampOutline(
    stamp: PropToolStamp,
    center: FieldPoint,
    degrees: number,
): FieldPoint[] {
    const halfWidth = stamp.widthPixels / 2;
    const halfDepth = stamp.depthPixels / 2;
    const notch = Math.min(stamp.widthPixels, stamp.depthPixels) * 0.2;
    const shape = [
        { x: -halfWidth, y: -halfDepth },
        { x: halfWidth, y: -halfDepth },
        { x: halfWidth, y: halfDepth },
        { x: notch, y: halfDepth },
        { x: 0, y: halfDepth - notch },
        { x: -notch, y: halfDepth },
        { x: -halfWidth, y: halfDepth },
    ];
    return placeOutline({ points: shape, closed: true }, center, degrees);
}

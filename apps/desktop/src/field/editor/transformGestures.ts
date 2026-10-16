import type { FieldTestGesture } from "@/field/fieldTestApi";
import type { FieldGesture, FieldPoint, FieldPointer } from "./fieldEditor";
import {
    centerOf,
    rotatePositions,
    scaleFor,
    scalePositions,
    snapRotation,
    turnBetween,
    type HandleId,
} from "./groupTransform";
import type { MarcherPosition, MoveGestureHost } from "./moveGesture";
import { PRECISION_START, anchorAt, precisionDelta } from "./moveRules";
import type { FieldRect } from "./selectionArea";

/**
 * Dragging a handle of the selection box (#198): the marchers scale or
 * rotate from where they were at the press, and are dropped where they're
 * drawn at the release, through the same host as a move (#196): live
 * positions, the drop and its pending save, snap-back, one undo step.
 *
 * Lock X and Lock Y don't apply to handles (rules table: Lock X / Lock Y).
 * While Alt is down the pointer counts at a quarter of its speed, with
 * snapping off (`precisionDelta`, #197).
 */
abstract class HandleGesture implements FieldGesture {
    abstract readonly kind: FieldTestGesture;
    protected track = PRECISION_START;
    /** The last positions shown, and where the pointer was for them. */
    private shown: { at: FieldPoint; positions: MarcherPosition[] } | null =
        null;

    constructor(
        protected readonly origin: FieldPointer,
        protected readonly starts: readonly MarcherPosition[],
        private readonly host: MoveGestureHost,
    ) {}

    move(pointer: FieldPointer): void {
        const positions = this.positionsAt(pointer);
        this.shown = { at: pointer.field, positions };
        this.host.show(positions);
    }

    /**
     * Drops the marchers. As a move does: a release where the last move left
     * the pointer drops them where they're drawn, whatever keys changed since.
     */
    end(pointer: FieldPointer): void {
        const still =
            this.shown !== null &&
            this.shown.at.x === pointer.field.x &&
            this.shown.at.y === pointer.field.y;
        this.host.drop(
            still ? this.shown!.positions : this.positionsAt(pointer),
        );
    }

    cancel(): void {
        this.host.cancel();
    }

    /** Where the marchers go for this pointer event. */
    protected abstract positionsAt(pointer: FieldPointer): MarcherPosition[];
}

/** A corner or middle handle: scales the selection from the opposite side. */
export class ScaleGesture extends HandleGesture {
    readonly kind: FieldTestGesture = "scale";

    constructor(
        origin: FieldPointer,
        starts: readonly MarcherPosition[],
        host: MoveGestureHost,
        private readonly handle: Exclude<HandleId, "rot">,
        /** The marchers' bounds at the press. */
        private readonly box: FieldRect,
    ) {
        super(origin, starts, host);
    }

    protected positionsAt(pointer: FieldPointer) {
        // Nothing snaps, so Alt needs no re-anchoring: the slow drag goes on
        // from wherever the pointer had taken the marchers
        const moved = precisionDelta(
            this.track,
            {
                x: pointer.field.x - this.origin.field.x,
                y: pointer.field.y - this.origin.field.y,
            },
            pointer.alt,
        );
        this.track = moved.track;
        return scalePositions(
            this.starts,
            scaleFor(this.handle, this.box, moved.delta, pointer.shift),
        );
    }
}

/**
 * The rotate handle: turns the selection about its box's center by the angle
 * the pointer turns through, snapped to 15° unless Shift or Alt is down.
 * Pressing Alt goes on slowly from the angle drawn (snapped), with no jump.
 */
export class RotateGesture extends HandleGesture {
    readonly kind: FieldTestGesture = "rotate";
    readonly center: FieldPoint;
    /** The angle the pointer has turned through, at full speed. */
    private turned = 0;
    private last: FieldPoint;
    private alt: boolean;
    /** The angle drawn at the last event, in degrees. */
    private drawn = 0;

    constructor(
        origin: FieldPointer,
        starts: readonly MarcherPosition[],
        host: MoveGestureHost,
        /** The marchers' bounds at the press. */
        readonly box: FieldRect,
    ) {
        super(origin, starts, host);
        this.center = centerOf(box);
        this.last = origin.field;
        this.alt = origin.alt;
    }

    /** The angle drawn, in degrees clockwise: the overlay turns the box by it until the release. */
    angle(): number {
        return this.drawn;
    }

    protected positionsAt(pointer: FieldPointer) {
        this.turned += turnBetween(this.center, this.last, pointer.field);
        this.last = pointer.field;
        if (pointer.alt && !this.alt)
            this.track = anchorAt(this.track, { x: this.drawn, y: 0 });
        this.alt = pointer.alt;
        const moved = precisionDelta(
            this.track,
            { x: this.turned, y: 0 },
            pointer.alt,
        );
        this.track = moved.track;
        this.drawn = snapRotation(moved.delta.x, pointer.shift || pointer.alt);
        return rotatePositions(this.starts, this.center, this.drawn);
    }
}

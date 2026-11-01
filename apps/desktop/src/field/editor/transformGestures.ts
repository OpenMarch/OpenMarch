import type { FieldTestGesture } from "@/field/fieldTestApi";
import type { HonoredRoles } from "@/input/gestureChipStore";
import type { Roles } from "@/input/modifierRoles";
import type { FieldGesture, FieldPoint, FieldPointer } from "./fieldEditor";
import { FieldDrag, type FieldKeys } from "./fieldKeys";
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
import { PRECISION_START, precisionDelta } from "./moveRules";
import type { FieldRect } from "./selectionArea";

/**
 * Dragging a handle of the selection box (#198): the marchers scale or
 * rotate from where they were at the press, and are dropped where they're
 * drawn at the release, through the same host as a move (#196): live
 * positions, the drop and its pending save, snap-back, one undo step.
 *
 * Lock X and Lock Y don't apply to handles (rules table: Lock X / Lock Y).
 * While fine is on a scale handle counts the pointer at a quarter of its
 * speed (`precisionDelta`, #197); a rotation turns at full speed in whole
 * degrees. Alt (from center) scales about the box's center. As in a move, a
 * role key pressed or released mid-drag redraws the marchers at the last
 * pointer. Each handle declares the roles it reads, for the chip.
 */
abstract class HandleGesture implements FieldGesture {
    abstract readonly kind: FieldTestGesture;
    private readonly drag: FieldDrag<MarcherPosition[]>;

    constructor(
        protected readonly origin: FieldPointer,
        protected readonly starts: readonly MarcherPosition[],
        private readonly host: MoveGestureHost,
        keys: FieldKeys,
        honored: HonoredRoles,
    ) {
        this.drag = new FieldDrag(
            keys,
            (at, roles) => this.positionsAt(at, roles),
            (positions) => host.show(positions),
            honored,
        );
    }

    move(pointer: FieldPointer): void {
        this.drag.move(pointer);
    }

    /**
     * Drops the marchers. As a move does: a release where the last move left
     * the pointer drops them where they're drawn, whatever keys changed since.
     */
    end(pointer: FieldPointer): void {
        this.host.drop(this.drag.end(pointer));
    }

    cancel(): void {
        this.drag.cancel();
        this.host.cancel();
    }

    /** Where the marchers go for the pointer at `at`, with these roles held. */
    protected abstract positionsAt(
        at: FieldPoint,
        roles: Roles,
    ): MarcherPosition[];
}

/**
 * A corner scales each axis with the pointer and a middle handle scales one axis, and constrain
 * keeps the ratio; with the box shape's ratio lock on they keep it, and constrain frees it (a box's
 * corner gives equal spacings instead). Either scales from the center with from center. Nothing
 * snaps.
 */
const scaleHonors = (ratioLocked: boolean): HonoredRoles => ({
    context: "field",
    fine: "fine",
    constrain: ratioLocked ? "freeRatio" : "keepRatio",
    fromCenter: "fromCenter",
    snaps: false,
});

/** A rotate handle reads fine (whole degrees, at full speed) and snaps to 15°; constrain does nothing */
export const ROTATE_HONORS: HonoredRoles = {
    context: "field",
    fine: "wholeDegrees",
    snaps: true,
};

/** A corner or middle handle: scales the selection from the opposite side, or from its center. */
export class ScaleGesture extends HandleGesture {
    readonly kind: FieldTestGesture = "scale";
    private track = PRECISION_START;

    constructor(
        origin: FieldPointer,
        starts: readonly MarcherPosition[],
        host: MoveGestureHost,
        private readonly handle: Exclude<HandleId, "rot">,
        /** The marchers' bounds at the press. */
        private readonly box: FieldRect,
        keys: FieldKeys,
        /** The ratio lock a box shape shares, at the press: on, keeping the ratio is the default. */
        private readonly ratioLocked = false,
    ) {
        super(origin, starts, host, keys, scaleHonors(ratioLocked));
    }

    protected positionsAt(at: FieldPoint, roles: Roles) {
        // Nothing snaps, so fine needs no re-anchoring: the slow drag goes on
        // from wherever the pointer had taken the marchers
        const moved = precisionDelta(
            this.track,
            { x: at.x - this.origin.field.x, y: at.y - this.origin.field.y },
            roles.fine,
        );
        this.track = moved.track;
        // Constrain flips the ratio lock for the drag, as on a box shape: one idea, not two
        return scalePositions(
            this.starts,
            scaleFor(
                this.handle,
                this.box,
                moved.delta,
                this.ratioLocked !== roles.constrain,
                roles.fromCenter,
            ),
        );
    }
}

/**
 * The angle a rotate handle draws as the pointer turns about `center`,
 * snapped to 15°, or with fine to whole degrees, at full speed either way
 * (owner, 2026-10-30: nobody needs finer than a degree); free with the Snap
 * toggle off. Fine on or off redraws the angle the pointer has turned, so
 * it never jumps. The selection's and an item's rotate handles both turn
 * by it.
 */
export class RotationDrag {
    /** The angle the pointer has turned through. */
    private turned = 0;
    /** The angle drawn at the last event, in degrees clockwise. */
    private drawn = 0;

    constructor(
        private readonly center: FieldPoint,
        /** Where the pointer was at the press. */
        private last: FieldPoint,
        /** The Snap toggle, read on every event; on when omitted. */
        private readonly snap: () => boolean = () => true,
    ) {}

    /** The angle drawn, in degrees clockwise. */
    angle(): number {
        return this.drawn;
    }

    /** The angle drawn for the pointer at `at`, with these roles held. */
    turnTo(at: FieldPoint, roles: Roles): number {
        this.turned += turnBetween(this.center, this.last, at);
        this.last = at;
        this.drawn = snapRotation(this.turned, {
            fine: roles.fine,
            snap: this.snap(),
        });
        return this.drawn;
    }
}

/**
 * The rotate handle: turns the selection about its box's center by the
 * angle {@link RotationDrag} draws.
 */
export class RotateGesture extends HandleGesture {
    readonly kind: FieldTestGesture = "rotate";
    readonly center: FieldPoint;
    private readonly rotation: RotationDrag;

    constructor(
        origin: FieldPointer,
        starts: readonly MarcherPosition[],
        host: MoveGestureHost,
        /** The marchers' bounds at the press. */
        readonly box: FieldRect,
        keys: FieldKeys,
        /** The Snap toggle, read on every event; on when omitted. */
        snap?: () => boolean,
    ) {
        super(origin, starts, host, keys, ROTATE_HONORS);
        this.center = centerOf(box);
        this.rotation = new RotationDrag(this.center, origin.field, snap);
    }

    /** The angle drawn, in degrees clockwise: the overlay turns the box by it until the release. */
    angle(): number {
        return this.rotation.angle();
    }

    protected positionsAt(at: FieldPoint, roles: Roles) {
        return rotatePositions(
            this.starts,
            this.center,
            this.rotation.turnTo(at, roles),
        );
    }
}

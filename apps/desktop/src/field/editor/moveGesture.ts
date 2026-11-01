import type { FieldTestGesture } from "@/field/fieldTestApi";
import type { HonoredRoles } from "@/input/gestureChipStore";
import type { Roles } from "@/input/modifierRoles";
import type { FieldGesture, FieldPoint, FieldPointer } from "./fieldEditor";
import { FieldDrag, type FieldKeys } from "./fieldKeys";
import { PRECISION_START, anchorAt, precisionDelta } from "./moveRules";

/** A marcher's position, in field units. */
export type MarcherPosition = { id: number; x: number; y: number };

/**
 * Where the dragged marchers go for a pointer delta, in field units. The seam
 * for snapping and Lock X/Y (#197, `ruledMove` in `moveRules.ts`): it gets the
 * delta from the press to the pointer (slowed while fine is on, see
 * `precisionDelta`), the held roles and where the marchers started, and
 * returns their positions. {@link followPointer} moves them by the delta as
 * it is. It must return one position per start, in the same order: a drop
 * compares them by index to tell whether anything moved.
 */
export type MoveTransform = (
    delta: FieldPoint,
    roles: Roles,
    starts: readonly MarcherPosition[],
) => MarcherPosition[];

/** Every marcher moves by the pointer's delta, unchanged. */
export const followPointer: MoveTransform = (delta, _roles, starts) =>
    starts.map(({ id, x, y }) => ({ id, x: x + delta.x, y: y + delta.y }));

/** What a move gesture reports to the editor. */
export type MoveGestureHost = {
    /** The marchers' live positions, while the pointer moves. */
    show(positions: readonly MarcherPosition[]): void;
    /** The pointer was released: the marchers were dropped here. */
    drop(positions: readonly MarcherPosition[]): void;
    /** Nothing is dropped: the marchers go back. */
    cancel(): void;
};

/** A move reads fine and constrain (one axis), and snaps to the rounding grid; not from center */
const MOVE_HONORS: HonoredRoles = {
    context: "field",
    fine: "fine",
    constrain: "oneAxis",
    snaps: true,
};

/**
 * Dragging marchers (#196, user story 34): they follow the pointer from where
 * the press started, through {@link MoveTransform}, and are dropped where it's
 * released. The editor saves the drop and owns what's drawn meanwhile. While
 * fine is on they move at a quarter of the pointer's speed (#197, user story
 * 39), carrying on from where they're drawn when fine turns on (snapped,
 * when rounding is on) or off. Constrain filters that drag afterwards: it
 * keeps an axis while it's held and leaves no offset once it's released. A
 * role key pressed or released mid-drag redraws them at the last pointer,
 * with no pointer move.
 */
export class MoveGesture implements FieldGesture {
    readonly kind: FieldTestGesture = "move";
    private track = PRECISION_START;
    /** Fine at the last event; on from the press, it anchors at the start, which changes nothing. */
    private fine = false;
    private readonly drag: FieldDrag<MarcherPosition[]>;
    /**
     * How far the first marcher was drawn from its start at the last event,
     * without constrain, so fine turning on never folds the axis constrain
     * keeps into the lag. Lock X and Lock Y are in it: on a locked axis it's
     * 0, so unlocking mid-drag with fine on trails the pointer by the whole
     * distance dragged along that axis.
     */
    private drawn: FieldPoint = { x: 0, y: 0 };

    constructor(
        private readonly origin: FieldPointer,
        private readonly starts: readonly MarcherPosition[],
        private readonly host: MoveGestureHost,
        private readonly transform: MoveTransform = followPointer,
        keys: FieldKeys,
    ) {
        this.drag = new FieldDrag(
            keys,
            (at, roles) => this.positionsAt(at, roles),
            (positions) => host.show(positions),
            MOVE_HONORS,
        );
    }

    move(pointer: FieldPointer): void {
        this.drag.move(pointer);
    }

    /** Drops the marchers; a release where the last move left the pointer drops what's drawn. */
    end(pointer: FieldPointer): void {
        this.host.drop(this.drag.end(pointer));
    }

    cancel(): void {
        this.drag.cancel();
        this.host.cancel();
    }

    private positionsAt(at: FieldPoint, roles: Roles) {
        // Fine on: the slow drag starts from where the marchers are drawn
        if (roles.fine && !this.fine)
            this.track = anchorAt(this.track, this.drawn);
        this.fine = roles.fine;
        const moved = precisionDelta(
            this.track,
            { x: at.x - this.origin.field.x, y: at.y - this.origin.field.y },
            roles.fine,
        );
        this.track = moved.track;
        const free = this.transform(
            moved.delta,
            { ...roles, constrain: false },
            this.starts,
        );
        this.drawn = {
            x: free[0].x - this.starts[0].x,
            y: free[0].y - this.starts[0].y,
        };
        return roles.constrain
            ? this.transform(moved.delta, roles, this.starts)
            : free;
    }
}

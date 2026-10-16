import type { FieldTestGesture } from "@/field/fieldTestApi";
import type { FieldGesture, FieldPoint, FieldPointer } from "./fieldEditor";
import { PRECISION_START, anchorAt, precisionDelta } from "./moveRules";

/** A marcher's position, in field units. */
export type MarcherPosition = { id: number; x: number; y: number };

/**
 * Where the dragged marchers go for a pointer delta, in field units. The seam
 * for snapping and Lock X/Y (#197, `ruledMove` in `moveRules.ts`): it gets the
 * delta from the press to the pointer (slowed while Alt is down, see
 * `precisionDelta`), the pointer (its modifiers) and where the marchers
 * started, and returns their positions. {@link followPointer} moves them by
 * the delta as it is. It must return one position per start, in the same
 * order: a drop compares them by index to tell whether anything moved.
 */
export type MoveTransform = (
    delta: FieldPoint,
    pointer: FieldPointer,
    starts: readonly MarcherPosition[],
) => MarcherPosition[];

/** Every marcher moves by the pointer's delta, unchanged. */
export const followPointer: MoveTransform = (delta, _pointer, starts) =>
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

/**
 * Dragging marchers (#196, user story 34): they follow the pointer from where
 * the press started, through {@link MoveTransform}, and are dropped where it's
 * released. The editor saves the drop and owns what's drawn meanwhile. While
 * Alt is down they move at a quarter of the pointer's speed (#197, user story
 * 39), carrying on from where they're drawn when Alt is pressed (snapped,
 * when rounding is on) or released.
 */
export class MoveGesture implements FieldGesture {
    readonly kind: FieldTestGesture = "move";
    private track = PRECISION_START;
    private alt: boolean;
    /**
     * How far the first marcher was drawn from its start, at the last event.
     * On a locked axis it's 0, so unlocking mid-drag with Alt down trails the
     * pointer by the whole distance dragged along that axis.
     */
    private drawn: FieldPoint = { x: 0, y: 0 };
    /** The last positions shown, and where the pointer was for them. */
    private shown: {
        at: FieldPoint;
        positions: MarcherPosition[];
    } | null = null;

    constructor(
        private readonly origin: FieldPointer,
        private readonly starts: readonly MarcherPosition[],
        private readonly host: MoveGestureHost,
        private readonly transform: MoveTransform = followPointer,
    ) {
        this.alt = origin.alt;
    }

    move(pointer: FieldPointer): void {
        const positions = this.positionsAt(pointer);
        this.shown = { at: pointer.field, positions };
        this.host.show(positions);
    }

    /**
     * Drops the marchers. A release where the last move left the pointer
     * drops them where they're drawn: a key pressed or released since then
     * (Alt up, Shift down) fires no pointer event, and mustn't change the drop
     * (user stories 41 and 42).
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

    private positionsAt(pointer: FieldPointer) {
        // Alt pressed: the slow drag starts from where the marchers are drawn
        if (pointer.alt && !this.alt)
            this.track = anchorAt(this.track, this.drawn);
        this.alt = pointer.alt;
        const moved = precisionDelta(
            this.track,
            {
                x: pointer.field.x - this.origin.field.x,
                y: pointer.field.y - this.origin.field.y,
            },
            pointer.alt,
        );
        this.track = moved.track;
        const positions = this.transform(moved.delta, pointer, this.starts);
        this.drawn = {
            x: positions[0].x - this.starts[0].x,
            y: positions[0].y - this.starts[0].y,
        };
        return positions;
    }
}

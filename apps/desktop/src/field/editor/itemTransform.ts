import type { FieldTestGesture } from "@/field/fieldTestApi";
import type { HonoredRoles } from "@/input/gestureChipStore";
import type { Roles } from "@/input/modifierRoles";
import type { FieldGesture, FieldPoint, FieldPointer } from "./fieldEditor";
import { FieldDrag, type FieldKeys } from "./fieldKeys";
import {
    rotatePoint,
    type HandleId,
    type SelectionFrame,
} from "./groupTransform";
import { PRECISION_START, precisionDelta } from "./moveRules";
import { ROTATE_HONORS, RotationDrag } from "./transformGestures";

/**
 * Resizing and turning one item's Outline with its handles (C2.1, props-spec
 * section 5). An Outline's size and turn are its own, beat-keyed and apart
 * from its moves, so the handles change only them: a side or corner resizes
 * about the center, the rotate handle turns it about the center, and the
 * item never moves. The release saves the new size and turn at the playhead.
 */

/** An item's Outline as drawn: its center, size in field units, and turn in degrees clockwise. */
export type ItemFrame = {
    center: FieldPoint;
    width: number;
    depth: number;
    rotation: number;
};

/** An Outline's size in field units and turn in degrees, as a handle leaves it. */
export type ItemSize = { width: number; depth: number; rotation: number };

/** No handle resizes an Outline below this, in field units: it would vanish. */
export const MIN_ITEM_SIZE = 2;

/** The item's frame as the selection box draws it: around its Outline, turned with it. */
export function itemSelectionFrame(frame: ItemFrame): SelectionFrame {
    const { center, width, depth, rotation } = frame;
    return {
        box: {
            left: center.x - width / 2,
            right: center.x + width / 2,
            top: center.y - depth / 2,
            bottom: center.y + depth / 2,
        },
        pad: 0,
        angle: rotation,
    };
}

/** What an item handle drags: the size drawn, and the save at the release. */
export interface ItemTransformHost {
    show(size: ItemSize): void;
    save(size: ItemSize): void;
    cancel(): void;
}

/** Which of the Outline's own axes a scale handle pulls: -1, 0 (not this axis) or 1. */
const PULLS: Record<Exclude<HandleId, "rot">, FieldPoint> = {
    nw: { x: -1, y: -1 },
    n: { x: 0, y: -1 },
    ne: { x: 1, y: -1 },
    e: { x: 1, y: 0 },
    se: { x: 1, y: 1 },
    s: { x: 0, y: 1 },
    sw: { x: -1, y: 1 },
    w: { x: -1, y: 0 },
};

/**
 * As the selection's handles do: while fine is on a resize counts the
 * pointer at a quarter of its speed (a turn doesn't slow), a role key pressed
 * or released mid-drag redraws the Outline at the last pointer, and a release
 * where the last move left the pointer saves what's drawn. Neither handle reads
 * constrain or from center.
 */
abstract class ItemHandleGesture implements FieldGesture {
    abstract readonly kind: FieldTestGesture;
    private readonly drag: FieldDrag<ItemSize>;

    constructor(
        protected readonly frame: ItemFrame,
        private readonly host: ItemTransformHost,
        keys: FieldKeys,
        honored: HonoredRoles,
    ) {
        this.drag = new FieldDrag(
            keys,
            (at, roles) => this.sizeAt(at, roles),
            (size) => host.show(size),
            honored,
        );
    }

    move(pointer: FieldPointer): void {
        this.drag.move(pointer);
    }

    end(pointer: FieldPointer): void {
        this.host.save(this.drag.end(pointer));
    }

    cancel(): void {
        this.drag.cancel();
        this.host.cancel();
    }

    protected abstract sizeAt(at: FieldPoint, roles: Roles): ItemSize;
}

/**
 * A side or corner: the Outline's sides it pulls follow the pointer, the
 * opposite ones following too, so the center stays where it is. Nothing
 * snaps, so fine needs no re-anchoring: the slow drag goes on from wherever
 * the pointer had taken the sides.
 */
export class ItemResizeGesture extends ItemHandleGesture {
    readonly kind: FieldTestGesture = "scale";
    private track = PRECISION_START;

    constructor(
        private readonly origin: FieldPointer,
        frame: ItemFrame,
        host: ItemTransformHost,
        private readonly handle: Exclude<HandleId, "rot">,
        keys: FieldKeys,
    ) {
        super(frame, host, keys, {
            context: "field",
            fine: "fine",
            snaps: false,
        });
    }

    protected sizeAt(at: FieldPoint, roles: Roles): ItemSize {
        const { center, width, depth, rotation } = this.frame;
        const moved = precisionDelta(
            this.track,
            { x: at.x - this.origin.field.x, y: at.y - this.origin.field.y },
            roles.fine,
        );
        this.track = moved.track;
        // Where the pointer counts as being, unturned about the center into the Outline's own frame
        const local = rotatePoint(
            {
                x: this.origin.field.x + moved.delta.x,
                y: this.origin.field.y + moved.delta.y,
            },
            center,
            -rotation,
        );
        const pulls = PULLS[this.handle];
        const half = (offset: number, pull: number, size: number) =>
            pull === 0
                ? size
                : Math.max(MIN_ITEM_SIZE, 2 * Math.max(0, offset * pull));
        return {
            width: half(local.x - center.x, pulls.x, width),
            depth: half(local.y - center.y, pulls.y, depth),
            rotation,
        };
    }
}

/**
 * The rotate handle: turns the Outline about its center by the angle
 * {@link RotationDrag} draws, as the selection's rotate handle does: snapped
 * to 15°, or to whole degrees with fine, at full speed; free with the Snap
 * toggle off.
 */
export class ItemRotateGesture extends ItemHandleGesture {
    readonly kind: FieldTestGesture = "rotate";
    private readonly rotation: RotationDrag;

    constructor(
        origin: FieldPointer,
        frame: ItemFrame,
        host: ItemTransformHost,
        keys: FieldKeys,
        /** The Snap toggle, read on every event; on when omitted. */
        snap?: () => boolean,
    ) {
        super(frame, host, keys, ROTATE_HONORS);
        this.rotation = new RotationDrag(frame.center, origin.field, snap);
    }

    protected sizeAt(at: FieldPoint, roles: Roles): ItemSize {
        const { width, depth, rotation } = this.frame;
        const turn = this.rotation.turnTo(at, roles);
        // Raw, not wrapped to [0, 360): an Outline change eases through the raw angle (so a
        // spin can be drawn), and 350° turned 20° must ease 20°, not back 340°
        return { width, depth, rotation: rotation + turn };
    }
}

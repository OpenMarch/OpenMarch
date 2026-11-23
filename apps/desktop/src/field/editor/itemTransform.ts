import type { FieldTestGesture } from "@/field/fieldTestApi";
import type { HonoredRoles } from "@/input/gestureChipStore";
import type { Roles } from "@/input/modifierRoles";
import type { FieldGesture, FieldPoint, FieldPointer } from "./fieldEditor";
import { FieldDrag, type FieldKeys } from "./fieldKeys";
import {
    rotatePoint,
    scaleFor,
    type HandleId,
    type SelectionFrame,
} from "./groupTransform";
import { PRECISION_START, precisionDelta } from "./moveRules";
import { ROTATE_HONORS, RotationDrag, SCALE_HONORS } from "./transformGestures";

/**
 * Resizing and turning one item's Outline with its handles (C2.1, props-spec
 * section 5). A side or corner resizes it as the selection box's handles
 * scale marchers: the opposite side stays put, so the item's center moves
 * with the resize, or the center stays with from center (Alt); constrain
 * ($mod) keeps its proportions. The rotate handle turns it about its center.
 * The release saves the new size and turn at the playhead, and a moved center
 * as a drop of the item there, in the same edit.
 */

/** An item's Outline as drawn: its center, size in field units, and turn in degrees clockwise. */
export type ItemFrame = {
    center: FieldPoint;
    width: number;
    depth: number;
    rotation: number;
    /**
     * An imported model's prop (fork #1078): every handle resizes it evenly, keeping its
     * proportions, and its height follows (`useFieldItemWrites`)
     */
    keepsProportions?: boolean;
};

/**
 * An Outline's size in field units and turn in degrees, as a handle leaves it, and its new center
 * when the resize moved it (absent when the center stayed put).
 */
export type ItemSize = {
    width: number;
    depth: number;
    rotation: number;
    center?: FieldPoint;
};

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

/** A center moved less than this, in field units, stayed put: rounding, not a move. */
const STILL = 1e-9;

/**
 * As the selection's handles do: while fine is on a resize counts the
 * pointer at a quarter of its speed (a turn doesn't slow), a role key pressed
 * or released mid-drag redraws the Outline at the last pointer, and a release
 * where the last move left the pointer saves what's drawn.
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

/** A marcher selection's scale roles, without the snapping an item's resize doesn't do */
const ITEM_SCALE_HONORS: HonoredRoles = { ...SCALE_HONORS, snaps: false };

/**
 * A side or corner, by the selection box's rule (`scaleFor`) in the Outline's
 * own frame, unturned about its center: the sides it pulls follow the pointer
 * and the opposite ones stay put, so the center moves; with from center the
 * opposite sides mirror them and the center stays. Constrain keeps the
 * proportions (a corner along its diagonal, a side evenly across), as an
 * imported model's prop always does (#1078). Nothing snaps, so fine needs no
 * re-anchoring: the slow drag goes on from wherever the pointer had taken the
 * sides. No side goes below {@link MIN_ITEM_SIZE}.
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
        super(frame, host, keys, ITEM_SCALE_HONORS);
    }

    protected sizeAt(at: FieldPoint, roles: Roles): ItemSize {
        const { center, width, depth, rotation } = this.frame;
        const moved = precisionDelta(
            this.track,
            { x: at.x - this.origin.field.x, y: at.y - this.origin.field.y },
            roles.fine,
        );
        this.track = moved.track;
        // The drag, unturned into the Outline's own frame
        const delta = rotatePoint(moved.delta, { x: 0, y: 0 }, -rotation);
        const keepRatio =
            roles.constrain || this.frame.keepsProportions === true;
        const { anchor, x, y } = scaleFor(
            this.handle,
            {
                left: center.x - width / 2,
                right: center.x + width / 2,
                top: center.y - depth / 2,
                bottom: center.y + depth / 2,
            },
            delta,
            keepRatio,
            roles.fromCenter,
        );
        // No smaller than the least size, evenly when it keeps its proportions; one already
        // smaller isn't grown by the press
        const least = (size: number) => Math.min(1, MIN_ITEM_SIZE / size);
        const even = Math.max(x, least(Math.min(width, depth)));
        const scale = keepRatio
            ? { x: even, y: even }
            : { x: Math.max(x, least(width)), y: Math.max(y, least(depth)) };
        const size = {
            width: width * scale.x,
            depth: depth * scale.y,
            rotation,
        };
        // The center scales about the anchor too, then turns back with the Outline
        const local = {
            x: anchor.x + (center.x - anchor.x) * scale.x,
            y: anchor.y + (center.y - anchor.y) * scale.y,
        };
        if (
            Math.abs(local.x - center.x) < STILL &&
            Math.abs(local.y - center.y) < STILL
        )
            return size;
        return { ...size, center: rotatePoint(local, center, rotation) };
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

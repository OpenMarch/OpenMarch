/**
 * Set order on the field (pathways step 4g, DL-27): while it's on, it takes every edit press. A
 * drag through the selected marchers picks each the pointer passes, in that order, and its release
 * keeps the order; a click picks the marcher under it (within the same reach), and the mode stays
 * on for the next, until every one is picked or Done. A drag that passes no one leaves it on too.
 * Nothing selects, moves or opens a menu.
 *
 * The picks are worked out once a frame from the pointer's moves since the last frame, so a fast
 * drag still passes everyone between, and the line redraws at most once a frame.
 */
import type {
    FieldCursor,
    FieldMode,
    FieldPointer,
} from "@/field/editor/fieldEditor";
import { useFieldViewStore } from "@/field/three/fieldView";
import { currentShapeField } from "@/shapes/field/shapeField";
import {
    updateOrderSweep,
    useMarcherOrderStore,
    type OrderSweep,
} from "./marcherOrderStore";
import { sweepThrough, sweepTolerance, type XY } from "./orderSweep";

/** How Set order ends once it has picked: kept (the caller writes it) */
type Finish = () => void;

export class OrderSweepMode implements FieldMode {
    readonly ownsSelectionBox = true;
    readonly locksSelection = true;
    readonly blocksFieldMenu = true;
    readonly gesture = { kind: "order" as const, always: false };

    /** Where the pointer was when picks were last worked out */
    private last: XY | null = null;
    /** How many were picked when the press went down */
    private pickedAtPress = 0;
    /** The pointer's moves since then, worked out on the next frame */
    private pending: XY[] = [];
    private frame: number | null = null;

    constructor(private readonly finish: Finish) {}

    claims(): boolean {
        return useMarcherOrderStore.getState().sweep !== null;
    }

    press(pointer: FieldPointer): void {
        this.pickedAtPress =
            useMarcherOrderStore.getState().sweep?.picked.length ?? 0;
        this.last = pointer.field;
        this.pending = [];
        this.pick(pointer.field, pointer.field);
    }

    move(pointer: FieldPointer): void {
        if (!this.last) return;
        this.pending.push(pointer.field);
        if (typeof requestAnimationFrame !== "function") {
            this.flush();
            return;
        }
        this.frame ??= requestAnimationFrame(() => {
            this.frame = null;
            this.flush();
        });
    }

    release(
        pointer: FieldPointer,
        click: { double: boolean; ownFirst: boolean } | null,
    ): void {
        if (this.last) this.pending.push(pointer.field);
        this.flush();
        this.last = null;
        updateOrderSweep({ pointer: null });
        const sweep = useMarcherOrderStore.getState().sweep;
        if (!sweep) return;
        // A drag that picked someone keeps the order at its release; clicks, and a drag that
        // picked no one, go on until everyone is picked
        const dragPicked =
            click === null && sweep.picked.length > this.pickedAtPress;
        if (dragPicked || sweep.picked.length === sweep.ids.length)
            this.finish();
    }

    cancel(): void {
        this.dropFrame();
        this.last = null;
        this.pending = [];
        updateOrderSweep({ pointer: null });
    }

    cursorAt(): FieldCursor {
        return "crosshair";
    }

    drawing(): null {
        return null;
    }

    subscribe(): () => void {
        return () => {};
    }

    /** A click on empty field changes nothing while it's on */
    takeClick(): boolean {
        return true;
    }

    /** Works out the picks for the moves since the last frame */
    private flush(): void {
        this.dropFrame();
        const moves = this.pending;
        this.pending = [];
        let from = this.last;
        if (!from || moves.length === 0) return;
        for (const to of moves) {
            this.pick(from, to);
            from = to;
        }
        this.last = from;
    }

    private dropFrame(): void {
        if (this.frame !== null && typeof cancelAnimationFrame === "function")
            cancelAnimationFrame(this.frame);
        this.frame = null;
    }

    /** Picks those the way `from`→`to` passes, and puts the line's end at `to` */
    private pick(from: XY, to: XY): void {
        const sweep = useMarcherOrderStore.getState().sweep;
        if (!sweep) return;
        const picked = sweepThrough({
            picked: sweep.picked,
            from,
            to,
            candidates: candidatesOf(sweep),
            tolerance: toleranceNow(),
        });
        updateOrderSweep({
            pointer: to,
            ...(picked.length !== sweep.picked.length ? { picked } : {}),
        });
    }
}

const candidatesOf = (sweep: OrderSweep): ReadonlyMap<number, XY> => sweep.at;

/** Half a step, or a few pixels on screen when zoomed out */
function toleranceNow(): number {
    const step = currentShapeField()?.fieldProperties.pixelsPerStep ?? 12;
    return sweepTolerance(step, useFieldViewStore.getState().zoom);
}

import type { FieldTestGesture } from "@/field/fieldTestApi";
import type { HonoredRoles } from "@/input/gestureChipStore";
import type { Roles } from "@/input/modifierRoles";
import type { FieldGesture, FieldPoint, FieldPointer } from "./fieldEditor";
import { FieldDrag, type FieldKeys } from "./fieldKeys";
import type { MarcherPosition } from "./moveGesture";
import type { FieldRect } from "./selectionArea";

/**
 * A plain selection's pivot: what the rotate knob and the inspector's typed rotation turn it
 * around. It's the center of the selection's box until it's set elsewhere: from the inspector's
 * pivot grid, or by pulling the crosshair out of the center ($mod-drag, as on a shape, #350) and
 * dropping it. Out of the center the crosshair drags on its own; dragged back onto the center or
 * double-clicked, it's the center again.
 *
 * Where it's set is kept as an anchor, so it's worked out again from where the marchers are drawn
 * rather than left behind: one of the box's 9 points, or a marcher. Anywhere else it's a point on
 * the field, carried along when the editor drags the whole selection, and dropped when the page
 * changes. It lasts while the selection does; it's hidden while the show plays. A shape keeps its
 * own pivot. Everything here but {@link PivotGesture} is pure.
 */

/** How near the crosshair a press must be to take it, and a drag to snap, in CSS px */
export const PIVOT_REACH_PX = 10;

/** One of the 9 points of the selection's box, as the pivot grid names them */
export type BoxPointKey =
    | "nw"
    | "n"
    | "ne"
    | "w"
    | "c"
    | "e"
    | "sw"
    | "s"
    | "se";

/** The box's points, center first, so a tie snaps to the center */
export const BOX_POINT_KEYS: readonly BoxPointKey[] = [
    "c",
    "nw",
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
];

/** Where the pivot is set: a point of the box, a marcher, or a spot on the field */
export type PivotAnchor =
    | { readonly kind: "box"; readonly key: BoxPointKey }
    | { readonly kind: "marcher"; readonly id: number }
    | { readonly kind: "point"; readonly at: FieldPoint };

/** Point `key` of `box` */
export function boxPoint(box: FieldRect, key: BoxPointKey): FieldPoint {
    const x = key.includes("w")
        ? box.left
        : key.includes("e")
          ? box.right
          : (box.left + box.right) / 2;
    const y = key.includes("n")
        ? box.top
        : key.includes("s")
          ? box.bottom
          : (box.top + box.bottom) / 2;
    return { x, y };
}

/**
 * Where `anchor` is for a selection whose box is `box`; a marcher that isn't drawn falls back to
 * the center.
 */
export function anchorPoint(
    anchor: PivotAnchor,
    box: FieldRect,
    positionOf: (id: number) => FieldPoint | undefined,
): FieldPoint {
    switch (anchor.kind) {
        case "box":
            return boxPoint(box, anchor.key);
        case "marcher": {
            const p = positionOf(anchor.id);
            return p ? { x: p.x, y: p.y } : boxPoint(box, "c");
        }
        case "point":
            return anchor.at;
    }
}

/** Whether `anchor` is the center of the box: no pivot of its own */
export const isCenter = (anchor: PivotAnchor): boolean =>
    anchor.kind === "box" && anchor.key === "c";

/**
 * How far `after` moved from `before` when every marcher moved by the same amount (to within the
 * thousandth a move rounds each to), or null when they moved apart or aren't the same marchers.
 */
export function uniformShift(
    before: readonly MarcherPosition[],
    after: readonly MarcherPosition[],
): FieldPoint | null {
    if (before.length !== after.length || before.length === 0) return null;
    const dx = after[0].x - before[0].x;
    const dy = after[0].y - before[0].y;
    for (let i = 0; i < before.length; i++) {
        if (before[i].id !== after[i].id) return null;
        if (
            Math.abs(after[i].x - before[i].x - dx) > 2e-3 ||
            Math.abs(after[i].y - before[i].y - dy) > 2e-3
        )
            return null;
    }
    return { x: dx, y: dy };
}

/** A spot the pivot snaps to, and what it's anchored to there */
export type PivotTarget = { at: FieldPoint; anchor: PivotAnchor };

/**
 * What the pivot dragged to `at` is set to: the nearest of `targets` (the box's 9 points, then the
 * marchers) within `reach` field units, a box point winning a tie; else a spot on the grid.
 */
export function snapPivot(
    at: FieldPoint,
    targets: readonly PivotTarget[],
    reach: number,
    grid: (p: FieldPoint) => FieldPoint,
): PivotTarget {
    let best: { t: PivotTarget; d: number } | null = null;
    for (const t of targets) {
        const d = Math.hypot(t.at.x - at.x, t.at.y - at.y);
        if (d <= reach && (!best || d < best.d - 1e-9)) best = { t, d };
    }
    if (best) return best.t;
    const p = grid(at);
    return { at: p, anchor: { kind: "point", at: p } };
}

/** Dragging the pivot reads fine (off the snaps) and snaps; nothing else */
export const PIVOT_HONORS: HonoredRoles = {
    context: "field",
    fine: "fine",
    snaps: true,
};

/**
 * Dragging the pivot's crosshair: it follows the pointer, snapped by `place`, and is set where
 * it's drawn at the release. Nothing is saved: the pivot isn't part of the show.
 */
export class PivotGesture implements FieldGesture {
    readonly kind: FieldTestGesture = "pivot";
    private readonly drag: FieldDrag<PivotTarget>;

    constructor(
        keys: FieldKeys,
        /** Where the pivot goes for the pointer at `at`, with these roles held */
        place: (at: FieldPoint, roles: Roles) => PivotTarget,
        private readonly host: {
            show(at: FieldPoint): void;
            set(target: PivotTarget): void;
            cancel(): void;
        },
    ) {
        this.drag = new FieldDrag(
            keys,
            place,
            (t) => host.show(t.at),
            PIVOT_HONORS,
        );
    }

    move(pointer: FieldPointer): void {
        this.drag.move(pointer);
    }

    end(pointer: FieldPointer): void {
        this.host.set(this.drag.end(pointer));
    }

    cancel(): void {
        this.drag.cancel();
        this.host.cancel();
    }
}

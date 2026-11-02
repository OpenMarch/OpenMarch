import { assignSlots, orderFields, orderOn, type OrderChoice } from "../assign";
import { changeFiles, type BoxParams } from "../box/boxGeometry";
import { samePivot, type ShapeFrame } from "../frame/frame";
import { pivotOf } from "../frame/pivot";
import {
    centerPivot,
    dragShape,
    selectionAfter,
    selectionIn,
    startShapeGesture,
    type ShapeGesture,
} from "../frame/gestures";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import type { ShapeContext, XY } from "../types";
import type { PlacedBox } from "./placedBox";
import { sameParams } from "./commitBox";
import { distributionOf } from "../distribute/modes";
import { leastTravelOnto } from "../leastTravel";
import { placedAlong, placedOrderChoice } from "./placedOrder";

/**
 * A selected placed shape, edited in place (docs/timeline/research/shapes/07-placed-boxes.md): its
 * handles resize it, its knob and corners turn it, its center dot and body move it, like the
 * shape tool's (the gestures are `frame/gestures.ts`), but each gesture is saved when it ends
 * instead of waiting for Place. Presses anywhere else belong to the canvas. A shape with holes
 * keeps them: each member keeps its spot in the shape. Any kind the shape tool draws works the same
 * way, through its tool kind (#397). Everything here is pure.
 */

export type LiveGesture = ShapeGesture;

export interface LiveBox {
    readonly box: PlacedBox;
    /** The shape as the gesture has it; the saved one when no gesture is going */
    readonly params: unknown;
    readonly gesture: LiveGesture | null;
    /** Where the pointer is during a gesture, for the guides drawn by it */
    readonly pointer?: XY;
    /** The handle selected by a click (a Line's point, #557); null or absent when none is */
    readonly selected?: string | null;
}

/** The box as saved; `selected` kept when the box still has that handle (it was saved again) */
export const openLive = (
    box: PlacedBox,
    selected?: string | null,
): LiveBox => ({
    box,
    params: box.params,
    gesture: null,
    selected: selectionIn(box.kind, box.params, box.spots, selected),
});

/** The gesture a press at `at` starts, or null when the box doesn't take it */
export function pressLive(live: LiveBox, at: XY, env: ToolEnv): LiveBox | null {
    const gesture = startShapeGesture(
        live.box.kind,
        live.box.params,
        live.box.spots,
        at,
        env,
        live.selected,
    );
    return gesture ? { ...live, gesture, pointer: at } : null;
}

export function moveLive(live: LiveBox, at: XY, env: ToolEnv): LiveBox {
    const g = live.gesture;
    if (!g) return live;
    const params = dragShape(live.box.kind, live.box.spots, g, at, env);
    return { ...live, params, pointer: at };
}

const sameFrame = (a: ShapeFrame, b: ShapeFrame) =>
    a.center.x === b.center.x &&
    a.center.y === b.center.y &&
    a.halfWidth === b.halfWidth &&
    a.halfDepth === b.halfDepth &&
    a.rotation === b.rotation &&
    a.flipX === b.flipX &&
    a.flipY === b.flipY;

/**
 * How a closed shape is filled, as text to compare; empty for an open kind. The box's file count
 * is in it, so a change of count across reads as a new layout.
 */
const layoutOf = (kind: AnyToolKind, params: unknown, spots: number) => {
    const d = distributionOf(kind, params, spots);
    return d ? JSON.stringify(d) : "";
};

/**
 * Whether `a` and `b` are the same shape as far as anyone can see: the same frame, pivot, fill
 * and numbers. What a kind keeps besides (a recipe's old fields) doesn't count, so a press that
 * changes nothing saves nothing.
 */
function sameShape(kind: AnyToolKind, spots: number, a: unknown, b: unknown) {
    return (
        sameFrame(kind.frameOf(a, spots), kind.frameOf(b, spots)) &&
        samePivot(pivotOf(a), pivotOf(b)) &&
        layoutOf(kind, a, spots) === layoutOf(kind, b, spots) &&
        // A line's corner moves inside the same frame (#524)
        JSON.stringify(kind.outline?.(a, spots)) ===
            JSON.stringify(kind.outline?.(b, spots)) &&
        kind.params.every(
            (p) => p.value?.(a, spots, 1) === p.value?.(b, spots, 1),
        )
    );
}

/** Escape with a handle selected (#557): nothing selected. Unchanged when nothing is. */
export const clearLiveSelection = (live: LiveBox): LiveBox =>
    live.selected ? { ...live, selected: null } : live;

/** Whether `params` lays `box` out on a new lattice, so its members are laid out again */
export const newLayout = (box: PlacedBox, params: unknown): boolean =>
    layoutOf(box.kind, params, box.spots) !==
    layoutOf(box.kind, box.params, box.spots);

/**
 * A click as the field editor tells it: `double` for a double-click's second click, and `ownFirst`
 * when its first click was this box's too, not the editor's click that selected the box (absent:
 * this box's)
 */
export type LiveClick = {
    readonly double: boolean;
    readonly ownFirst?: boolean;
};

/**
 * Ends the gesture: `changed` when there is something to save, `enter` when the click goes inside
 * the box. A double click on the pivot sends it back to the center (#350), and on a handle does
 * what its kind says (a Line's point switches between corner and smooth, #557), going nowhere
 * even when that changes nothing (an end of a tangent bar). A kind with no handle double-click (a
 * Box, a Circle) goes inside there, as before #557. A click on a handle that adds a point
 * adds it (#524), and on one that selects selects it. A double-click whose first click was the
 * editor's (the click on a member that selected the box) is no handle's: it goes inside the box.
 */
export function releaseLive(
    live: LiveBox,
    click?: LiveClick | null,
): {
    live: LiveBox;
    changed: boolean;
    enter: boolean;
} {
    const { kind, spots } = live.box;
    const g = live.gesture;
    if (click?.double && click.ownFirst === false && g?.type === "handle")
        return {
            live: { ...live, gesture: null },
            changed: false,
            enter: true,
        };
    const doubled =
        click?.double && g?.type === "handle"
            ? (kind.doubleClickHandle?.(g.base, spots, g.key) ?? null)
            : null;
    const centered = click?.double && g ? centerPivot(g) : null;
    // A double-click's first click already did the handle's click (and was saved), as in the
    // drawn shape: the second doesn't do it again
    const clicked =
        click && !click.double && g?.type === "handle"
            ? (kind.clickHandle?.(g.base, spots, g.key) ?? null)
            : null;
    const params = doubled ?? centered ?? clicked ?? live.params;
    const selected = g
        ? selectionAfter(kind, spots, g, click, live.selected, params)
        : (live.selected ?? null);
    const changed = !sameShape(kind, spots, params, live.box.params);
    return {
        live: { ...live, params, gesture: null, selected },
        changed,
        // Only a kind whose handles take a double-click keeps it from going inside: a Box's or a
        // Circle's handle sits on a member, whose double-click goes inside as anywhere else
        enter:
            !!click?.double &&
            !changed &&
            (g?.type !== "handle" || !kind.doubleClickHandle),
    };
}

/**
 * Entry `value` of handle `key`'s right-click menu picked (#569): `changed` when there is
 * something to save. The selection is what the kind says after it, else kept where the shape
 * still has it.
 */
export function pickLive(
    live: LiveBox,
    key: string,
    value: string,
    env: ToolEnv,
): { live: LiveBox; changed: boolean } {
    const { kind, spots } = live.box;
    if (live.gesture) return { live, changed: false };
    const out = kind.menu?.pick(live.params, spots, key, value, env);
    if (!out) return { live, changed: false };
    const selected = selectionIn(
        kind,
        out.params,
        spots,
        out.selected === undefined ? live.selected : out.selected,
    );
    return {
        live: { ...live, params: out.params, selected },
        // A point's marcher answer changes neither its outline nor its frame: any number counts
        changed: !sameParams(out.params, live.box.params),
    };
}

/**
 * The box read again (`box`): the selection stays when it's the box as it was, or as this box
 * last `saved` it, and is cleared when it comes back changed from outside (an undo or redo, which
 * can put another point under the same key), as the open shape's undo does
 */
export function reopenLive(
    live: LiveBox,
    box: PlacedBox,
    saved?: unknown,
): LiveBox {
    const ours =
        sameParams(box.params, live.box.params) ||
        (saved !== undefined && sameParams(box.params, saved));
    return openLive(box, ours ? live.selected : null);
}

/** The box with `delta` more files (fewer when negative), same intervals */
export const liveFiles = (
    box: PlacedBox<BoxParams>,
    delta: number,
    env: ToolEnv,
): BoxParams => changeFiles(box.params, box.spots, delta, env);

/**
 * Where each member stands in the shape drawn with `params`, and how many spots it has. A member
 * keeps its spot in the shape (its slot), so a stretch or move keeps everyone's place and holes
 * stay holes. A new layout (a box's file count) lays the shape out again for its members, Nearest,
 * so the fewest marchers move: any holes close up (a slot number means another place in a
 * different grid). A Line is laid out again in its recipe's order (#528), on its own spots: Keep
 * order and Reverse follow the members' order along it as saved, and any holes stay.
 */
export function liveTargets(
    box: PlacedBox,
    params: unknown,
    ctx: ShapeContext,
    /** Lay the members out again, by least travel, even with the same count across */
    layOutAgain?: boolean,
    /** Where members come from, when laying out again: their spots in the shape otherwise */
    origins?: ReadonlyMap<number, XY>,
    /** Who goes where when laying out again: the recipe's otherwise */
    order: OrderChoice = placedOrderChoice(box),
): {
    members: { marcherId: number; slot: number; x: number; y: number }[];
    spots: number;
} {
    const members = box.recipe.members;
    const shape = box.kind.shape;
    const slots = shape.generate(params, box.spots, ctx);
    const onSlots = (
        slotOf: (m: (typeof members)[number], i: number) => number,
    ) => ({
        members: members.map((m, i) => {
            const slot = slotOf(m, i);
            return { marcherId: m.marcherId, slot, ...xyOf(slots[slot]!) };
        }),
        spots: box.spots,
    });
    // An outline's count across isn't in its distribution, so the spots are compared too (#390)
    const sameSpots = !newLayout(box, params) && sameLattice(box, slots, ctx);
    if (!layOutAgain && sameSpots) return onSlots((m) => m.slot);
    const choice = orderOn(box.kind, order);
    // A Line laid out again as it was saved (Recalculate, an order picked) keeps its spots, holes
    // and all: Keep order and Reverse go from the order it was saved in, and Least travel fills
    // the spots nearest (#528). New params (Close up's) are laid out for the members below
    if (box.kind.ordered && sameSpots && params === box.params) {
        if (choice !== "nearest")
            return onSlots((m) => {
                const along = placedAlong(box, m.slot);
                return choice === "reverse" ? box.spots - 1 - along : along;
            });
        const nearest = leastTravelOnto(
            members.map((m) => origins?.get(m.marcherId) ?? m),
            slots,
        );
        return onSlots((_, i) => nearest[i]!);
    }
    const laidOut = shape.generate(params, members.length, ctx);
    const { orderMode, reverse } = orderFields(choice);
    const assignment = assignSlots({
        kind: shape,
        params,
        slots: laidOut,
        marchers: members.map((m, i) => ({
            id: m.marcherId,
            at: { x: m.x, y: m.y },
            ...(origins?.has(m.marcherId) && {
                from: origins.get(m.marcherId)!,
            }),
            drillRank: i,
            along: placedAlong(box, m.slot),
        })),
        mode: orderMode,
        reverse,
        ctx,
    });
    return {
        members: members.map((m, i) => {
            const slot = assignment[i]!;
            return { marcherId: m.marcherId, slot, ...xyOf(laidOut[slot]!) };
        }),
        spots: members.length,
    };
}

const xyOf = (p: XY): XY => ({ x: p.x, y: p.y });

/**
 * Recalculate who goes where (#429): the members on the shape's own spots by least travel from
 * `origins` (where each comes from: the start flag), or in a Line's order (#528), or null when
 * that changes nothing. A shape
 * with holes has Close up instead, which lays it out again by least travel.
 */
export function recalculatedTargets(
    box: PlacedBox,
    ctx: ShapeContext,
    origins: ReadonlyMap<number, XY>,
): { marcherId: number; slot: number; x: number; y: number }[] | null {
    const members = box.recipe.members;
    if (members.length !== box.spots) return null;
    const next = liveTargets(box, box.params, ctx, true, origins).members;
    const slotOf = new Map(members.map((m) => [m.marcherId, m.slot]));
    return next.some((m) => m.slot !== slotOf.get(m.marcherId)) ? next : null;
}

/**
 * Whether `slots` are the box's own spots moved (each keeps its row and file, or its place round
 * an outline), so members can keep theirs: not after a new count across, a new mode, or an
 * outline's gap moved (#390)
 */
function sameLattice(
    box: PlacedBox,
    slots: readonly { readonly row?: number; readonly col?: number }[],
    ctx: ShapeContext,
): boolean {
    const was = box.kind.shape.generate(box.params, box.spots, ctx);
    return (
        was.length === slots.length &&
        was.every((s, i) => s.row === slots[i]!.row && s.col === slots[i]!.col)
    );
}

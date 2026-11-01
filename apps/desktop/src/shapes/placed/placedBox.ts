import { canLayOut, type Distribution } from "../distribute/distribution";
import type {
    ShapeRecipeMember,
    StoredShapeRecipe,
} from "@/db-functions/shapeRecipes";
import { assignSlots, type AssignMarcher } from "../assign";
import {
    drawBox,
    boxFrame,
    boxNumbersReadable,
    snapToGrid,
    withBoxFrame,
    type BoxParams,
} from "../box/boxGeometry";
import { boxTool } from "../box/boxTool";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import { SHAPE_TOOLS } from "../tool/shapeTools";
import type { ShapeContext, XY } from "../types";
import { frameToField, pivotPoint } from "../frame/frame";
import { pivotOf } from "../frame/pivot";

/**
 * Placed shapes (docs/timeline/research/shapes/07-placed-boxes.md): a shape's recipe, read back.
 * The box came first, so the names say box; a placed shape of any kind the shape tool draws works
 * the same way (#397), through its tool kind, which the recipe's kind and version name.
 *
 * A shape is shown at the end of the move it was placed in, and at every later moment while each
 * of its members still stands on its spot (the form is held). Its members are exactly the marchers
 * on its spots: one that moves away leaves the shape, leaving a hole, and moving every member the
 * same way moves the shape. Everything here is pure.
 */

export type PlacedRecipe = Omit<StoredShapeRecipe, "members"> & {
    readonly members: readonly ShapeRecipeMember[];
};

/** A recipe's params as stored: the shape, plus how many spots it has (members + holes) */
export type StoredParams<P = unknown> = P & { readonly spots?: number };

/** A placed shape: its recipe, its tool kind and its params (`P` for a known kind) */
export interface PlacedBox<P = unknown> {
    readonly recipe: PlacedRecipe;
    /** The tool kind that draws and edits it */
    readonly kind: AnyToolKind;
    readonly params: P;
    /** Spots in the shape, holes included */
    readonly spots: number;
    /** The beat the shape was placed at: its move's end (0 for homes) */
    readonly endBeat: number;
}

/** Whether `placed` is a box, for what only a box has (its file count, Re-split) */
export const isPlacedBox = (
    placed: PlacedBox,
): placed is PlacedBox<BoxParams> => placed.kind === boxTool;

/** The kinds a recipe can be read back as: every kind the shape tool draws */
export const PLACED_KINDS: readonly AnyToolKind[] = SHAPE_TOOLS.map(
    (entry) => entry.kind,
);

/** How close a marcher must stand to its spot to be on it, in field units */
const ON_SPOT = 0.01;

/**
 * The kind of a recipe that marks marchers **ungrouped** from its move on (`ungroupShape`): a
 * shape ungrouped on its own page becomes one, and one ungrouped on a later page it's carried onto
 * ends there with one. It draws nothing and claims its members from its move's end, so no earlier
 * shape over them is shown from there on, and a shape placed later takes them again. Older builds
 * don't know the kind and skip it.
 */
export const UNGROUPED_KIND = "ungrouped";

/** Whether `recipe` marks its members ungrouped rather than describing a shape */
export const isUngrouped = (recipe: Pick<PlacedRecipe, "kind">): boolean =>
    recipe.kind === UNGROUPED_KIND;

const same = (a: XY, b: XY) =>
    Math.abs(a.x - b.x) <= ON_SPOT && Math.abs(a.y - b.y) <= ON_SPOT;

/**
 * The shape a recipe describes, or null for a kind (or version) none of `kinds` draws, or a
 * spread generator this app doesn't have, such as one from a newer app
 */
function placedOf(
    recipe: PlacedRecipe,
    kinds: readonly AnyToolKind[],
): { kind: AnyToolKind; params: unknown; spots: number } | null {
    const kind = kinds.find(
        (k) =>
            k.shape.id === recipe.kind &&
            k.shape.version === recipe.kindVersion,
    );
    if (!kind) return null;
    const stored = recipe.params as StoredParams<{ center?: XY }> | null;
    // Every shape's frame has a center, which recipes store (ADR 0006)
    if (!stored || typeof stored !== "object" || !stored.center) return null;
    const { spots, ...params } = stored;
    // A spread from a generator this app doesn't have can't be laid out again
    if (!canLayOut(params)) return null;
    // Nor can a box whose numbers were edited into something else (B4)
    if (kind === boxTool && !boxNumbersReadable(params)) {
        console.warn(
            `Placed shape ${recipe.id} isn't shown: its file count or intervals aren't numbers`,
        );
        return null;
    }
    return {
        kind,
        params,
        spots: Math.max(spots ?? 0, recipe.members.length),
    };
}

/**
 * The placed shapes to show at `beat`: placed at or before it, with every member on its spot. A
 * marcher is in one shape at a time, the latest placed; one ungrouped since (`UNGROUPED_KIND`) is
 * in none.
 *
 * @param endBeatOf the end beat of a move (`null`: homes, beat 0), undefined for a move that's gone
 * @param positionOf where a marcher stands at `beat`
 * @param kinds the kinds recipes are read back as: every kind the shape tool draws
 */
export function boxesAt({
    recipes,
    endBeatOf,
    beat,
    positionOf,
    kinds = PLACED_KINDS,
}: {
    recipes: readonly PlacedRecipe[];
    endBeatOf: (timelineId: number | null) => number | undefined;
    beat: number;
    positionOf: (marcherId: number) => XY | undefined;
    kinds?: readonly AnyToolKind[];
}): PlacedBox[] {
    const candidates: (PlacedBox | Ungrouped)[] = [];
    for (const recipe of recipes) {
        const endBeat = endBeatOf(recipe.timelineId);
        if (endBeat === undefined || endBeat > beat + 1e-9) continue;
        if (recipe.members.length === 0) continue;
        // Ungrouped stays ungrouped wherever its members go next, until a later shape takes them
        if (isUngrouped(recipe)) {
            candidates.push({ recipe, endBeat, ungrouped: true });
            continue;
        }
        const box = placedOf(recipe, kinds);
        if (!box) continue;
        const held = recipe.members.every((m) => {
            const p = positionOf(m.marcherId);
            return p !== undefined && same(p, m);
        });
        if (held) candidates.push({ recipe, ...box, endBeat });
    }
    candidates.sort((a, b) => b.endBeat - a.endBeat);
    const claimed = new Set<number>();
    const out: PlacedBox[] = [];
    for (const box of candidates) {
        // A mark keeps whoever a later shape hasn't taken; a shape needs all its members
        if ("ungrouped" in box) {
            for (const m of box.recipe.members) claimed.add(m.marcherId);
            continue;
        }
        if (box.recipe.members.some((m) => claimed.has(m.marcherId))) continue;
        for (const m of box.recipe.members) claimed.add(m.marcherId);
        out.push(box);
    }
    return out;
}

/** An ungrouped mark among the shapes `boxesAt` weighs: it claims its members and shows nothing */
interface Ungrouped {
    readonly recipe: PlacedRecipe;
    readonly endBeat: number;
    readonly ungrouped: true;
}

export type MembershipChange =
    | { readonly type: "none" }
    /** Every member moved the same way: the box moves with them */
    | { readonly type: "move"; readonly delta: XY }
    /** These members moved off their spots and leave the box */
    | { readonly type: "leave"; readonly left: readonly number[] };

/** What moving marchers to `moved` does to `box` */
export function membershipAfter(
    box: PlacedBox,
    moved: ReadonlyMap<number, XY>,
): MembershipChange {
    const off = box.recipe.members.filter((m) => {
        const to = moved.get(m.marcherId);
        return to !== undefined && !same(to, m);
    });
    if (off.length === 0) return { type: "none" };
    if (off.length === box.recipe.members.length) {
        const first = off[0]!;
        const to = moved.get(first.marcherId)!;
        const delta = { x: to.x - first.x, y: to.y - first.y };
        const together = off.every((m) => {
            const p = moved.get(m.marcherId)!;
            return same({ x: p.x - m.x, y: p.y - m.y }, delta);
        });
        if (together) return { type: "move", delta };
    }
    return { type: "leave", left: off.map((m) => m.marcherId) };
}

/** What a shape's recipe saves */
export interface BoxRecipe<P = unknown> {
    readonly params: StoredParams<P>;
    readonly spots: number;
    readonly members: readonly ShapeRecipeMember[];
}

/** `box` moved by `delta`, members and all: its frame's center moves, through its kind */
export function movedBox(box: PlacedBox, delta: XY): BoxRecipe {
    const frame = box.kind.frameOf(box.params, box.spots);
    const moved = box.kind.withFrame(box.params, box.spots, {
        ...frame,
        center: { x: frame.center.x + delta.x, y: frame.center.y + delta.y },
    }) as object;
    return {
        params: { ...moved, spots: box.spots },
        spots: box.spots,
        members: box.recipe.members.map((m) => ({
            ...m,
            x: m.x + delta.x,
            y: m.y + delta.y,
        })),
    };
}

/** The recipe without the marchers in `left`: their spots stay, as holes */
export function withoutMembers(
    recipe: PlacedRecipe,
    left: readonly number[],
): PlacedRecipe {
    const gone = new Set(left);
    const spots =
        (recipe.params as StoredParams | null)?.spots ?? recipe.members.length;
    return {
        ...recipe,
        params: { ...(recipe.params as object), spots },
        members: recipe.members.filter((m) => !gone.has(m.marcherId)),
    };
}

/** `params`' spots for `marchers` in a shape of `kind`, who goes where by Nearest */
function placeOn<P>(
    kind: AnyToolKind,
    params: P,
    marchers: readonly AssignMarcher[],
    ctx: ShapeContext,
): BoxRecipe<P> {
    const n = marchers.length;
    const slots = kind.shape.generate(params, n, ctx);
    const assignment = assignSlots({
        kind: kind.shape,
        params,
        slots,
        marchers,
        mode: "nearest",
        ctx,
    });
    return {
        params: { ...params, spots: n },
        spots: n,
        members: marchers.map((m, i) => {
            const slot = assignment[i]!;
            return {
                marcherId: m.id,
                slot,
                x: slots[slot]!.x,
                y: slots[slot]!.y,
            };
        }),
    };
}

/**
 * Whether `box` can **Close up**: a closed kind with holes, some members left (spec #385, ADR 0006
 * 2026-10-14 revision). An open kind (a line, an arc) keeps its holes.
 */
export const canCloseUp = (box: PlacedBox): boolean =>
    box.kind.closed !== undefined &&
    box.recipe.members.length > 0 &&
    box.recipe.members.length < box.spots;

/**
 * The params `box` closes up to for `n` members (fewer than its spots), in its mode and settings
 * (spec #385, "Close up"): Files takes its layout's version for the new count, or Short back
 * standing in (which the chip notes); Outline spreads round again; a spread keeps the count it was
 * laid out for, so it relaxes into the gap rather than reshuffles. The pivot stays where it was
 * with every spot filled. Null for an open kind or no holes.
 */
export function closedUpParams(
    box: PlacedBox,
    n: number,
    env: ToolEnv,
): unknown {
    const { kind, params, spots } = box;
    const closed = kind.closed;
    if (!closed || n <= 0 || n >= spots) return null;
    const d = closed.distribution(params, spots);
    const kept: Distribution =
        d.mode === "spread" ? { ...d, count: d.count ?? spots } : d;
    const next = closed.withDistribution(params, n, kept, env);
    // Grown from the pivot as it stood with all its spots, whatever the kind does with a count
    const key = env.pivot ?? pivotOf(params);
    const was = pivotPoint(kind.frameOf(params, spots), key);
    const frame = kind.frameOf(next, n);
    const now = pivotPoint(frame, key);
    const moved = kind.withFrame(next, n, {
        ...frame,
        center: {
            x: frame.center.x + was.x - now.x,
            y: frame.center.y + was.y - now.y,
        },
    });
    return kind.settle ? kind.settle(moved, n, env) : moved;
}

/**
 * **Close up**: `marchers` (the shape's members after some left) laid out again in the shape as
 * {@link closedUpParams} has it, by least travel. Null when the shape can't close up.
 */
export function closeUp(
    box: PlacedBox,
    marchers: readonly AssignMarcher[],
    env: ToolEnv,
    ctx: ShapeContext,
): BoxRecipe | null {
    const params = closedUpParams(box, marchers.length, env);
    return params === null ? null : placeOn(box.kind, params, marchers, ctx);
}

/**
 * **Re-split**: `marchers` split again by the evenness rule, inside the edges the box had with
 * all `spots` filled
 */
export function resplit(
    params: BoxParams,
    spots: number,
    marchers: readonly AssignMarcher[],
    env: ToolEnv,
    ctx: ShapeContext,
): BoxRecipe<BoxParams> {
    // Drawn again in the box's own axes, then turned and flipped back as it was
    const frame = boxFrame(params, spots);
    const flat = drawBox(
        { x: -frame.halfWidth, y: -frame.halfDepth },
        { x: frame.halfWidth, y: frame.halfDepth },
        marchers.length,
        // In the box's own axes, where the field's grid and lines don't apply
        { ...env, gridSnap: (p) => p, fieldLines: undefined },
    );
    const redrawn = flat
        ? snapToGrid(
              withBoxFrame(flat, {
                  ...frame,
                  center: frameToField(frame, flat.center),
              }),
              marchers.length,
              env,
          )
        : params;
    return placeOn(boxTool, redrawn, marchers, ctx);
}

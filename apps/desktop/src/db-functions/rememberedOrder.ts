/**
 * The order the show remembers for a line of marchers (pathways step 4f, DL-21): the Follow tool
 * reads it instead of guessing the order from where the marchers stand.
 *
 * A **form** is something the show stored that puts marchers in a sequence, or that ends one:
 *
 * - a follow trail (`readTrails`): its members by slot, the order they walk in;
 * - a placed Line or Arc (a shape recipe whose spots run along it): its members by slot, with the
 *   slots of members who left by hand kept as holes;
 * - any other placed shape (a box, a circle, a group) or an ungrouped mark: it takes the marchers
 *   into something with no line order, so it ends the order they had;
 * - an order set by hand (Set order and Reverse, step 4g: an order mark), which sets it, and one
 *   cleared by hand (Clear order), which ends it. They store no shape and move no one.
 *
 * Orders run leader first: a trail's leader (who walks first), a placed shape's first spot, the
 * first marcher swept through by hand.
 *
 * An order holds, like a placed shape, until a later form takes the marchers. Moving one marcher by
 * hand doesn't end it: the shape it leaves keeps its spot as a hole, and a shape with holes that
 * agrees with the order in force only carries it on.
 */
import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import {
    ORDER_CLEAR_RECIPE_KIND,
    ORDER_RECIPE_KIND,
    isOrderMarkKind,
    orderMarkBeat,
    readShapeRecipesOf,
    UNGROUPED_RECIPE_KIND,
} from "./shapeRecipes";
import { readTimelineEndBeats } from "./timelines";
import { readTrails, type MoveTrail } from "./timelineTrails";
import type { DbConnection, DbTransaction } from "./types";

/** A form stored in the show, as the order rule reads it */
export type OrderForm =
    | {
          /**
           * The beat the form is made at: its move's end (0 for homes), or an order mark's own beat
           */
          readonly endBeat: number;
          /** `set`: an order set by hand (step 4g) */
          readonly kind: "trail" | "line" | "set";
          /**
           * The members from one end to the other, by slot; null where a slot is a hole (a member
           * who moved off it by hand)
           */
          readonly order: readonly (number | null)[];
      }
    | {
          readonly endBeat: number;
          /**
           * A shape with no line order, or an ungrouped mark (`clear`), or an order cleared by hand
           * (`unset`, step 4g): the order its members had ends
           */
          readonly kind: "clear" | "unset";
          readonly marcherIds: readonly number[];
      };

const endsOrder = (
    form: OrderForm,
): form is Extract<OrderForm, { marcherIds: unknown }> =>
    form.kind === "clear" || form.kind === "unset";

const membersOf = (form: OrderForm): readonly number[] =>
    endsOrder(form)
        ? form.marcherIds
        : form.order.filter((m): m is number => m !== null);

/**
 * At the same beat a clear goes first, then shapes, then trails (what they walk in has the last
 * word), then what was set or cleared by hand there (step 4g), which is said about what stands
 * there
 */
const TIE: Record<OrderForm["kind"], number> = {
    clear: 0,
    line: 1,
    trail: 2,
    set: 3,
    unset: 4,
};

/**
 * Whether `members` (in order) is `order` kept to just them: a copy of the form in force with some
 * members gone, which carries the order on rather than redefining it. In the same direction only,
 * unless `eitherWay`: an order set by hand (step 4g) is carried on by a copy running either way, so
 * a shape's members changed by hand don't turn back an order reversed by hand; any other form
 * running the other way is a line placed reversed on purpose, which sets its own order.
 */
function agrees(
    order: readonly (number | null)[],
    members: readonly number[],
    eitherWay: boolean,
): boolean {
    const inOrder = new Set(order);
    if (!members.every((m) => inOrder.has(m))) return false;
    const keep = new Set(members);
    const kept = order.filter((m): m is number => m !== null && keep.has(m));
    return (
        kept.every((m, i) => m === members[i]) ||
        (eitherWay &&
            kept.every((m, i) => m === members[members.length - 1 - i]))
    );
}

/** Whether `members` (in order) carry on the line `form` sets (`agrees`) */
const carriesOn = (
    form: Exclude<OrderForm, { marcherIds: unknown }>,
    members: readonly number[],
): boolean => agrees(form.order, members, form.kind === "set");

/** The forms that count at `beat`, oldest first */
const formsAt = (forms: readonly OrderForm[], beat: number) =>
    forms
        .filter((f) => f.endBeat <= beat + 1e-9)
        .sort((a, b) => a.endBeat - b.endBeat || TIE[a.kind] - TIE[b.kind]);

/**
 * The remembered order of `ids` at `beat` (the follow window's start flag), or null when the show
 * doesn't remember one and the order is guessed.
 *
 * The forms made at or before `beat` that hold any of `ids` are read oldest first; each takes the
 * marchers it holds. A form with no line order (or an ungrouped mark) ends the order; a trail or a
 * placed Line or Arc sets it, unless it has holes and agrees with the order in force, which it
 * then carries on. The order in force must hold every one of `ids`, and is returned kept to them
 * (every other marcher of a line gives the 1st, 3rd, 5th…). One of `ids` missing from it while it
 * has exactly one hole goes back in that hole only when it's known they left it: the order before
 * that form held them there, or there was no order before it and they are in no form at all (a
 * shape saved, in its own move, with the hole they left). Anyone else is a stranger to the line.
 */
export function rememberedOrder(
    forms: readonly OrderForm[],
    ids: readonly number[],
    beat: number,
): number[] | null {
    const want = new Set(ids);
    if (want.size === 0) return null;
    const relevant = formsAt(forms, beat).filter((f) =>
        membersOf(f).some((m) => want.has(m)),
    );
    type Line = Exclude<OrderForm, { marcherIds: unknown }>;
    let current: Line | null = null;
    /** The form in force before `current` was set, which may say who left its holes */
    let before: Line | null = null;
    for (const form of relevant) {
        if (endsOrder(form)) {
            current = null;
            before = null;
            continue;
        }
        const holes = form.order.some((m) => m === null);
        if (holes && current && carriesOn(current, membersOf(form))) continue;
        before = current;
        current = form;
    }
    if (!current) return null;
    const order = current.order;
    const kept = order.filter((m) => m === null || want.has(m));
    const missing = [...want].filter((m) => !order.includes(m));
    if (missing.length === 0)
        return kept.filter((m): m is number => m !== null);
    if (missing.length !== 1 || order.filter((m) => m === null).length !== 1)
        return null;
    // The one who left the one hole, back where they were, if it's known they stood there
    const back = kept.map((m) => m ?? missing[0]!);
    const left = before
        ? carriesOn(before, back)
        : !relevant.some((f) => membersOf(f).includes(missing[0]!));
    return left ? back : null;
}

/** The kinds of placed shape whose spots run in an order along them: a Line and an Arc */
const LINE_KINDS: ReadonlySet<string> = new Set(["line", "arc"]);

/** The trails any of `want` follow, read in one go for the moves they follow one in */
async function trailsOf(
    db: DbConnection | DbTransaction,
    want: ReadonlySet<number>,
): Promise<MoveTrail[]> {
    // Only the moves where any of them follows a trail
    const T = schema.timeline_transitions;
    const A = schema.timeline_assignments;
    const trailMoves = await db
        .selectDistinct({ timelineId: T.timeline_id })
        .from(A)
        .innerJoin(T, eq(T.id, A.transition_id))
        .where(
            and(
                inArray(A.marcher_id, [...want]),
                eq(T.path_style, "follow_the_leader"),
            ),
        )
        .all();
    return (
        await readTrails(
            db,
            trailMoves.map((m) => m.timelineId),
        )
    ).filter((trail) => trail.marcherIds.some((m) => want.has(m)));
}

/**
 * The forms that hold any of `marcherIds`: their trails, and the shape recipes and ungrouped marks
 * they are in. A form in a move that's gone is skipped.
 */
export async function readOrderForms(
    db: DbConnection | DbTransaction,
    marcherIds: readonly number[],
): Promise<OrderForm[]> {
    if (marcherIds.length === 0) return [];
    const want = new Set(marcherIds);
    const recipes = await readShapeRecipesOf({ db, marcherIds });
    const trails = await trailsOf(db, want);
    const endBeats = await readTimelineEndBeats(db, [
        ...recipes.flatMap((r) =>
            r.timelineId === null ? [] : [r.timelineId],
        ),
        ...trails.map((t) => t.timelineId),
    ]);
    const forms: OrderForm[] = [];
    for (const recipe of recipes) {
        const moveEnd =
            recipe.timelineId === null ? 0 : endBeats.get(recipe.timelineId);
        if (moveEnd === undefined || recipe.members.length === 0) continue;
        // An order mark is made at its own beat; one saved before marks kept it, at its move's end
        const endBeat = isOrderMarkKind(recipe.kind)
            ? (orderMarkBeat(recipe.params) ?? moveEnd)
            : moveEnd;
        if (recipe.kind === ORDER_CLEAR_RECIPE_KIND) {
            forms.push({
                endBeat,
                kind: "unset",
                marcherIds: recipe.members.map((m) => m.marcherId),
            });
            continue;
        }
        const set = recipe.kind === ORDER_RECIPE_KIND;
        if (
            !set &&
            (recipe.kind === UNGROUPED_RECIPE_KIND ||
                !LINE_KINDS.has(recipe.kind))
        ) {
            forms.push({
                endBeat,
                kind: "clear",
                marcherIds: recipe.members.map((m) => m.marcherId),
            });
            continue;
        }
        const stored = (recipe.params as { spots?: unknown } | null)?.spots;
        const top = Math.max(-1, ...recipe.members.map((m) => m.slot));
        const spots = Math.max(
            typeof stored === "number" && Number.isInteger(stored) ? stored : 0,
            top + 1,
        );
        const order: (number | null)[] = Array.from(
            { length: spots },
            () => null,
        );
        for (const m of recipe.members) order[m.slot] = m.marcherId;
        forms.push({ endBeat, kind: set ? "set" : "line", order });
    }
    for (const trail of trails) {
        const endBeat = endBeats.get(trail.timelineId);
        if (endBeat === undefined) continue;
        // Stored tail first (the leader first when reversed); orders run leader first
        const order = trail.reverse
            ? trail.marcherIds
            : [...trail.marcherIds].reverse();
        forms.push({ endBeat, kind: "trail", order });
    }
    return forms;
}

/** The remembered order of `ids` at `beat` as the show has it now (`rememberedOrder`), or null */
export async function rememberedOrderAt(
    db: DbConnection | DbTransaction,
    ids: readonly number[],
    beat: number,
): Promise<number[] | null> {
    return rememberedOrder(await readOrderForms(db, ids), ids, beat);
}

/** A line in force at a beat (`ordersInForce`): its marchers in order, leader first */
export interface OrderInForce {
    readonly order: readonly number[];
    /** The form that set it */
    readonly kind: "trail" | "line" | "set";
}

/**
 * Every line whose order holds at `beat` (Show order's Always, step 4g): each form that sets an
 * order, kept to the marchers no later form has taken, with two or more left. A copy with holes
 * that agrees with the line its members are in carries that line on, as `rememberedOrder` reads
 * it; holes are left out.
 */
export function ordersInForce(
    forms: readonly OrderForm[],
    beat: number,
): OrderInForce[] {
    const owner = new Map<number, OrderForm>();
    for (const form of formsAt(forms, beat)) {
        const members = membersOf(form);
        if (endsOrder(form)) {
            for (const m of members) owner.delete(m);
            continue;
        }
        const now = owner.get(members[0]!);
        if (
            form.order.some((m) => m === null) &&
            now !== undefined &&
            !endsOrder(now) &&
            members.every((m) => owner.get(m) === now) &&
            carriesOn(now, members)
        )
            continue;
        for (const m of members) owner.set(m, form);
    }
    const out: OrderInForce[] = [];
    for (const form of new Set(owner.values())) {
        if (endsOrder(form)) continue;
        const order = form.order.filter(
            (m): m is number => m !== null && owner.get(m) === form,
        );
        if (order.length >= 2) out.push({ order, kind: form.kind });
    }
    return out;
}

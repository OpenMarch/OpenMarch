import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbConnection, DbTransaction } from "./types";

/**
 * Shape recipes (ADR 0006): how a placed shape laid out its marchers, stored beside the positions
 * so the shape can be reopened and edited. Positions stay the source of truth; a member's
 * override is where it stands less where its recipe put it (`x`, `y`).
 *
 * A recipe belongs to a move (`timelineId`), or to the homes (`null`), and lists only marchers
 * whose positions are in that move. An order mark (pathways step 4g, `ORDER_MARK_KINDS`) is no
 * shape: it keeps its own beat (`orderMarkBeat`), and one made since review 3 is stored in no move
 * (`null` too), so deleting the move its marchers stand still in never takes it. Every reader that
 * takes `null` for the homes' shapes skips the marks (`shapeRecipesOnly`, or a kind no shape tool
 * reads). A marcher is in at most one recipe at a beat: saving a recipe
 * takes its marchers out of the other recipes of every move ending at the beat it's placed at
 * (its move's end: a move split off a page's shares it, UI-25), not of a move that only passes
 * over it (an Expert move on another layer), and deletes any recipe left with no one.
 * Writes run inside the edit that placed the positions, so the shape and its positions are one
 * undo step.
 */

export interface ShapeRecipeRecord {
    readonly kind: string;
    readonly kindVersion: number;
    /** The kind's parameters, JSON-serializable, in field units */
    readonly params: unknown;
    readonly orderMode: string;
    readonly reverse: boolean;
}

export interface ShapeRecipeMember {
    readonly marcherId: number;
    readonly slot: number;
    /** Where the recipe put the marcher, without any override */
    readonly x: number;
    readonly y: number;
}

export interface StoredShapeRecipe extends ShapeRecipeRecord {
    readonly id: number;
    readonly timelineId: number | null;
    readonly members: readonly ShapeRecipeMember[];
}

const recipes = schema.timeline_shape_recipes;
const members = schema.timeline_shape_recipe_marchers;

/** Where-clause for the recipes nobody is in */
const noMembers = () =>
    sql`NOT EXISTS (SELECT 1 FROM ${members} WHERE ${members.recipe_id} = ${recipes.id})`;

const sameMove = (timelineId: number | null) =>
    timelineId === null
        ? isNull(recipes.timeline_id)
        : eq(recipes.timeline_id, timelineId);

/**
 * Saves a recipe for `members` in move `timelineId` (`null` for homes), replacing `replaces` when
 * given (an edited recipe keeps its id). A member whose positions aren't in the move is left out
 * (a selection over several moves); the rest leave the other recipes of every move ending at the
 * beat it's placed at, and recipes left empty are deleted.
 *
 * An order mark (pathways step 4g, `ORDER_MARK_KINDS`) keeps every member, those standing still in
 * its move too, and takes them out of the other marks at its own beat (`orderMarkBeat`) only.
 * A shape takes its members out of the marks whose own beat is the one it's placed at, not of
 * marks only stored in a move ending there. `keepOrderMarks` leaves the marks at its beat alone: a
 * shape's members changed by hand (one dragged off) don't redefine an order set by hand there.
 *
 * @returns the recipe's id
 */
export async function saveShapeRecipeInTransaction({
    tx,
    timelineId,
    recipe,
    members: placed,
    replaces,
    keepOrderMarks = false,
}: {
    tx: DbTransaction;
    timelineId: number | null;
    recipe: ShapeRecipeRecord;
    members: readonly ShapeRecipeMember[];
    replaces?: number;
    keepOrderMarks?: boolean;
}): Promise<number> {
    const orderMark = isOrderMarkKind(recipe.kind);
    const own = orderMark ? null : await moveMembersOf(tx, timelineId);
    if (own) placed = placed.filter((m) => own.has(m.marcherId));
    const marcherIds = placed.map((m) => m.marcherId);
    const values = {
        timeline_id: timelineId,
        kind: recipe.kind,
        kind_version: recipe.kindVersion,
        params: JSON.stringify(recipe.params),
        order_mode: recipe.orderMode,
        reverse: recipe.reverse,
    };

    let id: number;
    if (replaces !== undefined) {
        await tx
            .update(recipes)
            .set(values)
            .where(eq(recipes.id, replaces))
            .run();
        await tx.delete(members).where(eq(members.recipe_id, replaces)).run();
        id = replaces;
    } else {
        const inserted = await tx
            .insert(recipes)
            .values(values)
            .returning({ id: recipes.id })
            .get();
        id = inserted.id;
    }

    // Out of the other recipes at the beat it's placed at
    if (marcherIds.length > 0)
        await takeOutOfOthers(tx, {
            id,
            timelineId,
            recipe,
            marcherIds,
            keepOrderMarks,
        });

    if (placed.length > 0) {
        await tx
            .insert(members)
            .values(
                placed.map((m) => ({
                    recipe_id: id,
                    marcher_id: m.marcherId,
                    slot: m.slot,
                    x: m.x,
                    y: m.y,
                })),
            )
            .run();
    }

    await deleteEmptyRecipes(tx);
    return id;
}

/**
 * Takes `marcherIds` out of the other recipes at the beat recipe `id` is placed at
 * (`saveShapeRecipeInTransaction`)
 */
async function takeOutOfOthers(
    tx: DbTransaction,
    {
        id,
        timelineId,
        recipe,
        marcherIds,
        keepOrderMarks,
    }: {
        id: number;
        timelineId: number | null;
        recipe: ShapeRecipeRecord;
        marcherIds: readonly number[];
        keepOrderMarks: boolean;
    },
): Promise<void> {
    const orderMark = isOrderMarkKind(recipe.kind);
    const beat = orderMark
        ? (orderMarkBeat(recipe.params) ?? (await placedBeatOf(tx, timelineId)))
        : await placedBeatOf(tx, timelineId);
    const shapes = orderMark
        ? []
        : await tx
              .select({ id: recipes.id })
              .from(recipes)
              .where(
                  and(
                      await movesEndingAtPlacedBeat(tx, timelineId),
                      notInArray(recipes.id, [id]),
                      notInArray(recipes.kind, [...ORDER_MARK_KINDS]),
                  ),
              )
              .all();
    const marks =
        orderMark || !keepOrderMarks
            ? (await orderMarksAtBeat(tx, beat)).filter((m) => m !== id)
            : [];
    const others = [...shapes.map((r) => r.id), ...marks];
    if (others.length > 0) {
        await tx
            .delete(members)
            .where(
                and(
                    inArray(members.recipe_id, others),
                    inArray(members.marcher_id, [...marcherIds]),
                ),
            )
            .run();
    }
}

/**
 * The beat an order mark (pathways step 4g) is said about, as stored in its params: the beat it was
 * set at, which needn't be its move's end (a line standing still on a page is in the move before).
 * Undefined for a mark saved before marks kept their own beat, which is read at its move's end.
 */
export function orderMarkBeat(params: unknown): number | undefined {
    const beat = (params as { beat?: unknown } | null)?.beat;
    return typeof beat === "number" && Number.isFinite(beat) ? beat : undefined;
}

/** Two beats the same, as stored */
const sameBeat = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** The beat a recipe of move `timelineId` is placed at: the move's end (0 for homes) */
async function placedBeatOf(
    tx: DbTransaction,
    timelineId: number | null,
): Promise<number> {
    if (timelineId === null) return 0;
    const t = schema.timelines;
    const move = await tx
        .select({ end: t.end_beat })
        .from(t)
        .where(eq(t.id, timelineId))
        .get();
    return move?.end ?? 0;
}

/**
 * The order marks said about `beat`: their own beat (`orderMarkBeat`), or, for a mark without one,
 * its move's end (0 for homes)
 */
async function orderMarksAtBeat(
    tx: DbTransaction,
    beat: number,
): Promise<number[]> {
    const t = schema.timelines;
    const rows = await tx
        .select({
            id: recipes.id,
            timelineId: recipes.timeline_id,
            params: recipes.params,
            end: t.end_beat,
        })
        .from(recipes)
        .leftJoin(t, eq(t.id, recipes.timeline_id))
        .where(inArray(recipes.kind, [...ORDER_MARK_KINDS]))
        .all();
    return rows
        .filter((r) => {
            const own = orderMarkBeat(JSON.parse(r.params) as unknown);
            const at = own ?? (r.timelineId === null ? 0 : r.end);
            return at !== null && sameBeat(at, beat);
        })
        .map((r) => r.id);
}

/**
 * Whether move `timelineId` holds any of `marcherIds`, so a recipe saved in it keeps someone (the
 * homes hold everyone). A move a shape is only carried onto, its members standing still from an
 * earlier move, holds none of them (#485).
 */
export async function moveHoldsAnyOf(
    tx: DbTransaction,
    timelineId: number | null,
    marcherIds: readonly number[],
): Promise<boolean> {
    if (timelineId === null) return true;
    const own = await moveMembers(tx, timelineId);
    return marcherIds.some((id) => own.has(id));
}

/** The marchers with positions in move `timelineId`, or null for the homes, which hold everyone */
const moveMembersOf = (tx: DbTransaction, timelineId: number | null) =>
    timelineId === null ? null : moveMembers(tx, timelineId);

/** The marchers with positions in move `timelineId` */
async function moveMembers(
    tx: DbTransaction,
    timelineId: number,
): Promise<Set<number>> {
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const rows = await tx
        .selectDistinct({ id: a.marcher_id })
        .from(a)
        .innerJoin(t, eq(t.id, a.transition_id))
        .where(eq(t.timeline_id, timelineId))
        .all();
    return new Set(rows.map((r) => r.id));
}

/**
 * Which recipes stand at the beat a recipe of move `timelineId` is placed at (its end; homes for
 * `null`): those of every move ending at that beat
 */
async function movesEndingAtPlacedBeat(
    tx: DbTransaction,
    timelineId: number | null,
) {
    if (timelineId === null) return sameMove(null);
    const t = schema.timelines;
    const move = await tx
        .select({ end: t.end_beat })
        .from(t)
        .where(eq(t.id, timelineId))
        .get();
    if (!move) return sameMove(timelineId);
    return inArray(
        recipes.timeline_id,
        tx.select({ id: t.id }).from(t).where(eq(t.end_beat, move.end)),
    );
}

/**
 * Moves every recipe of move `from` into move `to` (a merge, UI-25), which their marchers' places
 * there follow: those marchers leave `to`'s other recipes, and recipes left empty are deleted.
 *
 * Order marks (pathways step 4g) move too, but say nothing about places: the members of `from`'s
 * shapes only leave `to`'s shapes, and `to`'s marks stay as they are, so a merge never ends part
 * of an order set by hand. A mark keeps its own beat (`orderMarkBeat`), so a merge that fits
 * `from` to `to`'s counts doesn't move it; one from before marks kept their own beat is given
 * `from`'s end, the beat it was read at.
 */
export async function moveShapeRecipesInTransaction({
    tx,
    from,
    to,
}: {
    tx: DbTransaction;
    from: number;
    to: number;
}): Promise<void> {
    if (!(await hasShapeRecipes(tx))) return;
    const moving = await tx
        .select({ id: recipes.id, kind: recipes.kind })
        .from(recipes)
        .where(eq(recipes.timeline_id, from))
        .all();
    if (moving.length === 0) return;
    const movingIds = moving.map((r) => r.id);
    const movingShapes = moving
        .filter((r) => !isOrderMarkKind(r.kind))
        .map((r) => r.id);
    const marcherIds =
        movingShapes.length === 0
            ? []
            : (
                  await tx
                      .selectDistinct({ id: members.marcher_id })
                      .from(members)
                      .where(inArray(members.recipe_id, movingShapes))
                      .all()
              ).map((m) => m.id);
    const theirs = (
        await tx
            .select({ id: recipes.id })
            .from(recipes)
            .where(
                and(
                    eq(recipes.timeline_id, to),
                    notInArray(recipes.kind, [...ORDER_MARK_KINDS]),
                ),
            )
            .all()
    ).map((r) => r.id);
    if (theirs.length > 0 && marcherIds.length > 0)
        await tx
            .delete(members)
            .where(
                and(
                    inArray(members.recipe_id, theirs),
                    inArray(members.marcher_id, [...marcherIds]),
                ),
            )
            .run();
    await keepOrderMarksBeat(
        tx,
        moving.filter((r) => isOrderMarkKind(r.kind)).map((r) => r.id),
        from,
    );
    await tx
        .update(recipes)
        .set({ timeline_id: to })
        .where(inArray(recipes.id, movingIds))
        .run();
    await deleteEmptyRecipes(tx, to);
}

/**
 * Writes `from`'s end into the order marks `markIds` that have no beat of their own, before they
 * leave move `from`, so they stay said about the beat they were read at
 */
async function keepOrderMarksBeat(
    tx: DbTransaction,
    markIds: readonly number[],
    from: number,
): Promise<void> {
    if (markIds.length === 0) return;
    const beat = await placedBeatOf(tx, from);
    for (const mark of await recipesById(tx, markIds)) {
        if (orderMarkBeat(mark.params) !== undefined) continue;
        await tx
            .update(recipes)
            .set({
                params: JSON.stringify({
                    ...(mark.params as object | null),
                    beat,
                }),
            })
            .where(eq(recipes.id, mark.id))
            .run();
    }
}

/**
 * Takes `marcherIds` out of the order marks (pathways step 4g) said about the beat move
 * `timelineId` ends at (their own beat, `orderMarkBeat`), and deletes marks left with no one: an
 * edit to that move's trail is newer than an order set or cleared by hand there, so the trail's
 * order holds again (the latest action wins). A mark stored in the move but said about a later
 * beat (the line stood still there) is left alone. Run inside that edit's transaction, so undo
 * brings the marks back with it.
 */
export async function dropOrderMarksInTransaction(
    tx: DbTransaction,
    timelineId: number,
    marcherIds: readonly number[],
): Promise<void> {
    if (marcherIds.length === 0 || !(await hasShapeRecipes(tx))) return;
    const marks = await orderMarksAtBeat(
        tx,
        await placedBeatOf(tx, timelineId),
    );
    if (marks.length === 0) return;
    await tx
        .delete(members)
        .where(
            and(
                inArray(members.recipe_id, marks),
                inArray(members.marcher_id, [...new Set(marcherIds)]),
            ),
        )
        .run();
    await deleteEmptyRecipes(tx);
}

/**
 * Moves the order marks (pathways step 4g) that keep their own beat (`orderMarkBeat`) after a
 * page or beat edit (the page ripple): `place` gives a mark's new beat from its old one, or null
 * when the page it was set on is gone, which deletes it. A mark without a beat of its own is read
 * at its move's end, which the ripple moves already.
 */
export async function rippleOrderMarksInTransaction(
    tx: DbTransaction,
    place: (beat: number) => number | null,
): Promise<void> {
    if (!(await hasShapeRecipes(tx))) return;
    const marks = await tx
        .select({ id: recipes.id, params: recipes.params })
        .from(recipes)
        .where(inArray(recipes.kind, [...ORDER_MARK_KINDS]))
        .all();
    const gone: number[] = [];
    const kept: { id: number; was: number; now: number }[] = [];
    for (const mark of marks) {
        const params = JSON.parse(mark.params) as object | null;
        const beat = orderMarkBeat(params);
        if (beat === undefined) continue;
        const next = place(beat);
        if (next === null) {
            gone.push(mark.id);
            continue;
        }
        kept.push({ id: mark.id, was: beat, now: next });
        if (!sameBeat(next, beat))
            await tx
                .update(recipes)
                .set({ params: JSON.stringify({ ...params, beat: next }) })
                .where(eq(recipes.id, mark.id))
                .run();
    }
    if (gone.length > 0)
        await tx.delete(recipes).where(inArray(recipes.id, gone)).run();
    await settleMarksMetInTransaction(tx, kept);
}

/**
 * Marks the ripple brought onto one beat: a marcher stays in the one that was latest before it
 * (then the newest), as saving a mark takes its marchers out of the others at its beat. Marks
 * left empty are deleted.
 */
async function settleMarksMetInTransaction(
    tx: DbTransaction,
    kept: readonly { id: number; was: number; now: number }[],
): Promise<void> {
    const met = kept.filter((a) =>
        kept.some((b) => b.id !== a.id && sameBeat(a.now, b.now)),
    );
    if (met.length === 0) return;
    const rows = await tx
        .select({ recipe: members.recipe_id, marcher: members.marcher_id })
        .from(members)
        .where(
            inArray(
                members.recipe_id,
                met.map((m) => m.id),
            ),
        )
        .all();
    const latestFirst = [...met].sort((a, b) => b.was - a.was || b.id - a.id);
    const done = new Set<number>();
    for (const mark of latestFirst) {
        if (done.has(mark.id)) continue;
        const group = latestFirst.filter((m) => sameBeat(m.now, mark.now));
        const claimed = new Set<number>();
        for (const m of group) {
            done.add(m.id);
            const theirs = rows
                .filter((r) => r.recipe === m.id)
                .map((r) => r.marcher);
            const taken = theirs.filter((id) => claimed.has(id));
            if (taken.length > 0)
                await tx
                    .delete(members)
                    .where(
                        and(
                            eq(members.recipe_id, m.id),
                            inArray(members.marcher_id, taken),
                        ),
                    )
                    .run();
            for (const id of theirs) claimed.add(id);
        }
    }
    await tx
        .delete(recipes)
        .where(
            and(
                inArray(
                    recipes.id,
                    met.map((m) => m.id),
                ),
                noMembers(),
            ),
        )
        .run();
}

/**
 * Marchers `marcherIds` split off move `from` into move `to` (UI-25): a recipe of `from` they make
 * up the whole of goes with them; from any other they're dropped, since their positions are no
 * longer in its move. Recipes left empty are deleted.
 *
 * Order marks (pathways step 4g) stay in `from` whole: a split moves no one, and a mark is read by
 * its move's end, which the move split off shares, so the order set by hand holds for everyone.
 */
export async function splitShapeRecipesInTransaction({
    tx,
    from,
    to,
    marcherIds,
}: {
    tx: DbTransaction;
    from: number;
    to: number;
    marcherIds: readonly number[];
}): Promise<void> {
    if (marcherIds.length === 0 || !(await hasShapeRecipes(tx))) return;
    const split = new Set(marcherIds);
    const theirs = await recipesById(
        tx,
        (
            await tx
                .select({ id: recipes.id })
                .from(recipes)
                .where(eq(recipes.timeline_id, from))
                .all()
        ).map((r) => r.id),
    );
    const shapes = theirs.filter((r) => !isOrderMarkKind(r.kind));
    const whole = shapes.filter(
        (r) =>
            r.members.length > 0 &&
            r.members.every((m) => split.has(m.marcherId)),
    );
    if (whole.length > 0)
        await tx
            .update(recipes)
            .set({ timeline_id: to })
            .where(
                inArray(
                    recipes.id,
                    whole.map((r) => r.id),
                ),
            )
            .run();
    const rest = shapes.filter((r) => !whole.includes(r)).map((r) => r.id);
    if (rest.length > 0)
        await tx
            .delete(members)
            .where(
                and(
                    inArray(members.recipe_id, rest),
                    inArray(members.marcher_id, [...split]),
                ),
            )
            .run();
    await deleteEmptyRecipes(tx, from);
}

/**
 * The kind of a recipe that marks its members **ungrouped** (`ungroupShape`, `UNGROUPED_KIND` in
 * `shapes/placed/placedBox.ts`). It stores no shape, so code asking whether a marcher is in a
 * shape skips it (`shapeRecipesOnly`).
 */
export const UNGROUPED_RECIPE_KIND = "ungrouped";

/**
 * The kind of a recipe that holds a line's order set by hand (pathways step 4g, DL-26): its members
 * by slot, the leader first. It stores no shape and moves no one. Saving one takes its marchers out
 * of the other order marks at its beat only; a shape saved later at that beat takes them out of it.
 */
export const ORDER_RECIPE_KIND = "order";

/**
 * The kind of a recipe that ends its members' order by hand (Clear order, pathways step 4g): as an
 * ungrouped mark ends it, but leaving the shapes they're in alone
 */
export const ORDER_CLEAR_RECIPE_KIND = "orderClear";

/** The order marks: kinds that store no shape, only who is in which order */
export const ORDER_MARK_KINDS: ReadonlySet<string> = new Set([
    ORDER_RECIPE_KIND,
    ORDER_CLEAR_RECIPE_KIND,
]);

/** Whether a recipe of `kind` is an order mark rather than a shape */
export const isOrderMarkKind = (kind: string): boolean =>
    ORDER_MARK_KINDS.has(kind);

/** Where-clause for the recipes that describe a shape: every kind but an ungrouped or order mark */
export const shapeRecipesOnly = () =>
    notInArray(recipes.kind, [UNGROUPED_RECIPE_KIND, ...ORDER_MARK_KINDS]);

/**
 * After `marcherIds` are cleared off moves `timelineIds`, takes those no longer in a move out of
 * its ungrouped marks, and deletes a mark left with nobody. Only cleared marchers: a marcher whose
 * rows are only re-cut into other moves over the same page (Basic's mid-page points) stays in. A mark lists only marchers in its move, as every recipe does:
 * one still naming a marcher cleared off its page would keep hiding the earlier shape that marcher
 * now stands in (Clear this page reverts the page, its Ungroup included). Real shapes' recipes are
 * left to their writers.
 */
export async function dropUngroupedLeavers(
    tx: DbTransaction,
    timelineIds: readonly number[],
    marcherIds: readonly number[],
): Promise<void> {
    if (
        timelineIds.length === 0 ||
        marcherIds.length === 0 ||
        !(await hasShapeRecipes(tx))
    )
        return;
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const marks = tx
        .select({ id: recipes.id })
        .from(recipes)
        .where(
            and(
                inArray(recipes.timeline_id, [...new Set(timelineIds)]),
                eq(recipes.kind, UNGROUPED_RECIPE_KIND),
            ),
        );
    const stillInMove = sql`EXISTS (SELECT 1 FROM ${a} INNER JOIN ${t} ON ${t.id} = ${a.transition_id} INNER JOIN ${recipes} r2 ON r2.id = ${members.recipe_id} WHERE ${a.marcher_id} = ${members.marcher_id} AND ${t.timeline_id} = r2.timeline_id)`;
    await tx
        .delete(members)
        .where(
            and(
                inArray(members.recipe_id, marks),
                inArray(members.marcher_id, [...new Set(marcherIds)]),
                sql`NOT ${stillInMove}`,
            ),
        )
        .run();
    await tx
        .delete(recipes)
        .where(
            and(
                inArray(recipes.timeline_id, [...new Set(timelineIds)]),
                eq(recipes.kind, UNGROUPED_RECIPE_KIND),
                noMembers(),
            ),
        )
        .run();
}

/** Whether the show stores shape recipes at all (a database from before them doesn't) */
export async function hasShapeRecipes(
    tx: DbConnection | DbTransaction,
): Promise<boolean> {
    const row = await tx.get<{ name: string } | undefined>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'timeline_shape_recipes'`,
    );
    return row !== undefined;
}

/** Deletes move `timelineId`'s recipes nobody is in anymore (every move's when omitted) */
export async function deleteEmptyRecipes(
    tx: DbTransaction,
    timelineId?: number | null,
): Promise<void> {
    const empty = noMembers();
    await tx
        .delete(recipes)
        .where(
            timelineId === undefined ? empty : and(sameMove(timelineId), empty),
        )
        .run();
}

/** The recipes of move `timelineId` (`null` for homes) that any of `marcherIds` are in. */
export async function readShapeRecipes({
    db,
    timelineId,
    marcherIds,
}: {
    db: DbConnection | DbTransaction;
    timelineId: number | null;
    marcherIds: readonly number[];
}): Promise<StoredShapeRecipe[]> {
    if (marcherIds.length === 0) return [];
    const hits = await db
        .selectDistinct({ id: members.recipe_id })
        .from(members)
        .innerJoin(recipes, eq(recipes.id, members.recipe_id))
        .where(
            and(
                sameMove(timelineId),
                inArray(members.marcher_id, [...new Set(marcherIds)]),
            ),
        )
        .all();
    return recipesById(
        db,
        hits.map((h) => h.id),
    );
}

/** Recipe `id` as stored, or null when there's none (a save that kept no one deletes it) */
export async function readShapeRecipe(
    db: DbConnection | DbTransaction,
    id: number,
): Promise<StoredShapeRecipe | null> {
    return (await recipesById(db, [id]))[0] ?? null;
}

/** Every recipe that any of `marcherIds` is in, in any move */
export async function readShapeRecipesOf({
    db,
    marcherIds,
}: {
    db: DbConnection | DbTransaction;
    marcherIds: readonly number[];
}): Promise<StoredShapeRecipe[]> {
    if (marcherIds.length === 0) return [];
    const hits = await db
        .selectDistinct({ id: members.recipe_id })
        .from(members)
        .where(inArray(members.marcher_id, [...new Set(marcherIds)]))
        .all();
    return recipesById(
        db,
        hits.map((h) => h.id),
    );
}

/** Every recipe in the show */
export async function readAllShapeRecipes(
    db: DbConnection | DbTransaction,
): Promise<StoredShapeRecipe[]> {
    const rows = await db.select({ id: recipes.id }).from(recipes).all();
    return recipesById(
        db,
        rows.map((r) => r.id),
    );
}

/** Recipes by id, with their members in slot order */
async function recipesById(
    db: DbConnection | DbTransaction,
    ids: readonly number[],
): Promise<StoredShapeRecipe[]> {
    if (ids.length === 0) return [];
    const rows = await db
        .select()
        .from(recipes)
        .where(inArray(recipes.id, [...ids]))
        .all();
    const memberRows = await db
        .select()
        .from(members)
        .where(inArray(members.recipe_id, [...ids]))
        .all();
    return rows
        .sort((a, b) => a.id - b.id)
        .map((row) => ({
            id: row.id,
            timelineId: row.timeline_id,
            kind: row.kind,
            kindVersion: row.kind_version,
            params: JSON.parse(row.params) as unknown,
            orderMode: row.order_mode,
            reverse: row.reverse,
            members: memberRows
                .filter((m) => m.recipe_id === row.id)
                .sort((a, b) => a.slot - b.slot)
                .map((m) => ({
                    marcherId: m.marcher_id,
                    slot: m.slot,
                    x: m.x,
                    y: m.y,
                })),
        }));
}

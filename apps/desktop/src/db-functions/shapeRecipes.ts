import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "./types";

/**
 * Shape recipes (ADR 0006): how a placed shape laid out its marchers, stored beside the positions
 * so the shape can be reopened and edited. Positions stay the source of truth; a member's
 * override is where it stands less where its recipe put it (`x`, `y`).
 *
 * A recipe belongs to a move (`timelineId`), or to the homes (`null`), and lists only marchers
 * whose positions are in that move. A marcher is in at most one recipe at a beat: saving a recipe
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
 * @returns the recipe's id
 */
export async function saveShapeRecipeInTransaction({
    tx,
    timelineId,
    recipe,
    members: placed,
    replaces,
}: {
    tx: DbTransaction;
    timelineId: number | null;
    recipe: ShapeRecipeRecord;
    members: readonly ShapeRecipeMember[];
    replaces?: number;
}): Promise<number> {
    const own = timelineId === null ? null : await moveMembers(tx, timelineId);
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
    if (marcherIds.length > 0) {
        const others = await tx
            .select({ id: recipes.id })
            .from(recipes)
            .where(
                and(
                    await movesEndingAtPlacedBeat(tx, timelineId),
                    notInArray(recipes.id, [id]),
                ),
            )
            .all();
        if (others.length > 0) {
            await tx
                .delete(members)
                .where(
                    and(
                        inArray(
                            members.recipe_id,
                            others.map((r) => r.id),
                        ),
                        inArray(members.marcher_id, marcherIds),
                    ),
                )
                .run();
        }
    }

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
        .select({ id: recipes.id })
        .from(recipes)
        .where(eq(recipes.timeline_id, from))
        .all();
    if (moving.length === 0) return;
    const movingIds = moving.map((r) => r.id);
    const marcherIds = (
        await tx
            .selectDistinct({ id: members.marcher_id })
            .from(members)
            .where(inArray(members.recipe_id, movingIds))
            .all()
    ).map((m) => m.id);
    const theirs = (
        await tx
            .select({ id: recipes.id })
            .from(recipes)
            .where(eq(recipes.timeline_id, to))
            .all()
    ).map((r) => r.id);
    if (theirs.length > 0 && marcherIds.length > 0)
        await tx
            .delete(members)
            .where(
                and(
                    inArray(members.recipe_id, theirs),
                    inArray(members.marcher_id, marcherIds),
                ),
            )
            .run();
    await tx
        .update(recipes)
        .set({ timeline_id: to })
        .where(inArray(recipes.id, movingIds))
        .run();
    await deleteEmptyRecipes(tx, to);
}

/**
 * Marchers `marcherIds` split off move `from` into move `to` (UI-25): a recipe of `from` they make
 * up the whole of goes with them; from any other they're dropped, since their positions are no
 * longer in its move. Recipes left empty are deleted.
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
    const whole = theirs.filter(
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
    const rest = theirs.filter((r) => !whole.includes(r)).map((r) => r.id);
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
    const empty = sql`NOT EXISTS (SELECT 1 FROM ${members} WHERE ${members.recipe_id} = ${recipes.id})`;
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

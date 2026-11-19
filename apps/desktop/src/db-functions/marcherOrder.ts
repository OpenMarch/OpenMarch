/**
 * A line's order set by hand (pathways step 4g, DL-26..DL-29): Set order, Reverse and Clear order.
 *
 * The order is stored as an **order mark**, a shape recipe of kind `order` (or `orderClear` for
 * Clear) in no move (`timeline_id` NULL). It keeps the beat it was set at in its params, and
 * `rememberedOrder` reads it there, as a form made at that beat. It isn't kept in a move because a
 * line standing still on page 3 has its positions in page 2's move: a mark stored there would go
 * when that move is deleted (its marchers moved back), and an edit on page 2 must never change
 * page 3's order. The page ripple moves its beat with the page it was set on. It goes when its
 * marchers do (its member rows, then `deleteEmptyRecipes`). A mark stores no shape and moves no
 * one: placed shapes don't show it, and it doesn't take its marchers out of the shapes they're in.
 * A shape placed later at its beat takes them out of it (the later form wins), and so does another
 * mark there.
 *
 * Reusing the recipe tables needs no schema change (v0.1.7 files have none of them; the app's own
 * migrations add them), and an older build skips a kind it doesn't know.
 */
import { schema } from "@/global/database/db";
import { transactionWithHistory } from "./history";
import {
    ORDER_CLEAR_RECIPE_KIND,
    ORDER_RECIPE_KIND,
    saveShapeRecipeInTransaction,
    type ShapeRecipeRecord,
} from "./shapeRecipes";
import type { DbConnection, DbTransaction } from "./types";

type XY = { readonly x: number; readonly y: number };

/**
 * What an order mark stores: its slots (no holes when made) and the beat it's said about, which
 * is where it's read (`orderMarkBeat`)
 */
const orderRecipe = (
    kind: string,
    spots: number,
    beat: number,
): ShapeRecipeRecord => ({
    kind,
    kindVersion: 1,
    params: { spots, beat },
    orderMode: "keep",
    reverse: false,
});

/**
 * Sets the order of `order`'s marchers (leader first) at `beat`: an order mark in no move, said
 * about `beat`. `at` is where each stands, kept with the mark for reference.
 *
 * @returns the mark's recipe id
 */
export async function setMarcherOrderInTransaction(
    tx: DbTransaction,
    {
        beat,
        order,
        at,
    }: {
        beat: number;
        order: readonly number[];
        at?: ReadonlyMap<number, XY>;
    },
): Promise<number> {
    const ids = [...new Set(order)];
    if (ids.length < 2) throw new Error("An order needs two or more marchers");
    return await saveShapeRecipeInTransaction({
        tx,
        timelineId: null,
        recipe: orderRecipe(ORDER_RECIPE_KIND, ids.length, beat),
        members: ids.map((marcherId, slot) => ({
            marcherId,
            slot,
            x: at?.get(marcherId)?.x ?? 0,
            y: at?.get(marcherId)?.y ?? 0,
        })),
    });
}

/**
 * Ends the order of `marcherIds` at `beat` (Clear order): a clearing mark in no move, said about
 * `beat`, so their order is guessed again from there on, until a later form sets one
 */
export async function clearMarcherOrderInTransaction(
    tx: DbTransaction,
    { beat, marcherIds }: { beat: number; marcherIds: readonly number[] },
): Promise<number> {
    const ids = [...new Set(marcherIds)];
    if (ids.length === 0) throw new Error("No marchers to clear");
    return await saveShapeRecipeInTransaction({
        tx,
        timelineId: null,
        recipe: orderRecipe(ORDER_CLEAR_RECIPE_KIND, ids.length, beat),
        members: ids.map((marcherId, slot) => ({
            marcherId,
            slot,
            x: 0,
            y: 0,
        })),
    });
}

/** Set order (and Reverse, which sets the order shown, turned round) as one undo step */
export async function setMarcherOrder(
    db: DbConnection,
    args: Parameters<typeof setMarcherOrderInTransaction>[1] & {
        /** The history entry's name */
        operation?: "setMarcherOrder" | "reverseMarcherOrder";
    },
): Promise<number> {
    const { operation = "setMarcherOrder", ...rest } = args;
    return await transactionWithHistory(db, operation, (tx) =>
        setMarcherOrderInTransaction(tx, rest),
    );
}

/** Clear order as one undo step */
export async function clearMarcherOrder(
    db: DbConnection,
    args: Parameters<typeof clearMarcherOrderInTransaction>[1],
): Promise<number> {
    return await transactionWithHistory(db, "clearMarcherOrder", (tx) =>
        clearMarcherOrderInTransaction(tx, args),
    );
}

/** Every marcher's id, for reading every form in the show (Show order's Always) */
export async function readAllMarcherIds(
    db: DbConnection | DbTransaction,
): Promise<number[]> {
    return (
        await db.select({ id: schema.marchers.id }).from(schema.marchers).all()
    ).map((m) => m.id);
}

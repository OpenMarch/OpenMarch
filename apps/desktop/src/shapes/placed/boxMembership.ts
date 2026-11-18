import {
    readShapeRecipe,
    readShapeRecipesOf,
    saveShapeRecipeInTransaction,
    type ShapeRecipeMember,
} from "@/db-functions/shapeRecipes";
import { readTimelineEndBeats } from "@/db-functions/timelines";
import type { DbTransaction } from "@/db-functions/types";
import type { XY } from "../types";
import {
    boxesAt,
    membershipAfter,
    movedBox,
    withoutMembers,
    type PlacedBox,
    type StoredParams,
} from "./placedBox";

/** Marchers that left a box in an edit, and the box as it was saved without them */
export interface BoxLeave {
    readonly recipeId: number;
    readonly timelineId: number | null;
    readonly left: readonly number[];
    readonly box: PlacedBox;
    /** Who is still in the box, on their spots */
    readonly members: readonly ShapeRecipeMember[];
}

/**
 * Keeps placed boxes true to the field through a coordinate edit
 * (docs/timeline/research/shapes/07-placed-boxes.md): `afterWrite` runs inside the edit, after its
 * positions are written, and saves what the edit did to the boxes it touched, in the same undo
 * step.
 *
 * - Every member of a box moved the same way: the box moves.
 * - Some members moved off their spots: they leave, and their spots stay as holes. `leaves` lists
 *   them after the edit, for the toast that offers to fill the holes.
 *
 * A box placed in an earlier move and held to this moment is saved as a copy on this edit's move;
 * the earlier one stays as it was.
 *
 * @param beat the moment the edit writes at
 * @param positionOf where a marcher stands at `beat` before the edit (the resolver, which doesn't
 *   have the edit yet while it is inside its transaction)
 */
export function boxMembershipEdit({
    moves,
    beat,
    positionOf,
}: {
    moves: readonly { marcherId: number; x: number; y: number }[];
    beat: number;
    positionOf: (marcherId: number) => XY | undefined;
}): {
    afterWrite: (
        tx: DbTransaction,
        timelineId: number | null,
    ) => Promise<boolean>;
    readonly leaves: readonly BoxLeave[];
} {
    const leaves: BoxLeave[] = [];
    const moved = new Map(
        moves.map((m) => [m.marcherId, { x: m.x, y: m.y }] as const),
    );
    return {
        leaves,
        async afterWrite(tx, timelineId) {
            const recipes = await readShapeRecipesOf({
                db: tx,
                marcherIds: [...moved.keys()],
            });
            if (recipes.length === 0) return false;
            const ends = await readTimelineEndBeats(
                tx,
                recipes.flatMap((r) =>
                    r.timelineId === null ? [] : [r.timelineId],
                ),
            );
            const boxes = boxesAt({
                recipes,
                endBeatOf: (id) => (id === null ? 0 : ends.get(id)),
                beat,
                positionOf,
            });
            let wrote = false;
            // A member dragged by hand keeps an order set by hand (pathways step 4g)
            const into = { tx, timelineId, keepOrderMarks: true };
            for (const box of boxes) {
                const change = membershipAfter(box, moved);
                if (change.type === "none") continue;
                const own = box.recipe.timelineId === timelineId;
                const save = (
                    params: StoredParams,
                    members: readonly ShapeRecipeMember[],
                ) =>
                    saveShapeRecipeInTransaction({
                        ...into,
                        recipe: { ...box.recipe, params },
                        members,
                        replaces: own ? box.recipe.id : undefined,
                    });
                if (change.type === "move") {
                    const out = movedBox(box, change.delta);
                    await save(out.params, out.members);
                } else {
                    const kept = withoutMembers(box.recipe, change.left);
                    const recipeId = await save(
                        kept.params as StoredParams,
                        kept.members,
                    );
                    // Who is in it as saved: the save leaves out marchers not in this move,
                    // and deletes a recipe it left with no one
                    const saved = await readShapeRecipe(tx, recipeId);
                    if (saved && saved.members.length > 0)
                        leaves.push({
                            recipeId,
                            timelineId,
                            left: change.left,
                            box,
                            members: saved.members,
                        });
                }
                wrote = true;
            }
            return wrote;
        },
    };
}

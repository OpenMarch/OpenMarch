/**
 * What Set order, Reverse and Clear order write (pathways step 4g): each one undo step, run in the
 * queue undo and redo run in, after what's queued before it.
 */
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import { db } from "@/global/database/db";
import {
    ordersInForce,
    readOrderForms,
    rememberedOrderAt,
} from "@/db-functions/rememberedOrder";
import {
    clearMarcherOrder,
    setMarcherOrder,
} from "@/db-functions/marcherOrder";
import { historyKeys } from "@/hooks/queries/useHistory";
import { queueHistoryStep } from "@/shortcuts/handlers/historyQueue";
import { invalidatePlacedBoxes } from "@/shapes/placed/placedBoxStore";
import {
    endOrderSweep,
    invalidateOrderForms,
    shownOrderOf,
} from "./marcherOrderStore";
import type { XY } from "./orderSweep";

const failure = () =>
    tolgee.t("pathways.order.error", "Error saving the line's order");

/** Refreshes what reads the recipes and the history after a write */
function written(queryClient: QueryClient | null) {
    invalidateOrderForms();
    invalidatePlacedBoxes();
    void queryClient?.invalidateQueries({ queryKey: historyKeys.all() });
}

/** Keeps the order Set order ends with, as one undo step; nothing when nobody was picked */
export function keepOrderSweep(queryClient: QueryClient | null): Promise<void> {
    const kept = endOrderSweep();
    if (!kept) return Promise.resolve();
    return queueHistoryStep(async () => {
        try {
            await setMarcherOrder(db, kept);
        } catch (e) {
            console.error("Couldn't set the order", e);
            toast.error(failure());
            return;
        }
        written(queryClient);
    }, undefined);
}

/**
 * **Reverse**: the order shown for `ids` at `beat` (remembered, or else guessed from where they
 * stand, `at`) turned round and kept, so the tail leads. One undo step.
 */
export function reverseOrder(
    ids: readonly number[],
    beat: number,
    at: ReadonlyMap<number, XY>,
    queryClient: QueryClient | null,
): Promise<void> {
    return queueHistoryStep(async () => {
        try {
            const remembered = await rememberedOrderAt(db, ids, beat);
            const shown =
                remembered && remembered.length === ids.length
                    ? remembered
                    : (shownOrderOf(null, ids, beat, at)?.order ?? null);
            if (!shown) {
                toast.info(
                    tolgee.t(
                        "pathways.order.noneToReverse",
                        "These marchers have no order to reverse: set one first",
                    ),
                );
                return;
            }
            await setMarcherOrder(db, {
                beat,
                order: [...shown].reverse(),
                at,
                operation: "reverseMarcherOrder",
            });
        } catch (e) {
            console.error("Couldn't reverse the order", e);
            toast.error(failure());
            return;
        }
        written(queryClient);
    }, undefined);
}

/**
 * **Clear order**: what's remembered for `ids` ends at `beat`, and their order is guessed again
 * from there on. Nothing is written when none of them is in a line whose order holds. One undo step.
 */
export function clearOrder(
    ids: readonly number[],
    beat: number,
    queryClient: QueryClient | null,
): Promise<void> {
    return queueHistoryStep(async () => {
        try {
            // Anyone of them in a line whose order holds there
            const chosen = new Set(ids);
            const inLine = ordersInForce(
                await readOrderForms(db, ids),
                beat,
            ).some((line) => line.order.some((id) => chosen.has(id)));
            if (!inLine) {
                toast.info(
                    tolgee.t(
                        "pathways.order.noneToClear",
                        "Nothing to clear: the order of these marchers is already guessed",
                    ),
                );
                return;
            }
            await clearMarcherOrder(db, { beat, marcherIds: ids });
        } catch (e) {
            console.error("Couldn't clear the order", e);
            toast.error(failure());
            return;
        }
        written(queryClient);
    }, undefined);
}

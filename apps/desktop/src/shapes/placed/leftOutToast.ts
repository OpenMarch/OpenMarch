import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import { currentShapeField } from "../field/shapeFieldContext";

const LEFT_OUT_TOAST_ID = "shape-left-out";
const LEFT_OUT_TOAST_MS = 10000;

/** A marcher's drill number, else its id */
export function nameOf(marcherId: number): string {
    const m = currentShapeField()
        ?.marchers()
        .find((marcher) => marcher.id === marcherId);
    return m?.drill_number ?? `#${marcherId}`;
}

/**
 * After a shape is placed in Basic without some of its marchers: they stand on their spots, but
 * their last mid-page position on the page is at another count than the others', so their
 * positions at the flag are in another move and the recipe can't list them (ADR 0006, revision of
 * 2026-10-29, rule 1; `leftOutByOtherCounts`). Basic shows no moves, so this says who and why.
 */
export function showLeftOutToast(marcherIds: readonly number[]): void {
    if (marcherIds.length === 0) return;
    const message =
        marcherIds.length === 1
            ? tolgee.t(
                  "shapes.placed.leftOut.one",
                  "{name} is on its spot, but isn't part of the shape",
                  { name: nameOf(marcherIds[0]!) },
              )
            : tolgee.t(
                  "shapes.placed.leftOut.many",
                  "{count, plural, one {# marcher is on its spot, but isn't part of the shape} other {# marchers are on their spots, but aren't part of the shape}}",
                  { count: marcherIds.length },
              );
    toast.warning(message, {
        id: LEFT_OUT_TOAST_ID,
        duration: LEFT_OUT_TOAST_MS,
        description: tolgee.t(
            "shapes.placed.leftOut.hint",
            "A shape holds only marchers whose last mid-page position on this page is at the same count. Remove the positions that differ, then place the shape again.",
        ),
    });
}

/**
 * After a Basic edit re-cut a page's moves (a mid-page position, Remove this count's position)
 * and the shape placed at the flag followed the move its members now arrive in
 * (`recipesFollowMembersInTransaction`): the members whose positions at the flag are in another
 * move, which the recipe can no longer list (ADR 0006, revision of 2026-10-29, rule 1).
 */
export function showDroppedAtFlagToast(marcherIds: readonly number[]): void {
    if (marcherIds.length === 0) return;
    const message =
        marcherIds.length === 1
            ? tolgee.t(
                  "shapes.placed.droppedAtFlag.one",
                  "{name} isn't part of the shape at this flag anymore",
                  { name: nameOf(marcherIds[0]!) },
              )
            : tolgee.t(
                  "shapes.placed.droppedAtFlag.many",
                  "{count, plural, one {# marcher isn't part of the shape at this flag anymore} other {# marchers aren't part of the shape at this flag anymore}}",
                  { count: marcherIds.length },
              );
    toast.warning(message, {
        id: LEFT_OUT_TOAST_ID,
        duration: LEFT_OUT_TOAST_MS,
        description: tolgee.t(
            "shapes.placed.leftOut.hint",
            "A shape holds only marchers whose last mid-page position on this page is at the same count. Remove the positions that differ, then place the shape again.",
        ),
    });
}

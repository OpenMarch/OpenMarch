import { mutationOptions, useMutation, useQuery } from "@tanstack/react-query";
import { moveMarchersAndOfferFollowUp } from "@/timeline/timelineMoveThemToo";
import { db } from "@/global/database/db";
import type MarcherPage from "@/global/classes/MarcherPage";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { FieldProperties } from "@openmarch/core";
import { fieldPropertiesQueryOptions } from "./useFieldProperties";
import tolgee from "@/global/singletons/Tolgee";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import {
    transformMarchersInSelection,
    type TimelineEditRequest,
    type TimelineNeighborPageRequest,
} from "@/timeline/timelineCoordinateWrites";
import { removePositionAtBeat } from "@/db-functions/timelinePointMoves";
import type { DbTransaction } from "@/db-functions/types";
import { showDroppedAtFlagToast } from "@/shapes/placed/leftOutToast";

/**
 * Timeline mode's write for "set marchers to the previous or next page" (P7.6): one undoable edit
 * through `moveMarchersInTarget` over the page's box, clearing the marchers' own moves there for
 * set to previous page. The resolver store picks the change up from the change log, so there is
 * nothing to invalidate. A refused move shows its friendly message (P8.6); one that passed through
 * page flags or other moves says so, and one that left later own moves behind offers **Move them
 * too** (`moveMarchersAndOfferFollowUp`).
 */
export const moveMarchersToNeighborPageMutationOptions = () => {
    return mutationOptions({
        mutationFn: ({
            target,
            moves,
            clearPage,
            keepLaterPages,
        }: TimelineNeighborPageRequest) =>
            moveMarchersAndOfferFollowUp({
                target,
                moves,
                clearPage,
                keepLaterPages,
            }),
        onError: (e, variables) => {
            toastTimelineError(
                e,
                tolgee.t("marcherPages.errors.move"),
                variables,
            );
        },
    });
};

/**
 * Timeline mode's write for a canvas move (UI-9 Editing, P8.15): one undoable edit through
 * `moveMarchersInTarget`, setting homes or the endings in the selected timeline. A refused move
 * shows its friendly message; a move that passed through page flags says so, and one that left
 * later own moves behind offers **Move them too** (`moveMarchersAndOfferFollowUp`).
 */
export const moveMarchersInTargetMutationOptions = () => {
    return mutationOptions({
        // A drag over a window that crosses pages says what it passed through (UI-10), and one
        // that left marchers' later moves behind offers to move them too
        // `afterWrite`: app data saved in the same edit (a prop's size, with the move a resize gave it)
        mutationFn: ({
            target,
            moves,
            afterWrite,
        }: TimelineEditRequest & {
            afterWrite?: (tx: DbTransaction) => Promise<void>;
        }) => moveMarchersAndOfferFollowUp({ target, moves, afterWrite }),
        onError: (e, variables) => {
            toastTimelineError(
                e,
                tolgee.t("marcherPages.errors.move"),
                variables,
            );
        },
    });
};

/**
 * Basic mode's **Remove this count's position** (UI-19): one undoable edit taking each marcher's
 * position at `beat` away (`removePositionAtBeat`). Like the other timeline writes, the resolver
 * store picks the change up from the change log, so there is nothing to invalidate.
 */
export const removePositionAtBeatMutationOptions = () => {
    return mutationOptions({
        mutationFn: ({
            beat,
            box,
            marcherIds,
        }: {
            beat: number;
            box: { start: number; end: number };
            marcherIds: readonly number[];
        }) => removePositionAtBeat({ db, beat, box, marcherIds }),
        onSuccess: (result) => {
            if (result.droppedFromShapes)
                showDroppedAtFlagToast(result.droppedFromShapes);
        },
        onError: (e, variables) => {
            toastTimelineError(
                e,
                tolgee.t("marcherPages.errors.removePosition"),
                variables,
            );
        },
    });
};

/**
 * An x and y value, plus the marcher ID
 *
 * This is used for marcher coordinate update functions.
 * This is a subset of the MarcherPage type.
 */
export type MarcherCoordinate = Pick<MarcherPage, "marcher_id" | "x" | "y">;
/**
 * A function that takes an array of marcher coordinates representing the current position of the selected marchers
 * and returns a new array of marcher coordinates which is the new position of the selected marchers.
 *
 * @param currentCoordinates - The current coordinates of the selected marchers.
 * @param fieldProperties - The field properties of the show.
 * @param pageId - The ID of the page the marchers are on.
 * @returns The new coordinates of the selected marchers.
 */
export type MarcherTransformFunction = (args: {
    currentCoordinates: MarcherCoordinate[];
    fieldProperties: FieldProperties;
    pageId: number;
}) => MarcherCoordinate[];

/**
 * A hook that updates the selected marchers where the selection edits (UI-9 Editing).
 *
 * It starts from what the canvas draws (the resolver) and writes homes or the endings in the
 * selected timeline. A refusal is a toast; the resolver store follows the change log, so there is
 * nothing to invalidate.
 *
 * @param pageId - only passed through to the transform function.
 * @returns A mutation function that takes a marcher transform function and updates the selected marchers.
 */
export const useUpdateSelectedMarchers = (
    pageId: number | null | undefined,
) => {
    const { data: fieldProperties, isSuccess: fieldPropertiesLoaded } =
        useQuery(fieldPropertiesQueryOptions());
    const selectedMarchersContext = useSelectedMarchers();
    const selectedMarchers = selectedMarchersContext?.selectedMarchers ?? [];

    return useMutation({
        mutationFn: async (transformFunction: MarcherTransformFunction) => {
            if (!fieldPropertiesLoaded)
                throw new Error("Field properties not loaded");
            // Nudges are greyed out with nothing selected, and the inspector's fields aren't shown
            if (selectedMarchers.length === 0) return;
            const newCoordinates = await transformMarchersInSelection({
                db,
                marcherIds: selectedMarchers.map((marcher) => marcher.id),
                transform: (currentCoordinates) =>
                    transformFunction({
                        currentCoordinates,
                        fieldProperties,
                        pageId: pageId ?? 0,
                    }),
            });
            return { newCoordinates };
        },
        onError: (e, variables) => {
            toastTimelineError(
                e,
                tolgee.t("marcherPages.errors.updateSelected"),
                variables,
            );
        },
    });
};

/**
 * A hook that updates the selected marchers on the selected page.
 *
 * This hook takes care of updating the coordinates in the database and re-fetching the required data.
 *
 * @returns A mutation function that takes a marcher transform function and updates the selected marchers on the selected page.
 */
export const useUpdateSelectedMarchersOnSelectedPage = () => {
    const selectedPageContext = useSelectedPage();
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    return useUpdateSelectedMarchers(selectedPage?.id);
};

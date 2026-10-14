import { mutationOptions, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { moveMarchersAndOfferFollowUp } from "@/timeline/timelineMoveThemToo";
import { db } from "@/global/database/db";
import type MarcherPage from "@/global/classes/MarcherPage";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useTolgee } from "@tolgee/react";
import { FieldProperties } from "@openmarch/core";
import { fieldPropertiesQueryOptions } from "./useFieldProperties";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import {
    transformMarchersInSelection,
    type TimelineEditRequest,
    type TimelineNeighborPageRequest,
} from "@/timeline/timelineCoordinateWrites";

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
            clearOwn,
        }: TimelineNeighborPageRequest) =>
            moveMarchersAndOfferFollowUp({ target, moves, clearOwn }),
        onError: (e, variables) => {
            toastTimelineError(e, `Error moving marchers`, variables);
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
        mutationFn: ({ target, moves }: TimelineEditRequest) =>
            moveMarchersAndOfferFollowUp({ target, moves }),
        onError: (e, variables) => {
            toastTimelineError(e, `Error moving marchers`, variables);
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
    const { t } = useTolgee();

    return useMutation({
        mutationFn: async (transformFunction: MarcherTransformFunction) => {
            if (!fieldPropertiesLoaded)
                throw new Error("Field properties not loaded");
            if (selectedMarchers.length === 0) {
                toast.warning(t("actions.shape.noMarchersSelected"));
                return;
            }
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
                `Error updating selected marchers`,
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

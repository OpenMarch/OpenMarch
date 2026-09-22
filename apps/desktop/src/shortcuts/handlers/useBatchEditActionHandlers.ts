import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTolgee } from "@tolgee/react";
import { getNextPage, getPreviousPage } from "@/global/classes/Page";
import { useTimingObjects } from "@/hooks";
import {
    marcherPagesByPageQueryOptions,
    updateMarcherPagesMutationOptions,
} from "@/hooks/queries";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

// eslint-disable-next-line max-lines-per-function
export function useBatchEditActionHandlers() {
    const { t } = useTolgee();
    const queryClient = useQueryClient();
    const { selectedPage, ready, selectedMarchers } = useEditorReadiness();
    const { pages } = useTimingObjects()!;
    const { data: previousMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.previousPageId!),
    );
    const { data: nextMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.nextPageId!),
    );
    const { mutate: updateMarcherPages } = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );
    const enabled = ready && !!pages && pages.length > 0;

    useActionHandler(
        "setAllMarchersToPreviousPage",
        () => {
            const previousPage = getPreviousPage(selectedPage!, pages);
            if (!previousPage || !previousMarcherPages) {
                toast.error(t("actions.batchEdit.noPreviousPage"));
                return;
            }

            const previousMarcherPagesArray =
                Object.values(previousMarcherPages);
            const changes = previousMarcherPagesArray.map((marcherPage) => ({
                marcher_id: marcherPage.marcher_id,
                page_id: selectedPage!.id,
                x: marcherPage.x as number,
                y: marcherPage.y as number,
                notes: marcherPage.notes || undefined,
            }));
            updateMarcherPages(changes);

            toast.success(
                t("actions.batchEdit.setAllToPreviousSuccess", {
                    count: previousMarcherPagesArray.length,
                    currentPage: selectedPage!.name,
                    previousPage: previousPage.name,
                }),
            );
        },
        { enabled },
    );

    useActionHandler(
        "setSelectedMarchersToPreviousPage",
        () => {
            const previousPage = getPreviousPage(selectedPage!, pages);
            if (!previousPage || !previousMarcherPages) {
                toast.error(t("actions.batchEdit.noPreviousPage"));
                return;
            }

            const selectedMarcherIds = selectedMarchers.map(
                (marcher) => marcher.id,
            );

            const filteredPreviousMarcherPages = selectedMarcherIds
                .map((marcherId) => previousMarcherPages[marcherId])
                .filter(Boolean);

            if (filteredPreviousMarcherPages.length > 0) {
                const changes = filteredPreviousMarcherPages.map(
                    (marcherPage) => ({
                        marcher_id: marcherPage.marcher_id,
                        page_id: selectedPage!.id,
                        x: marcherPage.x as number,
                        y: marcherPage.y as number,
                        notes: marcherPage.notes || undefined,
                    }),
                );
                updateMarcherPages(changes);

                toast.success(
                    t("actions.batchEdit.setSelectedToPreviousSuccess", {
                        count: filteredPreviousMarcherPages.length,
                        currentPage: selectedPage!.name,
                        previousPage: previousPage.name,
                    }),
                );
            }
        },
        { enabled: enabled && selectedMarchers.length > 0 },
    );

    useActionHandler(
        "setAllMarchersToNextPage",
        () => {
            const nextPage = getNextPage(selectedPage!, pages);
            if (!nextPage || !nextMarcherPages) {
                toast.error(t("actions.batchEdit.noNextPage"));
                return;
            }
            const nextMarcherPagesArray = Object.values(nextMarcherPages);
            const changes = nextMarcherPagesArray.map((marcherPage) => ({
                marcher_id: marcherPage.marcher_id,
                page_id: selectedPage!.id,
                x: marcherPage.x as number,
                y: marcherPage.y as number,
                notes: marcherPage.notes || undefined,
            }));
            updateMarcherPages(changes);

            toast.success(
                t("actions.batchEdit.setAllToNextSuccess", {
                    count: nextMarcherPagesArray.length,
                    currentPage: selectedPage!.name,
                    nextPage: nextPage.name,
                }),
            );
        },
        { enabled },
    );

    useActionHandler(
        "setSelectedMarchersToNextPage",
        () => {
            const nextPage = getNextPage(selectedPage!, pages);
            if (!nextPage || !nextMarcherPages) {
                toast.error(t("actions.batchEdit.noNextPage"));
                return;
            }
            const selectedMarcherIds = selectedMarchers.map(
                (marcher) => marcher.id,
            );
            const nextPageMarcherPages = selectedMarcherIds
                .map((marcherId) => nextMarcherPages[marcherId])
                .filter(Boolean);

            if (nextPageMarcherPages.length > 0) {
                const changes = nextPageMarcherPages.map((marcherPage) => ({
                    marcher_id: marcherPage.marcher_id,
                    page_id: selectedPage!.id,
                    x: marcherPage.x as number,
                    y: marcherPage.y as number,
                    notes: marcherPage.notes || undefined,
                }));
                updateMarcherPages(changes);

                toast.success(
                    t("actions.batchEdit.setSelectedToNextSuccess", {
                        count: nextPageMarcherPages.length,
                        currentPage: selectedPage!.name,
                        nextPage: nextPage.name,
                    }),
                );
            }
        },
        { enabled: enabled && selectedMarchers.length > 0 },
    );
}

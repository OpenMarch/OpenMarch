import { useEffect } from "react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { useTimingObjects } from "@/hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { coordinateDataQueryOptions } from "@/hooks/queries/useCoordinateData";
import { useSelectionStore } from "@/stores/SelectionStore";
import {
    marcherAppearancesQueryOptions,
    updateShapePagesMutationOptions,
} from "@/hooks/queries";
import {
    MarcherShape,
    marcherShapeToShapePageArgs,
} from "@/global/classes/canvasObjects/MarcherShape";

/**
 * A component that initializes the state of the application.
 * @returns <> </>
 */
function StateInitializer() {
    const queryClient = useQueryClient();
    const { pages } = useTimingObjects();
    const selectedPageContext = useSelectedPage();
    const selectedPage = selectedPageContext?.selectedPage ?? null;
    const setSelectedPage = selectedPageContext?.setSelectedPage ?? (() => {});
    const selectedAudioFileContext = useSelectedAudioFile();
    const selectedAudioFile =
        selectedAudioFileContext?.selectedAudioFile ?? null;
    const setSelectedAudioFile =
        selectedAudioFileContext?.setSelectedAudioFile ?? (() => {});
    const selectionStore = useSelectionStore();
    const setSelectedShapePageIds =
        selectionStore?.setSelectedShapePageIds ?? (() => {});
    const { mutate: updateMarcherShape } = useMutation(
        updateShapePagesMutationOptions(queryClient),
    );

    if (selectedPage) {
        void queryClient.prefetchQuery(
            coordinateDataQueryOptions(selectedPage, queryClient),
        );
        void queryClient.prefetchQuery(
            marcherAppearancesQueryOptions(selectedPage.id, queryClient),
        );
        if (selectedPage.nextPageId != null) {
            const nextPage = pages.find(
                (page) => page.id === selectedPage.nextPageId,
            );
            if (nextPage) {
                void queryClient.prefetchQuery(
                    coordinateDataQueryOptions(nextPage, queryClient),
                );
                void queryClient.prefetchQuery(
                    marcherAppearancesQueryOptions(nextPage.id, queryClient),
                );
            }
        }
        if (selectedPage.previousPageId != null) {
            const previousPage = pages.find(
                (page) => page.id === selectedPage.previousPageId,
            );
            if (previousPage) {
                void queryClient.prefetchQuery(
                    coordinateDataQueryOptions(previousPage, queryClient),
                );
                void queryClient.prefetchQuery(
                    marcherAppearancesQueryOptions(
                        previousPage.id,
                        queryClient,
                    ),
                );
            }
        }
    }

    /*******************************************************************/

    // Select page 0 (first page in show order) when none are selected (e.g. app load / refresh)
    useEffect(() => {
        if (selectedPage == null && pages.length > 0) {
            setSelectedPage(pages[0]);
        }
    }, [pages, selectedPage, setSelectedPage]);

    // Select the currently selected audio file
    useEffect(() => {
        if (!selectedAudioFile) {
            AudioFile.getSelectedAudioFile().then((audioFile) => {
                setSelectedAudioFile({ ...audioFile, data: undefined });
            });
        }
    }, [selectedAudioFile, setSelectedAudioFile]);

    // Clear the selected marcher shapes when the page changes
    useEffect(() => {
        setSelectedShapePageIds([]);
    }, [selectedPage, setSelectedShapePageIds]);

    useEffect(() => {
        MarcherShape.updateMarcherShapeFn = async (
            marcherShape: MarcherShape,
        ) => updateMarcherShape([marcherShapeToShapePageArgs(marcherShape)]);
    }, [updateMarcherShape]);

    return <></>; // Empty fragment
}

export default StateInitializer;

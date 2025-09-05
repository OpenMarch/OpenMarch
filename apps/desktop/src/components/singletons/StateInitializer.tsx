import { useCallback, useEffect } from "react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { Constants, TablesWithHistory } from "@/global/Constants";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useMarcherStore } from "@/stores/MarcherStore";
import Marcher from "../../global/classes/Marcher";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import type { HistoryResponse } from "electron/database/database.services";
import { MarcherShape } from "@/global/classes/canvasObjects/MarcherShape";
import { useShapePageStore } from "@/stores/ShapePageStore";
import {
    fetchMarcherPages,
    marcherPageKeys,
    useFieldProperties,
    useFieldPropertiesWithSetter,
} from "@/hooks/queries";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useUndoRedoStore } from "@/stores/UndoRedoStore";
import { fetchMarchersAndVisuals } from "@/global/classes/MarcherVisualGroup";
import { DEFAULT_FIELD_THEME, FieldTheme } from "@openmarch/core";
import { useQueryClient } from "@tanstack/react-query";
import { coordinateDataQueryOptions } from "@/hooks/queries/useCoordinateData";

/**
 * A component that initializes the state of the application.
 * @returns <> </>
 */
function StateInitializer() {
    const { marchers, fetchMarchers } = useMarcherStore();
    const { pages, fetchTimingObjects } = useTimingObjectsStore();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedAudioFile, setSelectedAudioFile } = useSelectedAudioFile()!;
    const { setSelectedMarchers } = useSelectedMarchers()!;
    const { fetchShapePages, setSelectedMarcherShapes, selectedMarcherShapes } =
        useShapePageStore()!;
    const { fetchFieldProperties } = useFieldPropertiesWithSetter();
    const updateUndoRedo = useUndoRedoStore((s) => s.updateUndoRedo);
    const { isSuccess: fieldPropertiesSuccess, data: fieldProperties } =
        useFieldProperties();
    const queryClient = useQueryClient();

    if (selectedPage) {
        queryClient.prefetchQuery(
            coordinateDataQueryOptions(selectedPage, queryClient),
        );
        if (selectedPage.nextPageId != null) {
            const nextPage = pages.find(
                (page) => page.id === selectedPage.nextPageId,
            );
            if (nextPage)
                queryClient.prefetchQuery(
                    coordinateDataQueryOptions(nextPage, queryClient),
                );
        }
        if (selectedPage.previousPageId != null) {
            const previousPage = pages.find(
                (page) => page.id === selectedPage.previousPageId,
            );
            if (previousPage)
                queryClient.prefetchQuery(
                    coordinateDataQueryOptions(previousPage, queryClient),
                );
        }
    }

    /**
     * These functions set the fetch function in each respective class.
     * This is how the classes are able to ensure that state in OpenMarch is constantly synced.
     * Functionally, these vanilla Typescript classes are able to control and update react state,
     * this may be bad practice, but for now, it works!
     *
     * These functions also are what gives OpenMarch state at the start.
     * This component exists so that OpenMarch doesn't rely on other components
     * to ensure the initial state has been retrieved.
     */

    useEffect(() => {
        const fieldTheme: FieldTheme = fieldPropertiesSuccess
            ? fieldProperties.theme
            : DEFAULT_FIELD_THEME;
        Marcher.fetchMarchers = () => fetchMarchersAndVisuals(fieldTheme);
        Marcher.fetchMarchers();
    }, [fetchMarchers, fieldPropertiesSuccess, fieldProperties?.theme]);

    useEffect(() => {
        fetchTimingObjects();
    }, [fetchTimingObjects]);

    useEffect(() => {
        MarcherShape.fetchShapePages = fetchShapePages;
        MarcherShape.fetchShapePages();
    }, [fetchShapePages]);

    /****************************** CHECKS *****************************/

    useEffect(() => {
        if (selectedPage === null || selectedMarcherShapes.length === 0) return;
        if (
            selectedMarcherShapes.some(
                (marcherShape) =>
                    marcherShape.shapePage.page_id !== selectedPage.id,
            )
        ) {
            console.warn(
                "Selected marcher shapes are not on the selected page. This is likely not intended.",
                selectedPage,
                selectedMarcherShapes,
            );
        }
    }, [selectedMarcherShapes, selectedPage]);

    /*******************************************************************/

    // Select the first page if none are selected. Intended to activate at the initial loading of a webpage
    useEffect(() => {
        if (selectedPage == null && pages.length > 0) setSelectedPage(pages[0]);
    }, [pages, selectedPage, setSelectedPage]);

    useEffect(() => {});

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
        setSelectedMarcherShapes([]);
    }, [selectedPage, setSelectedMarcherShapes]);

    const getMarcher = useCallback(
        (id: number) => {
            return marchers.find((marcher) => marcher.id === id) || null;
        },
        [marchers],
    );

    const getPage = useCallback(
        (id: number) => {
            return pages.find((page) => page.id === id) || null;
        },
        [pages],
    );

    // Listen for history actions (undo/redo) from the main process
    useEffect(() => {
        const handler = (args: HistoryResponse) => {
            for (const tableName of args.tableNames) {
                switch (tableName) {
                    case Constants.MarcherTableName:
                        fetchMarchers();
                        if (args.marcherIds.length > 0) {
                            // TODO support passing in all of the marchers that were modified in the undo
                            const newMarchers = marchers.filter((marcher) =>
                                args.marcherIds.includes(marcher.id),
                            );
                            setSelectedMarchers(newMarchers);
                        } else {
                            setSelectedMarchers([]);
                        }
                        break;
                    case Constants.MarcherPageTableName:
                        if (!args.pageId)
                            throw new Error(
                                "Page ID must be defined on the history response",
                            );
                        queryClient.invalidateQueries({
                            queryKey: [marcherPageKeys.byPage(args.pageId)],
                        });
                        if (args.marcherIds.length > 0) {
                            // TODO support passing in all of the marchers that were modified in the undo
                            const newMarchers = marchers.filter((marcher) =>
                                args.marcherIds.includes(marcher.id),
                            );
                            setSelectedMarchers(newMarchers);
                        } else {
                            setSelectedMarchers([]);
                        }
                        if (args.pageId && args.pageId > 0) {
                            const newPage = getPage(args.pageId);
                            if (!newPage)
                                throw new Error(
                                    `Page could not be found with ID ${args.pageId}`,
                                );
                            setSelectedPage(newPage);
                        }
                        break;
                    case Constants.ShapeTableName:
                    case Constants.ShapePageTableName:
                    case Constants.ShapePageMarcherTableName:
                        if (!args.pageId)
                            throw new Error(
                                "Page ID must be defined on the history response",
                            );
                        queryClient.invalidateQueries({
                            queryKey: [marcherPageKeys.byPage(args.pageId)],
                        });
                        fetchShapePages();
                        break;
                    case Constants.PageTableName:
                        fetchTimingObjects();
                        if (args.pageId && args.pageId > 0) {
                            const newPage = getPage(args.pageId);
                            if (!newPage)
                                throw new Error(
                                    `Page could not be found with ID ${args.pageId}`,
                                );
                            setSelectedPage(newPage);
                        }
                        break;
                    case Constants.BeatsTableName:
                    case Constants.MeasureTableName:
                        fetchTimingObjects();
                        break;
                    case Constants.FieldPropertiesTableName:
                        fetchFieldProperties();
                }
            }

            updateUndoRedo();
        };

        window.electron.onHistoryAction(handler);

        window.electron.onImportFieldPropertiesFile(() =>
            fetchFieldProperties(),
        );

        updateUndoRedo();

        return () => {
            window.electron.removeHistoryActionListener(); // Remove the event listener
            window.electron.removeImportFieldPropertiesFileListener();
        };
    }, [
        getMarcher,
        getPage,
        fetchMarchers,
        setSelectedPage,
        setSelectedMarchers,
        marchers,
        fetchShapePages,
        fetchFieldProperties,
        fetchTimingObjects,
        updateUndoRedo,
        queryClient,
    ]);

    // Listen for fetch actions from the main process
    useEffect(() => {
        const handler = (type: (typeof TablesWithHistory)[number][number]) => {
            switch (type) {
                case Constants.MarcherTableName:
                    fetchMarchers();
                    break;
                case Constants.PageTableName:
                case Constants.BeatsTableName:
                case Constants.MeasureTableName:
                    fetchTimingObjects();
                    break;
                case Constants.MarcherPageTableName:
                    console.warn("Why is this being called?");
                    fetchMarcherPages();
                    break;
            }
        };

        window.electron.onFetch(handler);

        return () => {
            window.electron.removeFetchListener(); // Remove the event listener
        };
    }, [fetchMarchers, fetchTimingObjects]);

    return <></>; // Empty fragment
}

export default StateInitializer;

import { useCallback, useEffect } from "react";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { Constants } from "@/global/Constants";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useMarcherStore } from "@/stores/MarcherStore";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { usePageStore } from "@/stores/PageStore";
import { useMeasureStore } from "../../stores/MeasureStore";
import Marcher from "../../global/classes/Marcher";
import Page from "../../global/classes/Page";
import MarcherPage from "../../global/classes/MarcherPage";
import Measure from "../../global/classes/Measure";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { HistoryResponse } from "electron/database/database.services";
import { MarcherShape } from "@/global/classes/canvasObjects/MarcherShape";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { useFieldProperties } from "@/context/fieldPropertiesContext";

/**
 * A component that initializes the state of the application.
 * @returns <> </>
 */
function StateInitializer() {
    const { marchers, fetchMarchers } = useMarcherStore();
    const { fetchMarcherPages } = useMarcherPageStore()!;
    const { pages, setPages, fetchPages } = usePageStore();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedAudioFile, setSelectedAudioFile } = useSelectedAudioFile()!;
    const { measures } = useMeasureStore()!;
    const { setSelectedMarchers } = useSelectedMarchers()!;
    const { fetchMeasures } = useMeasureStore()!;
    const { fetchShapePages, setSelectedMarcherShapes, selectedMarcherShapes } =
        useShapePageStore()!;
    const { fetchFieldProperties } = useFieldProperties()!;

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
        Marcher.fetchMarchers = fetchMarchers;
        Marcher.fetchMarchers();
    }, [fetchMarchers]);

    useEffect(() => {
        Page.fetchPages = fetchPages;
        Page.fetchPages();
    }, [fetchPages]);

    useEffect(() => {
        MarcherPage.fetchMarcherPages = fetchMarcherPages;
        MarcherPage.fetchMarcherPages();
    }, [fetchMarcherPages, pages, marchers]);

    useEffect(() => {
        Measure.fetchMeasures = fetchMeasures;
        Measure.fetchMeasures();
    }, [fetchMeasures]);

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
                        fetchMarcherPages();
                        if (args.marcherIds.length > 0) {
                            // TODO support passing in all of the marchers that were modified in the undo
                            const newMarchers = marchers.filter((marcher) =>
                                args.marcherIds.includes(marcher.id),
                            );
                            setSelectedMarchers(newMarchers);
                        } else {
                            setSelectedMarchers([]);
                        }
                        if (args.pageId && args.pageId > 0)
                            setSelectedPage(getPage(args.pageId));
                        break;
                    case Constants.ShapeTableName:
                    case Constants.ShapePageTableName:
                    case Constants.ShapePageMarcherTableName:
                        fetchMarcherPages();
                        fetchShapePages();
                        break;
                    case Constants.PageTableName:
                        fetchPages();
                        if (args.pageId && args.pageId > 0)
                            setSelectedPage(getPage(args.pageId));
                        break;
                    case Constants.FieldPropertiesTableName:
                        fetchFieldProperties();
                }
            }
        };

        window.electron.onHistoryAction(handler);

        window.electron.onImportFieldPropertiesFile(() =>
            fetchFieldProperties(),
        );

        return () => {
            window.electron.removeHistoryActionListener(); // Remove the event listener
        };
    }, [
        getMarcher,
        getPage,
        fetchMarchers,
        fetchMarcherPages,
        fetchPages,
        setSelectedPage,
        setSelectedMarchers,
        marchers,
        fetchShapePages,
        fetchFieldProperties,
    ]);

    // Listen for when measures or pages change so that the pages can be aligned to the measures
    useEffect(() => {
        if (
            pages.length > 0 &&
            measures.length > 0 &&
            pages[0].hasBeenAligned === false
        ) {
            const newPages = Page.alignWithMeasures(pages, measures);
            setPages(newPages);
        }
    }, [measures, pages, setPages]);

    return <></>; // Empty fragment
}

export default StateInitializer;

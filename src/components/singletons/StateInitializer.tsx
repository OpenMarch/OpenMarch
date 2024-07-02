import { useCallback, useEffect } from "react";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { Constants, TablesWithHistory } from "@/global/Constants";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { useMarcherPageStore } from "@/stores/marcherPage/useMarcherPageStore";
import { usePageStore } from "@/stores/page/usePageStore";
import { useMeasureStore } from "../../stores/measure/useMeasureStore";
import Marcher from "../../global/classes/Marcher";
import Page from "../../global/classes/Page";
import MarcherPage from "../../global/classes/MarcherPage";
import Measure from "../../global/classes/Measure";

/**
 * A component that initializes the state of the application.
 * @returns <> </>
 */
function StateInitializer() {
    const { marchers, fetchMarchers } = useMarcherStore();
    const { fetchMarcherPages } = useMarcherPageStore()!;
    const { pages, setPages, fetchPages } = usePageStore();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { measures } = useMeasureStore()!;
    const { setSelectedMarchers } = useSelectedMarchers()!;
    const { fetchMeasures } = useMeasureStore()!;

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
        fetchMarchers();
    }, [fetchMarchers]);

    useEffect(() => {
        Page.fetchPages = fetchPages;
        fetchPages();
    }, [fetchPages]);

    useEffect(() => {
        MarcherPage.fetchMarcherPages = fetchMarcherPages;
        fetchMarcherPages();
    }, [fetchMarcherPages, pages, marchers]);

    useEffect(() => {
        Measure.fetchMeasures = fetchMeasures;
        fetchMeasures();
    }, [fetchMeasures]);

    /*******************************************************************/

    // Select the first page if none are selected. Intended to activate at the initial loading of a webpage
    useEffect(() => {
        if (selectedPage == null && pages.length > 0) setSelectedPage(pages[0]);
    }, [pages, selectedPage, setSelectedPage]);

    useEffect(() => {});

    const getMarcher = useCallback(
        (id: number) => {
            return marchers.find((marcher) => marcher.id === id) || null;
        },
        [marchers]
    );

    const getPage = useCallback(
        (id: number) => {
            return pages.find((page) => page.id === id) || null;
        },
        [pages]
    );

    // Listen for history actions (undo/redo) from the main process
    useEffect(() => {
        const handler = (args: {
            tableName: string;
            marcher_ids: number[];
            page_id: number;
        }) => {
            switch (args.tableName) {
                case Constants.MarcherTableName:
                    fetchMarchers();
                    if (args.marcher_ids.length > 0) {
                        // TODO support passing in all of the marchers that were modified in the undo
                        const newMarchers = marchers.filter((marcher) =>
                            args.marcher_ids.includes(marcher.id)
                        );
                        setSelectedMarchers(newMarchers);
                    } else {
                        setSelectedMarchers([]);
                    }
                    break;
                case Constants.MarcherPageTableName:
                    fetchMarcherPages();
                    if (args.marcher_ids.length > 0) {
                        // TODO support passing in all of the marchers that were modified in the undo
                        const newMarchers = marchers.filter((marcher) =>
                            args.marcher_ids.includes(marcher.id)
                        );
                        setSelectedMarchers(newMarchers);
                    } else {
                        setSelectedMarchers([]);
                    }
                    if (args.page_id > 0)
                        setSelectedPage(getPage(args.page_id));
                    break;
                case Constants.PageTableName:
                    fetchPages();
                    if (args.page_id > 0)
                        setSelectedPage(getPage(args.page_id));
                    break;
            }
            return "SUCCESS";
        };

        window.electron.onHistoryAction(handler);

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
    ]);

    // Listen for fetch actions from the main process
    useEffect(() => {
        const handler = (type: (typeof TablesWithHistory)[number][number]) => {
            switch (type) {
                case Constants.MarcherTableName:
                    fetchMarchers();
                    break;
                case Constants.PageTableName:
                    fetchPages();
                    break;
                case Constants.MarcherPageTableName:
                    fetchMarcherPages();
                    break;
            }
        };

        window.electron.onFetch(handler);

        return () => {
            window.electron.removeFetchListener(); // Remove the event listener
        };
    }, [fetchMarchers, fetchMarcherPages, fetchPages]);

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

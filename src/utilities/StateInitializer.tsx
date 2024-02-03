import { useCallback, useEffect } from "react";
import { useMarcherStore, useMarcherPageStore, usePageStore } from "../global/Store";
import { useSelectedPage } from "../context/SelectedPageContext";
import { Constants } from "@/global/Constants";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { getFieldProperties } from "@/api/api";
import { get } from "http";

/**
 * A component that initializes the state of the application.
 * @returns <> </>
 */
function StateInitializer() {
    const { marchers, fetchMarchers, setMarchersAreLoading } = useMarcherStore();
    const { fetchMarcherPages, setMarcherPagesAreLoading } = useMarcherPageStore()!;
    const { pages, fetchPages, setPagesAreLoading } = usePageStore();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { setSelectedMarchers } = useSelectedMarchers()!;

    useEffect(() => {
        fetchMarchers().finally(() => {
            setMarchersAreLoading(false)
        });
    }, [fetchMarchers, setMarchersAreLoading]);

    useEffect(() => {
        fetchMarcherPages().finally(() => {
            setMarcherPagesAreLoading(false)
        });
    }, [fetchMarcherPages, setMarcherPagesAreLoading, pages]);

    useEffect(() => {
        fetchPages().finally(() => {
            setPagesAreLoading(false);
        });
    }, [fetchPages, setPagesAreLoading]);

    // Select the first page if none are selected. Intended to activate at the initial loading of a webpage
    useEffect(() => {
        if (selectedPage == null && pages.length > 0)
            setSelectedPage(pages[0]);
    }, [pages, selectedPage, setSelectedPage]);

    const getMarcher = useCallback((id: number) => {
        return marchers.find(marcher => marcher.id === id) || null;
    }, [marchers]);

    const getPage = useCallback((id: number) => {
        return pages.find(page => page.id === id) || null;
    }, [pages]);

    useEffect(() => {
        const handler = (args: { tableName: string, marcher_id: number, page_id: number }) => {
            console.log("Undoing " + args.tableName + " with args: " + JSON.stringify(args));
            switch (args.tableName) {
                case Constants.MarcherTableName:
                    fetchMarchers();
                    if (args.marcher_id > 0) {
                        // TODO support passing in all of the marchers that were modified in the undo
                        const newMarcher = getMarcher(args.marcher_id);
                        setSelectedMarchers(newMarcher ? [newMarcher] : []);
                    }
                    break;
                case Constants.MarcherPageTableName:
                    fetchMarcherPages();
                    if (args.marcher_id > 0) {
                        // TODO support passing in all of the marchers that were modified in the undo
                        const newMarcher = getMarcher(args.marcher_id);
                        setSelectedMarchers(newMarcher ? [newMarcher] : []);
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
            return "SUCCESS"
        };

        window.electron.onHistoryAction(handler);

        return () => {
            window.electron.removeHistoryActionListener(); // Remove the event listener
        };
    }, [getMarcher, getPage, fetchMarchers, fetchMarcherPages, fetchPages]);

    useEffect(() => {
        const handler = (type: 'marcher' | 'page' | 'marcher_page') => {
            switch (type) {
                case 'marcher':
                    fetchMarchers();
                    break;
                case 'page':
                    fetchPages();
                    break;
                case 'marcher_page':
                    fetchMarcherPages();
                    break;
            }
        }

        window.electron.onFetch(handler);

        return () => {
            window.electron.removeFetchListener(); // Remove the event listener
        }
    }, [fetchMarchers, fetchMarcherPages, fetchPages]);

    return <></>; // Empty fragment
}

export default StateInitializer;

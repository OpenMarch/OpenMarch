import { useEffect } from "react";
import { useMarcherStore, useMarcherPageStore, usePageStore } from "../stores/Store";
import { useSelectedPage } from "../context/SelectedPageContext";

/**
 * A component that initializes the state of the application.
 * @returns <> </>
 */
function StateInitializer() {
    const { fetchMarchers, setMarchersAreLoading } = useMarcherStore();
    const { fetchMarcherPages, setMarcherPagesAreLoading } = useMarcherPageStore()!;
    const { pages, fetchPages, setPagesAreLoading } = usePageStore();
    const { selectedPage, setSelectedPage } = useSelectedPage()!;

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

    // Select the first page if none are selected. Intended to activate at the iniital loading of a webpage
    useEffect(() => {
        if (selectedPage == null && pages.length > 0)
            setSelectedPage(pages[0]);
    }, [pages, selectedPage, setSelectedPage]);

    return <></>;
}

export default StateInitializer;

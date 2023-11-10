import { useEffect } from "react";
import { useMarcherPageStore, usePageStore, useMarcherStore } from "./stores/Store";

/**
 * A utility component that fetches all the initial data needed for the app to function
 *
 * @returns <></>
 */
function StateInitializer() {
    const { fetchMarcherPages } = useMarcherPageStore()!;
    const { fetchPages } = usePageStore()!;
    const { fetchMarchers } = useMarcherStore()!;

    useEffect(() => {
        fetchMarchers();
        fetchPages();
        fetchMarcherPages();
    }, [fetchMarcherPages, fetchPages, fetchMarchers]);

    return (
        <>
        </>
    );
}

export default StateInitializer;

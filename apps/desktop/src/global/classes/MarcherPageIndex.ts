import MarcherPage from "@/global/classes/MarcherPage";

/**
 * This file defines the structure of the MarcherPageIndex,
 * which is used to manage the storage and mapping of MarcherPages by their IDs.
 *
 * It includes the MarcherPageMap interface, which contains two main properties:
 * - marcherPagesByMarcher: A record that maps marcher IDs to their respective MarcherPages.
 * - marcherPagesByPage: A record that maps page IDs to their respective MarcherPages.
 *
 * This structure allows for efficient retrieval and management of MarcherPages
 * based on both marcher and page identifiers.
 */
export default interface MarcherPageMap {
    /** Maps marcher IDs to their respective MarcherPages */
    marcherPagesByMarcher: MarcherPageNestedMap;

    /** Maps page IDs to their respective MarcherPages */
    marcherPagesByPage: MarcherPageNestedMap;
}

/** A nested map structure for MarcherPages, indexed by marcher_id and page_id.*/
export type MarcherPageNestedMap = Record<number, Record<number, MarcherPage>>;

/** A map of marcher IDs to their respective MarcherPages */
export type MarcherPagesByMarcher = Record<number, MarcherPage>;
/** A map of page IDs to their respective MarcherPages */
export type MarcherPagesByPage = Record<number, MarcherPage>;

/**
 * Creates a marcherPageMap from a flat array of MarcherPage(s),
 * which are typically obtained via a DB fetch.
 */
export function marcherPageMapFromArray(
    rawMarcherPages: MarcherPage[],
): MarcherPageMap {
    const marcherPagesByMarcher: MarcherPageNestedMap = {};
    const marcherPagesByPage: MarcherPageNestedMap = {};

    // Populate maps
    rawMarcherPages.forEach((mp) => {
        if (!marcherPagesByMarcher[mp.marcher_id]) {
            marcherPagesByMarcher[mp.marcher_id] = {};
        }
        marcherPagesByMarcher[mp.marcher_id][mp.page_id] = mp;

        if (!marcherPagesByPage[mp.page_id]) {
            marcherPagesByPage[mp.page_id] = {};
        }
        marcherPagesByPage[mp.page_id][mp.marcher_id] = mp;
    });

    return { marcherPagesByMarcher, marcherPagesByPage };
}

export function toMarcherPagesByMarcher(
    rawMarcherPages: MarcherPage[],
): MarcherPagesByMarcher {
    const marcherPagesByMarcher: MarcherPagesByMarcher = {};
    rawMarcherPages.forEach((mp) => {
        marcherPagesByMarcher[mp.marcher_id] = mp;
    });
    return marcherPagesByMarcher;
}

export function toMarcherPagesByPage(
    rawMarcherPages: MarcherPage[],
): MarcherPagesByPage {
    const marcherPagesByPage: MarcherPagesByPage = {};
    rawMarcherPages.forEach((mp) => {
        marcherPagesByPage[mp.page_id] = mp;
    });
    return marcherPagesByPage;
}

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
export interface MarcherPageMap {
    /** Maps marcher IDs to their respective MarcherPages */
    marcherPagesByMarcher: MarcherPageNestedMap;

    /** Maps page IDs to their respective MarcherPages */
    marcherPagesByPage: MarcherPageNestedMap;
}

/** A nested map structure for MarcherPages, indexed by marcher_id and page_id.*/
export type MarcherPageNestedMap = Record<number, Record<number, MarcherPage>>;

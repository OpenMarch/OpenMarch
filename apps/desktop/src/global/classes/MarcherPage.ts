import type { DatabaseResponse } from "electron/database/DatabaseActions";

/**
 * A MarcherPage is used to represent a Marcher's position on a Page.
 * MarcherPages can/should not be created or deleted directly, but are created and deleted when a Marcher or Page is.
 * There should be a MarcherPage for every Marcher and Page combination (M * P).
 */
export default class MarcherPage {
    /** The id of the MarcherPage in the database */
    readonly id: number;
    /** The id of the page for use in the HTML. E.g. "marcherPage_2" for MarcherPage with ID of 2 */
    readonly id_for_html: string;
    /** The id of the Marcher the MarcherPage is associated with  */
    readonly marcher_id: number;
    /** The id of the Page the MarcherPage is associated with */
    readonly page_id: number;
    /** X coordinate of the MarcherPage */
    readonly x: number;
    /** Y coordinate of the MarcherPage */
    readonly y: number;
    /** Any notes about the MarcherPage. Optional - currently not implemented */
    readonly notes?: string;
    /**
     * Fetches all of the MarcherPages from the database.
     * This is attached to the MarcherPage store and needs to be updated in a useEffect hook so that the UI is updated.
     */
    static fetchMarcherPages: () => Promise<void>;

    constructor(marcherPage: MarcherPage) {
        this.id = marcherPage.id;
        this.id_for_html = marcherPage.id_for_html;
        this.marcher_id = marcherPage.marcher_id;
        this.page_id = marcherPage.page_id;
        this.x = marcherPage.x;
        this.y = marcherPage.y;
        this.notes = marcherPage.notes;
    }

    /**
     * Get's all the MarcherPages that are associated with a given Marcher and/or Page.
     *
     * NO ARGS - get all MarcherPages.
     *
     * ONE ARG - get all MarcherPages for that Marcher or Page.
     *
     * BOTH ARGS - a single MarcherPage for that specific Marcher and Page.
     *
     * @param marcher_id - The id of the marcher. Optional
     * @param page_id - The id of the page. Optional
     * @returns A list of all the marcherPages or those for either a given marcher or page.
     */
    static async getMarcherPages({
        marcher_id,
        page_id,
    }: { marcher_id?: number; page_id?: number } = {}): Promise<MarcherPage[]> {
        const response = await window.electron.getMarcherPages({
            marcher_id,
            page_id,
        });
        return response.data;
    }

    /**
     * Update one or many MarcherPages with the provided arguments.
     *
     * @param modifiedMarcherPages - The objects to update the MarcherPages with.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async updateMarcherPages(
        modifiedMarcherPages: ModifiedMarcherPageArgs[],
    ): Promise<DatabaseResponse<MarcherPage>> {
        const response =
            await window.electron.updateMarcherPages(modifiedMarcherPages);
        // fetch the MarcherPages to update the store
        this.checkForFetchMarcherPages();
        this.fetchMarcherPages();
        return response;
    }

    /**
     * Checks if fetchMarcherPages is defined. If not, it logs an error to the console.
     */
    static checkForFetchMarcherPages() {
        if (!this.fetchMarcherPages)
            console.error(
                "fetchMarcherPages is not defined. The UI will not update properly.",
            );
    }

    /**
     * A simple filter function to filter MarcherPages by page_id.
     *
     * @param marcherPages All MarcherPages to filter
     * @param page_id The page_id to filter by
     * @returns Array of MarcherPages that have the given page_id
     */
    static filterByPageId(
        marcherPages: MarcherPage[],
        page_id: number,
    ): MarcherPage[] {
        return marcherPages.filter(
            (marcherPage) => marcherPage.page_id === page_id,
        );
    }

    /**
     * A simple filter function to filter MarcherPages by marcher_id.
     *
     * @param marcherPages All MarcherPages to filter
     * @param marcher_id The marcher_id to filter by
     * @returns Array of MarcherPages that have the given marcher_id
     */
    static filterByMarcherId(
        marcherPages: MarcherPage[],
        marcher_id: number,
    ): MarcherPage[] {
        return marcherPages.filter(
            (marcherPage) => marcherPage.marcher_id === marcher_id,
        );
    }
}

/**
 * Defines the editable fields of a MarcherPage.
 * `marcher_id` and `page_id` are used to identify the marcherPage and cannot be changed.
 */
export interface ModifiedMarcherPageArgs {
    marcher_id: number;
    page_id: number;
    /** The new X coordinate of the MarcherPage */
    x: number;
    /** The new Y coordinate of the MarcherPage */
    y: number;
    notes?: string;
}

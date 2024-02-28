/**
 * A class that represents a marcher in the database.
 * This is the standard Marcher object that should be used throughout the application.
 */
export class Marcher {
    /** The id of the marcher in the database */
    readonly id: number;
    /** The id of the marcher for use in the HTML. E.g. "marcher_2" for marcher with ID of 2 */
    readonly id_for_html: string;
    /** The name of the marcher. Optional */
    readonly name: string;
    /** The section the marcher is in. E.g. "Color Guard" */
    readonly section: string;
    /** The drill number of the marcher. E.g. "B1" */
    readonly drill_number?: string;
    /** The drill prefix of the marcher's drill number. E.g. "BD" if the drill number is "BD1" */
    readonly drill_prefix: string;
    /** The drill order of the marcher's drill number. E.g. 12 if the drill number is "T12" */
    readonly drill_order: number;
    /** Any notes about the marcher. Optional */
    readonly notes?: string;
    /** The year of the marcher. First year, freshman, etc.. Optional */
    readonly year?: string;
    /**
     * Fetches all of the marchers from the database.
     * This is attached to the Marcher store and needs to be updated in a useEffect hook so that the UI is updated.
     * @returns A list of all the marchers in the database.
     */
    static fetchMarchers: () => Promise<Marcher[]>;

    constructor(marcher: Marcher) {
        this.id = marcher.id;
        this.id_for_html = marcher.id_for_html;
        this.name = marcher.name;
        this.section = marcher.section;
        this.drill_number = marcher.drill_number || marcher.drill_prefix + marcher.drill_order;
        this.drill_prefix = marcher.drill_prefix;
        this.drill_order = marcher.drill_order;
        this.notes = marcher.notes;
        this.year = marcher.year;
    }

    /**
     * Fetches all of the marchers from the database.
     * This should not be called outside of the marcher store - as the current marchers are stored already in the store
     * and the fetchMarchers function is attached to the store and updates the UI.
     * @returns a list of all marchers
     */
    static async getMarchers() {
        const response = await window.electron.getMarchers();
        return response;
    }

    /**
     * Creates a new marcher in the database and updates the store.
     *
     * @param newMarcher - The new marcher object to be created.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async createMarcher(newMarcher: NewMarcherArgs) {
        const response = await window.electron.createMarcher(newMarcher);
        // fetch the marchers to update the store
        this.checkForFetchMarchers();
        this.fetchMarchers();
        return response;
    }

    /**
     * Update one or many marchers with the provided arguments.
     *
     * @param updateMarchers
     */
    static async updateMarchers(modifiedMarchers: ModifiedMarcherArgs[]) {
        const response = await window.electron.updateMarchers(modifiedMarchers);
        // fetch the marchers to update the store
        this.checkForFetchMarchers();
        this.fetchMarchers();
        return response;
    }

    /**
     * Deletes a marcher from the database.
     * CAUTION - this will delete all of the marcherPages associated with the marcher.
     * THIS CANNOT BE UNDONE.
     *
     * @param marcher_id - The id of the marcher. Do not use id_for_html.
     * @returns Response data from the server.
     */
    static async deleteMarcher(marcher_id: number) {
        const response = await window.electron.deleteMarcher(marcher_id);
        // fetch the marchers to update the store
        this.checkForFetchMarchers();
        this.fetchMarchers();
        return response;
    }

    /**
     * Checks if fetchMarchers is defined. If not, it logs an error to the console.
     */
    static checkForFetchMarchers() {
        if (!this.fetchMarchers)
            console.error("fetchMarchers is not defined. The UI will not update properly.");
    }
}

/**
 * Defines the required/available fields of a new marcher.
 */
export interface NewMarcherArgs {
    name?: string;
    section: string;
    drill_prefix: string;
    drill_order: number;
    year?: string;
    notes?: string;
}

/**
 * Defines the editable fields of a marcher.
 */
export interface ModifiedMarcherArgs {
    /**
     * The id of the marcher to update.
     */
    id: number;
    name?: string;
    section?: string;
    drill_prefix?: string;
    drill_order?: number;
    year?: string;
    notes?: string;
}

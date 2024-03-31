import { getSectionObjectByName } from "./Sections";

/**
 * A class that represents a marcher in the database.
 * This is the standard Marcher object that should be used throughout the application.
 *
 * Note: this class has no/should not have instance methods. All methods are static.
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
    /** The drill number of the marcher. E.g. "B1"
     * Cannot be manually set and is always the combination of the drill prefix and drill order. "B1" */
    readonly drill_number: string;
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
     */
    static fetchMarchers: () => Promise<void>;

    constructor({ id, id_for_html, name, section, drill_prefix, drill_order, notes, year }:
        { id: number, id_for_html: string, name: string, section: string, drill_prefix: string, drill_order: number, notes?: string, year?: string }) {
        this.id = id;
        this.id_for_html = id_for_html;
        this.name = name;
        this.section = section;
        this.drill_number = drill_prefix + drill_order;
        this.drill_prefix = drill_prefix;
        this.drill_order = drill_order;
        this.notes = notes;
        this.year = year;
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
     * @param modifiedMarchers - The objects to update the marchers with.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
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

    /**
     * Compares a marcher to another marcher based on their section and drill order.
     *
     * If the sections are different, the comparison is based on the section's compareTo method.
     * If the sections are the same, the comparison is based on the drill order.
     *
     * @param a - The first marcher to compare.
     * @param b - The second marcher to compare.
     * @returns The difference between the section and drill order of this marcher and the other marcher.
     */
    static compare(a: Marcher, b: Marcher): number {
        const aSectionObject = getSectionObjectByName(a.section);
        const bSectionObject = getSectionObjectByName(b.section);
        const sectionComparison = aSectionObject.compareTo(bSectionObject);
        if (sectionComparison !== 0)
            // If the sections are different, return the section comparison, ignoring the drill order
            return sectionComparison;
        else
            // If the sections are the same, return the drill order comparison
            return a.drill_order - b.drill_order;
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

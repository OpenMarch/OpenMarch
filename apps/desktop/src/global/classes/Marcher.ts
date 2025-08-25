import type { DatabaseResponse } from "electron/database/DatabaseActions";
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
    /** The name of the marcher. Optional */
    readonly name: string | null;
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
    readonly notes: string | null;
    /** The year of the marcher. First year, freshman, etc.. Optional */
    readonly year: string | null;
    /**
     * Fetches all of the marchers from the database.
     * This is attached to the Marcher store and needs to be updated in a useEffect hook so that the UI is updated.
     */
    static fetchMarchers: () => Promise<void>;

    constructor({
        id,
        name = null,
        section,
        drill_prefix,
        drill_order,
        notes = null,
        year = null,
    }: {
        id: number;
        name?: string | null;
        section: string;
        drill_prefix: string;
        drill_order: number;
        notes?: string | null;
        year?: string | null;
    }) {
        this.id = id;
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
    static async getMarchers(): Promise<Marcher[]> {
        const response = await window.electron.getMarchers();
        return response.data.map(
            (dbMarcher: DatabaseMarcher) => new Marcher(dbMarcher),
        );
    }

    /**
     * Creates new marchers in the database and updates the store.
     *
     * @param newMarchers - The new marcher objects to be created.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async createMarchers(
        newMarchers: NewMarcherArgs[],
    ): Promise<DatabaseResponse<Marcher[]>> {
        const response = await window.electron.createMarchers(newMarchers);
        // fetch the marchers to update the store
        this.checkForFetchMarchers();
        this.fetchMarchers();
        return {
            ...response,
            data: response.data.map(
                (dbMarcher: DatabaseMarcher) => new Marcher(dbMarcher),
            ),
        };
    }

    /**
     * Update one or many marchers with the provided arguments.
     *
     * @param modifiedMarchers - The objects to update the marchers with.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async updateMarchers(
        modifiedMarchers: ModifiedMarcherArgs[],
    ): Promise<DatabaseResponse<Marcher[]>> {
        const response = await window.electron.updateMarchers(modifiedMarchers);
        // fetch the marchers to update the store
        this.checkForFetchMarchers();
        this.fetchMarchers();
        return {
            ...response,
            data: response.data.map(
                (dbMarcher: DatabaseMarcher) => new Marcher(dbMarcher),
            ),
        };
    }

    /**
     * Deletes a marcher from the database.
     * This will also delete the marcher pages associated with the marcher.
     *
     * @param marcher_id - The id of the marche.
     * @returns Response data from the server.
     */
    static async deleteMarchers(
        marcherIds: Set<number>,
    ): Promise<DatabaseResponse<Marcher[]>> {
        const response = await window.electron.deleteMarchers(marcherIds);
        // fetch the marchers to update the store
        this.checkForFetchMarchers();
        this.fetchMarchers();
        return {
            ...response,
            data: response.data.map(
                (dbMarcher: DatabaseMarcher) => new Marcher(dbMarcher),
            ),
        };
    }

    /**
     * Checks if fetchMarchers is defined. If not, it logs an error to the console.
     */
    static checkForFetchMarchers() {
        if (!this.fetchMarchers)
            console.error(
                "fetchMarchers is not defined. The UI will not update properly.",
            );
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
        // If the sections are the same, return the drill order comparison
        else return a.drill_order - b.drill_order;
    }

    static _toDatabaseMarchers(marchers: Marcher[]): DatabaseMarcher[] {
        return marchers.map((marcher) => ({
            id: marcher.id,
            name: marcher.name,
            section: marcher.section,
            drill_prefix: marcher.drill_prefix,
            drill_order: marcher.drill_order,
            notes: marcher.notes,
            year: marcher.year,
            created_at: "",
            updated_at: "",
        }));
    }
}

export default Marcher;

/**
 * Defines the fields of a marcher in the database.
 */
export interface DatabaseMarcher {
    id: number;
    name: string | null;
    section: string;
    drill_prefix: string;
    drill_order: number;
    notes: string | null;
    year: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Defines the required/available fields of a new marcher.
 */
export interface NewMarcherArgs {
    name?: string | null;
    section: string;
    drill_prefix: string;
    drill_order: number;
    year?: string | null;
    notes?: string | null;
}

/**
 * Defines the editable fields of a marcher.
 */
export interface ModifiedMarcherArgs {
    /**
     * The id of the marcher to update.
     */
    id: number;
    name?: string | null;
    section?: string;
    drill_prefix?: string;
    drill_order?: number;
    year?: string | null;
    notes?: string | null;
}

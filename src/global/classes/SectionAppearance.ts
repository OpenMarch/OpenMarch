import {
    SectionAppearance as DatabaseSectionAppearance,
    NewSectionAppearanceArgs,
    ModifiedSectionAppearanceArgs,
} from "electron/database/tables/SectionAppearanceTable";

export class SectionAppearance implements DatabaseSectionAppearance {
    readonly id: number;
    readonly section: string;
    readonly fill_color: string;
    readonly outline_color: string;
    readonly shape_type: string;
    readonly created_at: string;
    readonly updated_at: string;

    constructor({
        id,
        section,
        fill_color,
        outline_color,
        shape_type,
        created_at,
        updated_at,
    }: DatabaseSectionAppearance) {
        this.id = id;
        this.section = section;
        this.fill_color = fill_color;
        this.outline_color = outline_color;
        this.shape_type = shape_type;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    /**
     * Get all section appearances or those for a specific section
     * @param section Optional section name to filter by
     * @returns Promise with array of SectionAppearance objects
     */
    static async getSectionAppearances(
        section?: string,
    ): Promise<SectionAppearance[]> {
        const response = await window.electron.getSectionAppearances(section);
        if (response.success) {
            return response.data.map(
                (appearance) => new SectionAppearance(appearance),
            );
        } else {
            console.error("Failed to get section appearances:", response.error);
            return [];
        }
    }

    /**
     * Create new section appearances
     * @param newAppearances Array of new section appearance data
     * @returns Promise with array of created SectionAppearance objects
     */
    static async createSectionAppearances(
        newAppearances: NewSectionAppearanceArgs[],
    ): Promise<SectionAppearance[]> {
        const response =
            await window.electron.createSectionAppearances(newAppearances);
        if (response.success) {
            return response.data.map(
                (appearance) => new SectionAppearance(appearance),
            );
        } else {
            console.error(
                "Failed to create section appearances:",
                response.error,
            );
            return [];
        }
    }

    /**
     * Update existing section appearances
     * @param modifiedAppearances Array of modified section appearance data
     * @returns Promise with array of updated SectionAppearance objects
     */
    static async updateSectionAppearances(
        modifiedAppearances: ModifiedSectionAppearanceArgs[],
    ): Promise<SectionAppearance[]> {
        const response =
            await window.electron.updateSectionAppearances(modifiedAppearances);
        if (response.success) {
            return response.data.map(
                (appearance) => new SectionAppearance(appearance),
            );
        } else {
            console.error(
                "Failed to update section appearances:",
                response.error,
            );
            return [];
        }
    }

    /**
     * Delete section appearances
     * @param appearanceIds Array of section appearance IDs to delete
     * @returns Promise with array of deleted SectionAppearance objects
     */
    static async deleteSectionAppearances(
        appearanceIds: number[],
    ): Promise<SectionAppearance[]> {
        const response =
            await window.electron.deleteSectionAppearances(appearanceIds);
        if (response.success) {
            return response.data.map(
                (appearance) => new SectionAppearance(appearance),
            );
        } else {
            console.error(
                "Failed to delete section appearances:",
                response.error,
            );
            return [];
        }
    }
}

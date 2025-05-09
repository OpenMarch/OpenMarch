import { RgbaColor } from "@uiw/react-color";
import { SectionAppearance as DatabaseSectionAppearance } from "electron/database/tables/SectionAppearanceTable";
import { rgbaToString } from "./FieldTheme";

// Parse rbga(0, 0, 0, 1) string color to RGBA color
function parseColor(colorStr: string): RgbaColor {
    // Extract r, g, b, a values from rgba string
    const match = colorStr.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)/,
    );
    if (match) {
        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10),
            a: match[4] ? parseFloat(match[4]) : 1,
        };
    }
    // Default fallback color
    return { r: 0, g: 0, b: 0, a: 1 };
}

function createDatabaseSectionAppearance<
    T extends { fill_color?: RgbaColor; outline_color?: RgbaColor },
>(
    args: T,
): Omit<T, "fill_color" | "outline_color"> & {
    fill_color?: string;
    outline_color?: string;
} {
    const { fill_color, outline_color, ...rest } = args;
    return {
        ...rest,
        ...(fill_color && { fill_color: rgbaToString(fill_color) }),
        ...(outline_color && { outline_color: rgbaToString(outline_color) }),
    };
}

/**
 * Arguments for creating a new section appearance
 */
export interface NewSectionAppearanceArgs {
    section: string;
    fill_color: RgbaColor;
    outline_color: RgbaColor;
    shape_type?: string;
}

/**
 * Arguments for modifying an existing section appearance
 */
export interface ModifiedSectionAppearanceArgs {
    id: number;
    fill_color?: RgbaColor;
    outline_color?: RgbaColor;
    shape_type?: string;
}

export class SectionAppearance {
    readonly id: number;
    readonly section: string;
    readonly fill_color: RgbaColor;
    readonly outline_color: RgbaColor;
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
        this.fill_color = parseColor(fill_color);
        this.outline_color = parseColor(outline_color);
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
        const response = await window.electron.createSectionAppearances(
            newAppearances.map(createDatabaseSectionAppearance),
        );
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
        const response = await window.electron.updateSectionAppearances(
            modifiedAppearances.map(createDatabaseSectionAppearance),
        );
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

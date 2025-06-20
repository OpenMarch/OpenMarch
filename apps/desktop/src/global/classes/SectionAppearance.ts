import { RgbaColor } from "@uiw/react-color";
import { rgbaToString } from "./FieldTheme";
import { db, schema } from "../database/db";
import { eq, inArray } from "drizzle-orm";
import { incrementUndoGroup } from "./History";

const { section_appearances } = schema;

// Define types from the existing schema
type DatabaseSectionAppearance = typeof section_appearances.$inferSelect;

// Parse rgba(0, 0, 0, 1) string color to RGBA color
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

/**
 * Get section appearance for a marcher based on section
 * @param section The section name to find appearance for
 * @returns The section appearance if found, or undefined
 */
export function getSectionAppearance(
    section: string,
    sectionAppearances: SectionAppearance[],
): SectionAppearance | undefined {
    return sectionAppearances.find(
        (appearance) => appearance.section === section,
    );
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
        let queryBuilder = db.select().from(section_appearances).$dynamic();

        if (section) {
            queryBuilder = queryBuilder.where(
                eq(section_appearances.section, section),
            );
        }

        const results = await queryBuilder.all();
        return results.map((row) => new SectionAppearance(row));
    }

    /**
     * Create new section appearances
     * @param newAppearances Array of new section appearance data
     * @returns Promise with array of created SectionAppearance objects
     */
    static async createSectionAppearances(
        newAppearances: NewSectionAppearanceArgs[],
    ): Promise<SectionAppearance[]> {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results = await tx
                .insert(section_appearances)
                .values(newAppearances.map(createDatabaseSectionAppearance))
                .returning()
                .all();

            return results.map((row) => new SectionAppearance(row));
        });
    }

    /**
     * Update existing section appearances
     * @param modifiedAppearances Array of modified section appearance data
     * @returns Promise with array of updated SectionAppearance objects
     */
    static async updateSectionAppearances(
        modifiedAppearances: ModifiedSectionAppearanceArgs[],
    ): Promise<SectionAppearance[]> {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results: DatabaseSectionAppearance[] = [];

            for (const modifiedAppearance of modifiedAppearances) {
                const result = await tx
                    .update(section_appearances)
                    .set(createDatabaseSectionAppearance(modifiedAppearance))
                    .where(eq(section_appearances.id, modifiedAppearance.id))
                    .returning()
                    .get();
                results.push(result);
            }

            return results.map((row) => new SectionAppearance(row));
        });
    }

    /**
     * Delete section appearances
     * @param appearanceIds Array of section appearance IDs to delete
     * @returns Promise with array of deleted SectionAppearance objects
     */
    static async deleteSectionAppearances(
        appearanceIds: number[],
    ): Promise<SectionAppearance[]> {
        return await db.transaction(async (tx) => {
            await incrementUndoGroup(tx);

            const results = await tx
                .delete(section_appearances)
                .where(inArray(section_appearances.id, appearanceIds))
                .returning()
                .all();

            return results.map((row) => new SectionAppearance(row));
        });
    }
}

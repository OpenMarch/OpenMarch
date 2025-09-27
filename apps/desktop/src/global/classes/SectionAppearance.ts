import { RgbaColor } from "@uiw/react-color";
import { schema } from "../database/db";

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

/**
 * Get section appearance for a marcher based on section
 * @param section The section name to find appearance for
 * @param sectionAppearances Array of SectionAppearance objects to search in
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
}

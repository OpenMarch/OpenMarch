import { sqliteTable } from "drizzle-orm/sqlite-core";
import { appearance_columns } from "../../electron/database/migrations/schema";
import { InferSelectModel } from "drizzle-orm";
import { RgbaColor, rgbaToString } from "@openmarch/core";

/** a table that is used to infer the type of the appearance columns. Do not export this table. */
const fakeAppearanceTable = sqliteTable("fake_appearance_table", {
    ...appearance_columns,
});

/** Definition of a marcher appearance exactly as it is stored in the database. */
export type AppearanceComponentRaw = InferSelectModel<
    typeof fakeAppearanceTable
>;

// Parse rgba(0, 0, 0, 1) string color to RGBA color
function parseRgbaColor(colorStr: string): RgbaColor {
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

/** Parsed definition of a marcher appearance. The colors are parsed and integers are converted to booleans. */
export type AppearanceComponent = Omit<
    AppearanceComponentRaw,
    "fill_color" | "outline_color" | "visible" | "label_visible"
> & {
    fill_color: RgbaColor | null;
    outline_color: RgbaColor | null;
    visible: boolean;
    label_visible: boolean;
};

/** Definition of a marcher appearance, with all of the non-required fields optional */
export type AppearanceComponentOptional = Pick<
    AppearanceComponent,
    "visible" | "label_visible"
> &
    Partial<AppearanceComponent>;

/** Definition of a marcher appearance, with all of the non-required fields optional */
export type AppearanceComponentRawOptional = Pick<
    AppearanceComponentRaw,
    "visible" | "label_visible"
> &
    Partial<AppearanceComponentRaw>;

/**
 * Converts a raw appearance model from the database to a parsed appearance model.
 *
 * @param appearance - The raw appearance model from the database.
 * @returns The parsed appearance model.
 */
export const appearanceModelRawToParsed = (
    appearance: AppearanceComponentRaw,
): AppearanceComponent => {
    return {
        ...appearance,
        fill_color: appearance.fill_color
            ? parseRgbaColor(appearance.fill_color)
            : null,
        outline_color: appearance.outline_color
            ? parseRgbaColor(appearance.outline_color)
            : null,
        visible: appearance.visible === 1,
        label_visible: appearance.label_visible === 1,
    };
};

/**
 * Converts a parsed appearance model to a raw appearance model.
 *
 * @param appearance - The parsed appearance model.
 * @returns The raw appearance model.
 */
export const appearanceModelParsedToRaw = (
    appearance: AppearanceComponent,
): AppearanceComponentRaw => {
    return {
        ...appearance,
        fill_color: appearance.fill_color
            ? rgbaToString(appearance.fill_color)
            : null,
        outline_color: appearance.outline_color
            ? rgbaToString(appearance.outline_color)
            : null,
        visible: appearance.visible ? 1 : 0,
        label_visible: appearance.label_visible ? 1 : 0,
    };
};

export const appearanceModelParsedToRawOptional = (
    appearance: AppearanceComponentOptional,
): AppearanceComponentRawOptional => {
    const output: AppearanceComponentRawOptional = {
        ...appearance,
        visible: appearance.visible ? 1 : 0,
        label_visible: appearance.label_visible ? 1 : 0,
    } as AppearanceComponentRawOptional;

    if (appearance.fill_color != null) {
        output.fill_color = rgbaToString(appearance.fill_color);
    }
    if (appearance.outline_color != null) {
        output.outline_color = rgbaToString(appearance.outline_color);
    }

    return output;
};

export function appearanceIsHidden(
    appearancesInput:
        | AppearanceComponentOptional[]
        | AppearanceComponentOptional,
): boolean {
    const appearances = Array.isArray(appearancesInput)
        ? appearancesInput
        : [appearancesInput];

    let visible: boolean;
    if (appearances.length > 0)
        if (appearances.length > 1 && appearances[0].visible) {
            // If there is more than one appearance, and the marcherPage appearance is true, use the next one
            // This is because the marcherPage will almost always be visible
            visible = appearances[1].visible;
        } else {
            visible = appearances[0].visible;
        }
    else visible = true;

    return !visible;
}

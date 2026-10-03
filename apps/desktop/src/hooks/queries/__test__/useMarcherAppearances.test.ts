import { describe, it, expect } from "vitest";
import { _combineMarcherAppearances } from "../useMarcherAppearances";
import { FAMILIES } from "@/global/classes/Sections";
import { DEFAULT_FIELD_THEME } from "@openmarch/core";
import type { FieldProperties, RgbaColor } from "@openmarch/core";
import type Marcher from "@/global/classes/Marcher";
import type { SectionAppearance } from "@/db-functions";
import type { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import type { AppearanceComponentOptional } from "@/entity-components/appearance";

const fieldProperties = {
    theme: DEFAULT_FIELD_THEME,
} as unknown as FieldProperties;

const firstFill = (stack: AppearanceComponentOptional[]) =>
    stack.find((a) => a.fill_color != null)?.fill_color;

const combineFor = (
    section: string,
    sectionAppearances: SectionAppearance[] = [],
) =>
    _combineMarcherAppearances({
        marchers: [{ id: 1, section } as unknown as Marcher],
        sectionAppearances,
        marcherIdsByTagId: new Map(),
        tagAppearances: [],
        marcherPages: {} as MarcherPagesByMarcher,
        fieldProperties,
    });

describe("_combineMarcherAppearances family color fallback", () => {
    it("fills a marcher with its section's family color when no custom appearance exists", () => {
        const result = combineFor("Trumpet");
        expect(firstFill(result[1]!)).toEqual(FAMILIES.Brass.color);
    });

    it("uses the correct family color for a different family", () => {
        const result = combineFor("Marimba");
        expect(firstFill(result[1]!)).toEqual(FAMILIES.Pit.color);
    });

    it("lets a section appearance override the family color", () => {
        const custom: RgbaColor = { r: 1, g: 2, b: 3, a: 1 };
        const sectionAppearance = {
            section: "Trumpet",
            fill_color: custom,
            outline_color: null,
            shape_type: null,
            visible: true,
            label_visible: true,
        } as unknown as SectionAppearance;
        const result = combineFor("Trumpet", [sectionAppearance]);
        expect(firstFill(result[1]!)).toEqual(custom);
    });

    it("ranks the family color above the theme default fill", () => {
        const result = combineFor("Trumpet");
        expect(firstFill(result[1]!)).not.toEqual(
            DEFAULT_FIELD_THEME.defaultMarcher.fill,
        );
    });
});

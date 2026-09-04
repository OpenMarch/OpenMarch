import { describe, expect, it } from "vitest";
import { createFieldTheme } from "@openmarch/core";
import {
    rgbaToSchemaString,
    resolveAppearanceFromStack,
} from "@/entity-components/appearance";
import Marcher from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import { SectionAppearance, TagAppearance } from "@/db-functions";
import { combineMarcherAppearances } from "../combine-appearances";

const fieldTheme = createFieldTheme({
    defaultMarcher: {
        fill: { r: 200, g: 50, b: 50, a: 1 },
        outline: { r: 0, g: 0, b: 0, a: 1 },
        label: { r: 0, g: 0, b: 0, a: 1 },
    },
    shapeType: "circle",
});

const createMarcher = (
    id: number,
    section: string,
    drillPrefix: string,
): Marcher => ({
    id,
    name: null,
    section,
    drill_prefix: drillPrefix,
    drill_order: id,
    year: null,
    notes: null,
    drill_number: `${drillPrefix}${id}`,
    created_at: "",
    updated_at: "",
});

const createSectionAppearance = (
    overrides: Partial<SectionAppearance> & Pick<SectionAppearance, "section">,
): SectionAppearance => ({
    id: 1,
    fill_color: null,
    outline_color: null,
    shape_type: null,
    visible: true,
    label_visible: true,
    equipment_name: null,
    equipment_state: null,
    created_at: "",
    updated_at: "",
    ...overrides,
});

const createTagAppearance = (
    overrides: Partial<TagAppearance> &
        Pick<TagAppearance, "id" | "tag_id" | "start_page_id">,
): TagAppearance => ({
    priority: 1,
    fill_color: null,
    outline_color: null,
    shape_type: null,
    visible: true,
    label_visible: true,
    equipment_name: null,
    equipment_state: null,
    created_at: "",
    updated_at: "",
    ...overrides,
});

const createMarcherPage = (
    overrides: Partial<MarcherPage> &
        Pick<MarcherPage, "id" | "marcher_id" | "page_id">,
): MarcherPage => ({
    x: 0,
    y: 0,
    notes: null,
    path_data_id: null,
    path_start_position: null,
    path_end_position: null,
    rotation_degrees: 0,
    fill_color: null,
    outline_color: null,
    shape_type: null,
    visible: true,
    label_visible: true,
    equipment_name: null,
    equipment_state: null,
    created_at: "",
    updated_at: "",
    ...overrides,
});

/** Resolves a marcher's appearance stack from `combineMarcherAppearances`'s output. */
const resolveFor = (
    marcherId: number,
    appearancesByMarcherId: ReturnType<typeof combineMarcherAppearances>,
) => resolveAppearanceFromStack(appearancesByMarcherId[marcherId]!, fieldTheme);

describe("combineMarcherAppearances", () => {
    it("uses theme defaults when nothing overrides", () => {
        const marchers = [createMarcher(1, "Trumpet", "T")];

        const result = combineMarcherAppearances({
            marchers,
            sectionAppearances: [],
            marcherIdsByTagId: new Map(),
            tagAppearances: [],
            marcherPages: {},
            fieldProperties: { theme: fieldTheme },
        });

        const resolved = resolveFor(1, result);
        expect(resolved.fillRgba).toBe(
            rgbaToSchemaString(fieldTheme.defaultMarcher.fill),
        );
        expect(resolved.strokeRgba).toBe(
            rgbaToSchemaString(fieldTheme.defaultMarcher.outline),
        );
        expect(resolved.shape).toBe("circle");
        expect(resolved.visible).toBe(true);
        expect(resolved.textVisible).toBe(true);
    });

    it("applies marcher-page, then tag, then section, then theme", () => {
        const marchers = [
            createMarcher(1, "Trumpet", "T"),
            createMarcher(2, "Trumpet", "T"),
            createMarcher(3, "Trumpet", "T"),
            createMarcher(4, "Trombone", "R"),
        ];
        const sectionAppearances = [
            createSectionAppearance({
                section: "Trumpet",
                fill_color: { r: 1, g: 2, b: 3, a: 1 },
            }),
        ];
        const tagAppearances = [
            createTagAppearance({
                id: 10,
                tag_id: 1,
                start_page_id: 1,
                fill_color: { r: 10, g: 20, b: 30, a: 1 },
            }),
        ];
        const marcherPages: MarcherPagesByMarcher = {
            1: createMarcherPage({
                id: 100,
                marcher_id: 1,
                page_id: 1,
                fill_color: { r: 40, g: 50, b: 60, a: 1 },
            }),
        };

        const result = combineMarcherAppearances({
            marchers,
            sectionAppearances,
            marcherIdsByTagId: new Map([[1, [1, 2]]]),
            tagAppearances,
            marcherPages,
            fieldProperties: { theme: fieldTheme },
        });

        expect(resolveFor(1, result).fillRgba).toBe("rgba(40,50,60,1)");
        expect(resolveFor(2, result).fillRgba).toBe("rgba(10,20,30,1)");
        expect(resolveFor(3, result).fillRgba).toBe("rgba(1,2,3,1)");
        expect(resolveFor(4, result).fillRgba).toBe(
            rgbaToSchemaString(fieldTheme.defaultMarcher.fill),
        );
    });

    it("uses higher-priority tags before lower-priority tags", () => {
        const marchers = [createMarcher(1, "Trumpet", "T")];
        const tagAppearances = [
            createTagAppearance({
                id: 10,
                tag_id: 1,
                start_page_id: 1,
                priority: 1,
                fill_color: { r: 10, g: 20, b: 30, a: 1 },
            }),
            createTagAppearance({
                id: 11,
                tag_id: 2,
                start_page_id: 1,
                priority: 5,
                fill_color: { r: 70, g: 80, b: 90, a: 1 },
            }),
        ];

        const result = combineMarcherAppearances({
            marchers,
            sectionAppearances: [],
            marcherIdsByTagId: new Map([
                [1, [1]],
                [2, [1]],
            ]),
            tagAppearances,
            marcherPages: {},
            fieldProperties: { theme: fieldTheme },
        });

        expect(resolveFor(1, result).fillRgba).toBe("rgba(70,80,90,1)");
    });

    it("returns an empty map when there are no marchers", () => {
        const result = combineMarcherAppearances({
            marchers: [],
            sectionAppearances: [],
            marcherIdsByTagId: new Map(),
            tagAppearances: [],
            marcherPages: {},
            fieldProperties: { theme: fieldTheme },
        });

        expect(result).toEqual({});
    });
});

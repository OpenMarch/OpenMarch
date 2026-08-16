import { describe, expect, it } from "vitest";
import { createFieldTheme } from "@openmarch/core";
import { rgbaToSchemaString } from "@/entity-components/appearance";
import Marcher from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import { SectionAppearance, TagAppearance } from "@/db-functions";
import { _toAppearanceTimeline } from "../useMarcherAppearances";

const fieldTheme = createFieldTheme({
    defaultMarcher: {
        fill: { r: 200, g: 50, b: 50, a: 1 },
        outline: { r: 0, g: 0, b: 0, a: 1 },
        label: { r: 0, g: 0, b: 0, a: 1 },
    },
    shapeType: "circle",
});

const pages = [
    { page_id: 1, timestamp: 0 },
    { page_id: 2, timestamp: 1000 },
    { page_id: 3, timestamp: 2000 },
    { page_id: 4, timestamp: 3000 },
];

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

describe("_toAppearanceTimeline", () => {
    it("uses theme defaults when nothing overrides and collapses identical pages", () => {
        const marchers = [createMarcher(1, "Trumpet", "T")];

        const [timeline] = _toAppearanceTimeline(
            pages,
            marchers,
            [],
            new Map(),
            [],
            [],
            fieldTheme,
        );

        expect(timeline.timestamps).toEqual([0]);
        expect(timeline.appearances).toHaveLength(1);
        expect(timeline.appearances[0].fillRgba).toBe(
            rgbaToSchemaString(fieldTheme.defaultMarcher.fill),
        );
        expect(timeline.appearances[0].strokeRgba).toBe(
            rgbaToSchemaString(fieldTheme.defaultMarcher.outline),
        );
        expect(timeline.appearances[0].shape).toBe("circle");
        expect(timeline.appearances[0].visible).toBe(true);
        expect(timeline.appearances[0].textVisible).toBe(true);
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
        const marcherPages = [
            createMarcherPage({
                id: 100,
                marcher_id: 1,
                page_id: 1,
                fill_color: { r: 40, g: 50, b: 60, a: 1 },
            }),
        ];

        const timelines = _toAppearanceTimeline(
            [{ page_id: 1, timestamp: 0 }],
            marchers,
            sectionAppearances,
            new Map([[1, [1, 2]]]),
            tagAppearances,
            marcherPages,
            fieldTheme,
        );

        expect(timelines).toHaveLength(4);
        expect(timelines[0].appearances[0].fillRgba).toBe("rgba(40,50,60,1)");
        expect(timelines[1].appearances[0].fillRgba).toBe("rgba(10,20,30,1)");
        expect(timelines[2].appearances[0].fillRgba).toBe("rgba(1,2,3,1)");
        expect(timelines[3].appearances[0].fillRgba).toBe(
            rgbaToSchemaString(fieldTheme.defaultMarcher.fill),
        );
    });

    it("keeps a tag appearance until a later start_page_id for the same tag", () => {
        const marchers = [createMarcher(1, "Trumpet", "T")];
        const tagAppearances = [
            createTagAppearance({
                id: 10,
                tag_id: 1,
                start_page_id: 1,
                shape_type: "triangle",
            }),
            createTagAppearance({
                id: 11,
                tag_id: 1,
                start_page_id: 3,
                shape_type: "square",
            }),
        ];

        const [timeline] = _toAppearanceTimeline(
            pages,
            marchers,
            [],
            new Map([[1, [1]]]),
            tagAppearances,
            [],
            fieldTheme,
        );

        expect(timeline.timestamps).toEqual([0, 2000]);
        expect(
            timeline.appearances.map((appearance) => appearance.shape),
        ).toEqual(["triangle", "square"]);
    });

    it("collapses consecutive identical appearances into a single keyframe", () => {
        const marchers = [createMarcher(1, "Trumpet", "T")];
        const tagAppearances = [
            createTagAppearance({
                id: 10,
                tag_id: 1,
                start_page_id: 3,
                shape_type: "x",
            }),
        ];

        const [timeline] = _toAppearanceTimeline(
            pages,
            marchers,
            [],
            new Map([[1, [1]]]),
            tagAppearances,
            [],
            fieldTheme,
        );

        expect(timeline.timestamps).toEqual([0, 2000]);
        expect(timeline.appearances[0].shape).toBe("circle");
        expect(timeline.appearances[1].shape).toBe("cross");
    });

    it("returns empty timelines when there are no pages", () => {
        const marchers = [createMarcher(1, "Trumpet", "T")];

        const timelines = _toAppearanceTimeline(
            [],
            marchers,
            [],
            new Map(),
            [],
            [],
            fieldTheme,
        );

        expect(timelines).toHaveLength(1);
        expect(timelines[0].timestamps).toEqual([]);
        expect(timelines[0].appearances).toEqual([]);
    });
});

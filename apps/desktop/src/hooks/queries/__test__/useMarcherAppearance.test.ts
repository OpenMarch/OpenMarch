import { describe, expect, it } from "vitest";
import { createFieldTheme } from "@openmarch/core";
import { rgbaToSchemaString } from "@/entity-components/appearance";
import MarcherPage from "@/global/classes/MarcherPage";
import { MarcherPagesByPage } from "@/global/classes/MarcherPageIndex";
import { SectionAppearance, TagAppearance } from "@/db-functions";
import { _toMarcherAppearanceTimeline } from "../useMarcherAppearance";

const emptyMarcherPagesByPage: MarcherPagesByPage = {};

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

describe("_toMarcherAppearanceTimeline", () => {
    it("starts at timestamp 0 with theme defaults and collapses identical pages", () => {
        const timeline = _toMarcherAppearanceTimeline(
            pages,
            "Trumpet",
            [],
            emptyMarcherPagesByPage,
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

    it("lets marcher-page override tag, section, and theme", () => {
        const timeline = _toMarcherAppearanceTimeline(
            [{ page_id: 1, timestamp: 0 }],
            "Trumpet",
            [
                createSectionAppearance({
                    section: "Trumpet",
                    fill_color: { r: 1, g: 2, b: 3, a: 1 },
                }),
            ],
            {
                1: createMarcherPage({
                    id: 100,
                    marcher_id: 1,
                    page_id: 1,
                    fill_color: { r: 40, g: 50, b: 60, a: 1 },
                }),
            },
            [1],
            [
                createTagAppearance({
                    id: 10,
                    tag_id: 1,
                    start_page_id: 1,
                    fill_color: { r: 10, g: 20, b: 30, a: 1 },
                }),
            ],
            fieldTheme,
        );

        expect(timeline.appearances[0].fillRgba).toBe("rgba(40,50,60,1)");
    });

    it("uses higher-priority tags before lower-priority tags", () => {
        const timeline = _toMarcherAppearanceTimeline(
            [{ page_id: 1, timestamp: 0 }],
            "Trumpet",
            [
                createSectionAppearance({
                    section: "Trumpet",
                    fill_color: { r: 1, g: 2, b: 3, a: 1 },
                }),
            ],
            emptyMarcherPagesByPage,
            [1, 2],
            [
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
            ],
            fieldTheme,
        );

        expect(timeline.appearances[0].fillRgba).toBe("rgba(70,80,90,1)");
    });

    it("falls back to section appearance when no marcher-page or tag applies", () => {
        const timeline = _toMarcherAppearanceTimeline(
            [{ page_id: 1, timestamp: 0 }],
            "Trumpet",
            [
                createSectionAppearance({
                    section: "Trumpet",
                    fill_color: { r: 1, g: 2, b: 3, a: 1 },
                }),
            ],
            emptyMarcherPagesByPage,
            [],
            [],
            fieldTheme,
        );

        expect(timeline.appearances[0].fillRgba).toBe("rgba(1,2,3,1)");
    });

    it("falls back to the field theme when nothing else applies", () => {
        const timeline = _toMarcherAppearanceTimeline(
            [{ page_id: 1, timestamp: 0 }],
            "Trombone",
            [
                createSectionAppearance({
                    section: "Trumpet",
                    fill_color: { r: 1, g: 2, b: 3, a: 1 },
                }),
            ],
            emptyMarcherPagesByPage,
            [],
            [],
            fieldTheme,
        );

        expect(timeline.appearances[0].fillRgba).toBe(
            rgbaToSchemaString(fieldTheme.defaultMarcher.fill),
        );
    });

    it("keeps a tag appearance until a later start_page_id for the same tag", () => {
        const timeline = _toMarcherAppearanceTimeline(
            pages,
            "Trumpet",
            [],
            emptyMarcherPagesByPage,
            [1],
            [
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
            ],
            fieldTheme,
        );

        expect(timeline.timestamps).toEqual([0, 2000]);
        expect(
            timeline.appearances.map((appearance) => appearance.shape),
        ).toEqual(["triangle", "square"]);
    });

    it("collapses consecutive identical appearances into a single keyframe", () => {
        const timeline = _toMarcherAppearanceTimeline(
            pages,
            "Trumpet",
            [],
            emptyMarcherPagesByPage,
            [1],
            [
                createTagAppearance({
                    id: 10,
                    tag_id: 1,
                    start_page_id: 3,
                    shape_type: "x",
                }),
            ],
            fieldTheme,
        );

        expect(timeline.timestamps).toEqual([0, 2000]);
        expect(timeline.appearances[0].shape).toBe("circle");
        expect(timeline.appearances[1].shape).toBe("cross");
    });

    it("returns an empty timeline when there are no pages", () => {
        const timeline = _toMarcherAppearanceTimeline(
            [],
            "Trumpet",
            [],
            emptyMarcherPagesByPage,
            [],
            [],
            fieldTheme,
        );

        expect(timeline.timestamps).toEqual([]);
        expect(timeline.appearances).toEqual([]);
    });
});

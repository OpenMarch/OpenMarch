import { describe, expect, it } from "vitest";
import { createFieldTheme, FieldProperties } from "@openmarch/core";
import { rgbaToSchemaString } from "@/entity-components/appearance";
import { mockNCAAFieldProperties } from "@/__mocks__/globalMocks";
import Marcher from "@/global/classes/Marcher";
import {
    _calculateMapAllTagAppearanceIdsByPageId,
    TagAppearance,
} from "@/db-functions";
import { buildPerformerAppearanceShowData } from "../performer-appearance-export";

const fieldProperties = new FieldProperties({
    ...mockNCAAFieldProperties,
    theme: createFieldTheme({
        defaultMarcher: {
            fill: { r: 200, g: 50, b: 50, a: 1 },
            outline: { r: 0, g: 0, b: 0, a: 1 },
            label: { r: 0, g: 0, b: 0, a: 1 },
        },
        shapeType: "circle",
    }),
});

const marchers: Marcher[] = [
    {
        id: 1,
        name: null,
        section: "Trumpet",
        drill_prefix: "T",
        drill_order: 1,
        year: null,
        notes: null,
        drill_number: "T1",
    },
    {
        id: 2,
        name: null,
        section: "Trumpet",
        drill_prefix: "T",
        drill_order: 2,
        year: null,
        notes: null,
        drill_number: "T2",
    },
];

const emptyTagMap = _calculateMapAllTagAppearanceIdsByPageId({
    tagAppearances: [],
    pagesInOrder: [{ id: 1 }, { id: 2 }],
});

describe("buildPerformerAppearanceShowData", () => {
    it("exports default appearance from field theme", () => {
        const result = buildPerformerAppearanceShowData({
            fieldProperties,
            sectionAppearances: [],
            tagAppearances: [],
            tagAppearanceIdsByPageId: emptyTagMap,
            marcherIdsByTagId: new Map(),
            marchers,
            marcherPages: [],
            pagesInOrder: [{ id: 1 }],
        });

        expect(result.defaultAppearance.fillRgba).toBe(
            rgbaToSchemaString(fieldProperties.theme.defaultMarcher.fill),
        );
        expect(result.defaultAppearance.shape).toBe("circle");
        expect(result.performers).toEqual([]);
        expect(result.sections).toEqual([]);
    });

    it("exports fully resolved section appearances", () => {
        const result = buildPerformerAppearanceShowData({
            fieldProperties,
            sectionAppearances: [
                {
                    id: 1,
                    section: "Trumpet",
                    fill_color: { r: 1, g: 2, b: 3, a: 1 },
                    outline_color: null,
                    shape_type: "square",
                    visible: true,
                    label_visible: true,
                    equipment_name: null,
                    equipment_state: null,
                    created_at: "",
                    updated_at: "",
                },
            ],
            tagAppearances: [],
            tagAppearanceIdsByPageId: emptyTagMap,
            marcherIdsByTagId: new Map(),
            marchers,
            marcherPages: [],
            pagesInOrder: [{ id: 1 }],
        });

        expect(result.sections).toHaveLength(1);
        expect(result.sections[0].section).toBe("Trumpet");
        expect(result.sections[0].fillRgba).toBe("rgba(1,2,3,1)");
        expect(result.sections[0].shape).toBe("square");
        expect(result.sections[0].strokeRgba).toBe(
            rgbaToSchemaString(fieldProperties.theme.defaultMarcher.outline),
        );
    });

    it("emits performer override when tag appearance changes resolved style", () => {
        const tagAppearances: TagAppearance[] = [
            {
                id: 10,
                tag_id: 1,
                start_page_id: 1,
                priority: 1,
                fill_color: null,
                outline_color: null,
                shape_type: "triangle",
                visible: true,
                label_visible: true,
                equipment_name: null,
                equipment_state: null,
                created_at: "",
                updated_at: "",
            },
        ];
        const tagAppearanceIdsByPageId =
            _calculateMapAllTagAppearanceIdsByPageId({
                tagAppearances,
                pagesInOrder: [{ id: 1 }],
            });

        const result = buildPerformerAppearanceShowData({
            fieldProperties,
            sectionAppearances: [],
            tagAppearances,
            tagAppearanceIdsByPageId,
            marcherIdsByTagId: new Map([[1, [1]]]),
            marchers: [marchers[0]],
            marcherPages: [],
            pagesInOrder: [{ id: 1 }],
        });

        expect(result.performers).toHaveLength(1);
        expect(result.performers[0]).toMatchObject({
            marcherId: "1",
            pageId: "1",
            shape: "triangle",
            fillRgba: rgbaToSchemaString(
                fieldProperties.theme.defaultMarcher.fill,
            ),
        });
    });

    it("emits performer override when marcher page changes shape", () => {
        const result = buildPerformerAppearanceShowData({
            fieldProperties,
            sectionAppearances: [],
            tagAppearances: [],
            tagAppearanceIdsByPageId: emptyTagMap,
            marcherIdsByTagId: new Map(),
            marchers: [marchers[0]],
            marcherPages: [
                {
                    id: 1,
                    marcher_id: 1,
                    page_id: 1,
                    x: 0,
                    y: 0,
                    notes: null,
                    path_data_id: null,
                    path_start_position: null,
                    path_end_position: null,
                    rotation_degrees: 0,
                    created_at: "",
                    updated_at: "",
                    fill_color: null,
                    outline_color: null,
                    shape_type: "x",
                    visible: true,
                    label_visible: true,
                    equipment_name: null,
                    equipment_state: null,
                },
            ],
            pagesInOrder: [{ id: 1 }],
        });

        expect(result.performers).toHaveLength(1);
        expect(result.performers[0].shape).toBe("cross");
    });
});

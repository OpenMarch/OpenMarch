import { describe, expect, it } from "vitest";
import {
    generateMarchers,
    generateTimingObjects,
} from "@/__mocks__/generators";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { buildMarcherAppearancesByPageId } from "../exportAppearances";

describe("buildMarcherAppearancesByPageId", () => {
    it("includes tag appearances for tagged marchers on the matching page", () => {
        const fieldProperties =
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
        const marchers = generateMarchers({ numberOfMarchers: 2, seed: 2 });
        const timingObjects = generateTimingObjects({
            numberOfBeats: 16,
            seed: 2,
        });
        const page = timingObjects.pages[0];
        const tagFill = { r: 12, g: 34, b: 56, a: 1 };
        const appearancesByPageId = buildMarcherAppearancesByPageId({
            sortedPages: timingObjects.pages,
            marchers,
            sectionAppearances: [],
            marcherIdsByTagId: new Map([[1, [marchers[0].id]]]),
            allTagAppearances: [
                {
                    id: 10,
                    tag_id: 1,
                    start_page_id: page.id,
                    priority: 1,
                    fill_color: tagFill,
                    outline_color: null,
                    shape_type: "triangle",
                    visible: true,
                    label_visible: true,
                    equipment_name: null,
                    equipment_state: null,
                },
            ],
            tagAppearanceIdsByPageId: new Map([[page.id, new Set([10])]]),
            fieldProperties,
        });

        const firstMarcherAppearances = appearancesByPageId.get(page.id)?.[
            marchers[0].id
        ];
        expect(firstMarcherAppearances?.[0]?.fill_color).toEqual(tagFill);
        expect(firstMarcherAppearances?.[0]?.shape_type).toBe("triangle");

        const untaggedMarcherAppearances = appearancesByPageId.get(page.id)?.[
            marchers[1].id
        ];
        expect(
            untaggedMarcherAppearances?.some(
                (appearance) => appearance.fill_color?.r === tagFill.r,
            ),
        ).toBe(false);
    });

    it("gives an untagged marcher only the field default", () => {
        const fieldProperties =
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
        const marchers = generateMarchers({ numberOfMarchers: 2, seed: 3 });
        const timingObjects = generateTimingObjects({
            numberOfBeats: 16,
            seed: 3,
        });
        const pageId = timingObjects.pages[0].id;
        const appearances = buildMarcherAppearancesByPageId({
            sortedPages: timingObjects.pages,
            marchers,
            sectionAppearances: [],
            marcherIdsByTagId: new Map(),
            allTagAppearances: [],
            tagAppearanceIdsByPageId: new Map(),
            fieldProperties,
        }).get(pageId)![marchers[0].id];

        expect(appearances).toHaveLength(1);
    });
});

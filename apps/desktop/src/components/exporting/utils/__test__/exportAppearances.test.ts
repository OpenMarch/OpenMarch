import { describe, expect, it } from "vitest";
import {
    generateMarchers,
    generateTimingObjects,
} from "@/__mocks__/generators";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import Page from "@/global/classes/Page";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { fabric } from "fabric";
import { rgbaToString } from "@openmarch/core";
import {
    applyMarcherAppearancesForPage,
    buildMarcherAppearancesByPageId,
    getPlaybackPageForTimeMs,
    type MarcherAppearancesByPageId,
} from "../exportAppearances";
import { marcherPageMapFromArray } from "@/global/classes/MarcherPageIndex";
import { generateMarcherPages } from "@/__mocks__/generators";
import { pageToDatabasePage } from "@/global/classes/Page";
import MarcherPage from "@/global/classes/MarcherPage";

function createTestPage({
    id,
    order,
    timestamp,
    duration,
    nextPageId,
    previousPageId,
}: {
    id: number;
    order: number;
    timestamp: number;
    duration: number;
    nextPageId: number | null;
    previousPageId: number | null;
}): Page {
    return {
        id,
        name: `${order}`,
        counts: 8,
        notes: null,
        order,
        nextPageId,
        previousPageId,
        isSubset: false,
        duration,
        beats: [],
        measures: null,
        measureBeatToStartOn: 1,
        measureBeatToEndOn: 4,
        timestamp,
    };
}

describe("getPlaybackPageForTimeMs", () => {
    const pages = [
        createTestPage({
            id: 1,
            order: 1,
            timestamp: 0,
            duration: 8,
            nextPageId: 2,
            previousPageId: null,
        }),
        createTestPage({
            id: 2,
            order: 2,
            timestamp: 8,
            duration: 8,
            nextPageId: 3,
            previousPageId: 1,
        }),
        createTestPage({
            id: 3,
            order: 3,
            timestamp: 16,
            duration: 8,
            nextPageId: null,
            previousPageId: 2,
        }),
    ];

    it("uses the first page before its coordinate timestamp", () => {
        expect(getPlaybackPageForTimeMs(pages, 0).id).toBe(1);
        expect(getPlaybackPageForTimeMs(pages, 7999).id).toBe(1);
    });

    it("uses the same interval logic as live playback between sets", () => {
        expect(getPlaybackPageForTimeMs(pages, 8000).id).toBe(1);
        expect(getPlaybackPageForTimeMs(pages, 15999).id).toBe(1);
        expect(getPlaybackPageForTimeMs(pages, 16000).id).toBe(2);
    });

    it("returns the last page after the show ends", () => {
        expect(getPlaybackPageForTimeMs(pages, 24000).id).toBe(3);
    });
});

describe("applyMarcherAppearancesForPage", () => {
    it("applies tag appearance styling over section defaults", () => {
        const fieldProperties =
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
        const marchers = generateMarchers({ numberOfMarchers: 1, seed: 1 });
        const marcher = marchers[0];
        const tagFill = { r: 255, g: 0, b: 0, a: 1 };

        const canvasMarcher = new CanvasMarcher({
            marcher,
            coordinate: { x: 100, y: 100 },
            appearances: {
                fill_color: { r: 0, g: 0, b: 255, a: 1 },
                visible: true,
                label_visible: true,
            },
        });

        const marcherAppearancesByPageId: MarcherAppearancesByPageId = new Map([
            [
                1,
                {
                    [marcher.id]: [
                        {
                            fill_color: tagFill,
                            outline_color: null,
                            visible: true,
                            label_visible: true,
                            shape_type: "square",
                        },
                        {
                            fill_color: { r: 0, g: 0, b: 255, a: 1 },
                            visible: true,
                            label_visible: true,
                        },
                    ],
                },
            ],
        ]);

        applyMarcherAppearancesForPage({
            pageId: 1,
            marcherAppearancesByPageId,
            canvasMarchersById: { [marcher.id]: canvasMarcher },
            fieldProperties,
        });

        expect(canvasMarcher.currentAppearanceValues.fill_color).toEqual(
            tagFill,
        );
        expect(canvasMarcher.currentAppearanceValues.shape_type).toBe("square");
        expect((canvasMarcher.dotObject as fabric.Rect).fill).toBe(
            rgbaToString(tagFill),
        );
    });
});

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
        const marcherPages = generateMarcherPages({
            marchers,
            pages: timingObjects.pages.map(pageToDatabasePage),
            fieldProperties,
            seed: 2,
        });
        const marcherPagesMap = marcherPageMapFromArray(
            marcherPages as unknown as MarcherPage[],
        );

        const tagFill = { r: 12, g: 34, b: 56, a: 1 };
        const appearancesByPageId = buildMarcherAppearancesByPageId({
            sortedPages: timingObjects.pages,
            marchers,
            marcherPagesMap,
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
        expect(firstMarcherAppearances?.[1]?.fill_color).toEqual(tagFill);
        expect(firstMarcherAppearances?.[1]?.shape_type).toBe("triangle");

        const untaggedMarcherAppearances = appearancesByPageId.get(page.id)?.[
            marchers[1].id
        ];
        expect(
            untaggedMarcherAppearances?.some(
                (appearance) => appearance.fill_color?.r === tagFill.r,
            ),
        ).toBe(false);
    });
});

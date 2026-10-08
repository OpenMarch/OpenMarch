import { describe, expect, it, vi } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type Marcher from "@/global/classes/Marcher";
import type Page from "@/global/classes/Page";
import type { SectionAppearance, TagAppearance } from "@/db-functions";
import {
    appearanceChangeBeats,
    changeIndexAtBeat,
    appearanceFlagsKey,
    appearanceStackAtBeat,
    buildAppearanceSteps,
    hiddenMarcherIdsAtBeat,
    parseAppearanceFlagsKey,
} from "../appearanceSteps";
import { applyAppearanceStepsAt } from "@/hooks/useTimelineAppearance";
import { getPlaybackPageForTimeMs } from "@/components/exporting/utils/exportAppearances";

/**
 * Appearance by flag beat in timeline mode (docs/timeline/ui.md UI-9 No selected page; owner
 * decision 2026-10-06): each page's appearance takes effect at its flag, and between flags the
 * field shows the appearance of the last flag crossed.
 */

const fieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
const THEME_FILL = fieldProperties.theme.defaultMarcher.fill;

const RED = { r: 200, g: 10, b: 20, a: 1 };
const GREEN = { r: 0, g: 200, b: 0, a: 1 };
const BLUE = { r: 0, g: 0, b: 255, a: 1 };

const marchers = [
    { id: 1, section: "Trumpet" },
    { id: 2, section: "Flute" },
    { id: 3, section: "Trumpet" },
] as unknown as Marcher[];

/**
 * Pages as `fromDatabasePages` makes them, one beat a second: home holds beat 0, and page N covers
 * four beats, so flags are home 0, then 5, 9, 13, 17. Beat b (b >= 1) is at b - 1 seconds.
 */
const beatsOf = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({ index: from + i }));
const pages = [
    { id: 10, beats: beatsOf(0, 1), timestamp: 0, duration: 0 },
    { id: 11, beats: beatsOf(1, 4), timestamp: 0, duration: 4 },
    { id: 12, beats: beatsOf(5, 4), timestamp: 4, duration: 4 },
    { id: 13, beats: beatsOf(9, 4), timestamp: 8, duration: 4 },
    { id: 14, beats: beatsOf(13, 4), timestamp: 12, duration: 4 },
].map((p, i, all) => ({
    ...p,
    nextPageId: all[i + 1]?.id ?? null,
    previousPageId: all[i - 1]?.id ?? null,
})) as unknown as Page[];
const timeOfBeat = (beat: number) => Math.max(0, beat - 1) * 1000;

const tagAppearance = (
    id: number,
    fields: Partial<TagAppearance>,
): TagAppearance =>
    ({
        id,
        tag_id: 100,
        start_page_id: 0,
        priority: 1,
        fill_color: null,
        outline_color: null,
        shape_type: null,
        visible: true,
        label_visible: true,
        ...fields,
    }) as unknown as TagAppearance;

const section = {
    id: 1,
    section: "Flute",
    fill_color: BLUE,
    outline_color: null,
    shape_type: null,
    visible: true,
    label_visible: true,
} as unknown as SectionAppearance;

/** Tag 100 (marchers 1 and 3): red from page 12, green triangles from page 14 */
const tagAppearances = [
    tagAppearance(7, { fill_color: RED }),
    tagAppearance(8, { fill_color: GREEN, shape_type: "triangle" }),
];
const tagAppearanceIdsByPageId = new Map([
    [10, new Set<number>()],
    [11, new Set<number>()],
    [12, new Set([7])],
    [13, new Set([7])],
    [14, new Set([8])],
]);

const build = (
    overrides: Partial<Parameters<typeof buildAppearanceSteps>[0]> = {},
) =>
    buildAppearanceSteps({
        flags: parseAppearanceFlagsKey(appearanceFlagsKey(pages)),
        marchers,
        sectionAppearances: [section],
        marcherIdsByTagId: new Map([[100, [1, 3]]]),
        tagAppearances,
        tagAppearanceIdsByPageId,
        fieldProperties,
        ...overrides,
    });

const fill = (stack: ReturnType<typeof appearanceStackAtBeat>) =>
    stack!.find((a) => a.fill_color != null)!.fill_color;
const fillAt = (marcherId: number, beat: number) =>
    fill(appearanceStackAtBeat(build().get(marcherId)!, beat));

describe("appearanceFlagsKey", () => {
    it("lists each page's flag beat, home at 0", () => {
        expect(parseAppearanceFlagsKey(appearanceFlagsKey(pages))).toEqual([
            { pageId: 10, flag: 0 },
            { pageId: 11, flag: 5 },
            { pageId: 12, flag: 9 },
            { pageId: 13, flag: 13 },
            { pageId: 14, flag: 17 },
        ]);
        expect(parseAppearanceFlagsKey(appearanceFlagsKey([]))).toEqual([]);
    });

    it("doesn't change on a tempo edit, which moves times but no beats", () => {
        const slower = pages.map((p) => ({
            ...p,
            timestamp: p.timestamp * 2,
            duration: p.duration * 2,
        }));
        expect(appearanceFlagsKey(slower)).toBe(appearanceFlagsKey(pages));
    });
});

describe("buildAppearanceSteps", () => {
    it("adds a step only at a flag where the appearance changes", () => {
        const steps = build();
        // Theme at home, red at page 12's flag (9), green at page 14's flag (17); page 13 keeps
        // red, so it adds nothing
        expect(steps.get(1)!.beats).toEqual([0, 9, 17]);
        // The section appearance never changes: one step
        expect(steps.get(2)!.beats).toEqual([0]);
    });

    it("adds no step when every page looks the same", () => {
        const steps = build({
            tagAppearances: [],
            tagAppearanceIdsByPageId: new Map(),
        });
        for (const marcherSteps of steps.values())
            expect(marcherSteps.beats).toEqual([0]);
    });

    it("leaves out per-marcher-page overrides (P7.14)", () => {
        for (const marcherSteps of build().values())
            for (const stack of marcherSteps.stacks)
                expect(stack.some((a) => "marcher_id" in a)).toBe(false);
    });

    it("gives a page missing from the tag map the tag appearances of the page before", () => {
        const steps = build({
            tagAppearanceIdsByPageId: new Map([
                [10, new Set<number>()],
                [11, new Set<number>()],
                [12, new Set([7])],
                // 13 and 14 missing: both keep page 12's red
            ]),
        });
        expect(steps.get(1)!.beats).toEqual([0, 9]);
    });
});

describe("buildAppearanceSteps with two pages on one flag", () => {
    it("lets the later page win", () => {
        const steps = buildAppearanceSteps({
            flags: [
                { pageId: 10, flag: 0 },
                { pageId: 11, flag: 0 },
                { pageId: 12, flag: 4 },
            ],
            marchers,
            sectionAppearances: [],
            marcherIdsByTagId: new Map([[100, [1, 3]]]),
            tagAppearances,
            tagAppearanceIdsByPageId: new Map([
                [10, new Set<number>()],
                [11, new Set([7])],
                [12, new Set<number>()],
            ]),
            fieldProperties,
        });
        expect(steps.get(1)!.beats).toEqual([0, 4]);
        expect(fill(appearanceStackAtBeat(steps.get(1)!, 0))).toEqual(RED);
        expect(fill(appearanceStackAtBeat(steps.get(1)!, 4))).toEqual(
            THEME_FILL,
        );
    });
});

describe("appearanceStackAtBeat", () => {
    it("changes exactly on a flag: the last flag crossed", () => {
        expect(fillAt(1, 8)).toEqual(THEME_FILL);
        expect(fillAt(1, 8.999)).toEqual(THEME_FILL);
        expect(fillAt(1, 9)).toEqual(RED);
        // A live beat a float error short of the flag counts as on it
        expect(fillAt(1, 9 - 1e-9)).toEqual(RED);
        // Between flags 13 and 17 (inside page 14's box) it is still page 13's red
        expect(fillAt(1, 15)).toEqual(RED);
        expect(fillAt(1, 16.99)).toEqual(RED);
        expect(fillAt(1, 17)).toEqual(GREEN);
        expect(fillAt(2, 12)).toEqual(BLUE);
    });

    it("uses the first appearance before the first flag and the last after the last", () => {
        const marcherSteps = build().get(1)!;
        expect(appearanceStackAtBeat(marcherSteps, -3)).toBe(
            marcherSteps.stacks[0],
        );
        expect(appearanceStackAtBeat(marcherSteps, 0)).toBe(
            marcherSteps.stacks[0],
        );
        expect(appearanceStackAtBeat(marcherSteps, 1000)).toBe(
            marcherSteps.stacks[2],
        );
        expect(appearanceStackAtBeat({ beats: [], stacks: [] }, 0)).toBe(null);
    });

    it("returns the same stack between two changes, so the canvas can skip by reference", () => {
        const marcherSteps = build().get(1)!;
        expect(appearanceStackAtBeat(marcherSteps, 10)).toBe(
            appearanceStackAtBeat(marcherSteps, 16),
        );
    });

    it("agrees with the video export's page at every time (last flag crossed)", () => {
        const steps = build();
        const byPage = new Map(
            pages.map((p) => [
                p.id,
                tagAppearanceIdsByPageId.get(p.id)!.has(8)
                    ? GREEN
                    : tagAppearanceIdsByPageId.get(p.id)!.has(7)
                      ? RED
                      : THEME_FILL,
            ]),
        );
        for (let beat = 0; beat <= 20; beat += 0.25) {
            const exportPage = getPlaybackPageForTimeMs(
                pages,
                timeOfBeat(beat),
            );
            // Beats 0 and 1 are both show time 0; on the canvas, beat 0 is home's flag
            if (beat < 1) continue;
            expect(fill(appearanceStackAtBeat(steps.get(1)!, beat))).toEqual(
                byPage.get(exportPage.id),
            );
        }
    });
});

describe("appearanceChangeBeats and changeIndexAtBeat", () => {
    it("lists every beat where someone's appearance changes, and counts those crossed", () => {
        const changes = appearanceChangeBeats(build());
        expect(changes).toEqual([0, 9, 17]);
        expect(changeIndexAtBeat(changes, -1)).toBe(0);
        expect(changeIndexAtBeat(changes, 0)).toBe(1);
        expect(changeIndexAtBeat(changes, 8.99)).toBe(1);
        expect(changeIndexAtBeat(changes, 9 - 1e-9)).toBe(2);
        expect(changeIndexAtBeat(changes, 12)).toBe(2);
        expect(changeIndexAtBeat(changes, 100)).toBe(3);
        expect(changeIndexAtBeat([], 5)).toBe(0);
    });
});

describe("hiddenMarcherIdsAtBeat", () => {
    it("hides a marcher from the flag of the page that hides it", () => {
        const steps = build({
            tagAppearances: [tagAppearance(9, { visible: false })],
            tagAppearanceIdsByPageId: new Map([
                [10, new Set<number>()],
                [11, new Set<number>()],
                [12, new Set<number>()],
                [13, new Set([9])],
                [14, new Set([9])],
            ]),
        });
        expect(hiddenMarcherIdsAtBeat(steps, 12)).toEqual(new Set());
        expect(hiddenMarcherIdsAtBeat(steps, 13)).toEqual(new Set([1, 3]));
        expect(hiddenMarcherIdsAtBeat(steps, 20)).toEqual(new Set([1, 3]));
    });
});

describe("applyAppearanceStepsAt (the canvas side)", () => {
    const stubMarchers = () =>
        marchers.map((marcherObj) => ({
            marcherObj,
            setAppearance: vi.fn(),
        }));

    it("styles each marcher, then again only when its appearance changes", () => {
        const canvasMarchers = stubMarchers();
        const steps = build();
        const applied = new WeakMap<object, unknown>();
        const at = (beat: number) =>
            applyAppearanceStepsAt({
                canvasMarchers: canvasMarchers as never,
                steps,
                beat,
                applied,
            });

        expect(at(3)).toBe(3);
        // Nothing changes before page 12's flag
        expect(at(8)).toBe(0);
        // Crossing it restyles only the tagged marchers
        expect(at(9)).toBe(2);
        expect(canvasMarchers[0]!.setAppearance).toHaveBeenLastCalledWith(
            steps.get(1)!.stacks[1],
            { requestRenderAll: false },
            undefined,
        );
        expect(canvasMarchers[1]!.setAppearance).toHaveBeenCalledTimes(1);
        // Going back (a loop or a seek) restyles them again
        expect(at(2)).toBe(2);
    });
});

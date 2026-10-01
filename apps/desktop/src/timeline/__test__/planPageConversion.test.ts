import { describe, expect, it } from "vitest";
import {
    CONVERTED_TIMELINE_NAME,
    describePageConversionReport,
    droppedFieldsOf,
    pageBeatRange,
    pageHasLoss,
    planPageConversion,
    svgPathIsCurved,
    type ConversionMarcherPage,
    type ConversionPage,
} from "../convert/planPageConversion";

/**
 * The pure page → timeline planner (docs/timeline/phases/06-converter.md P6.2, P6.3). The real
 * database tests are in `pageConversion.test.ts`.
 */

/** Pages in show order: page 0 on beat 0, then pages of `counts[i]` beats each. */
const pagesOf = (...counts: number[]): ConversionPage[] => {
    const pages: ConversionPage[] = [
        { id: 100, name: "0", order: 0, beats: [{ index: 0 }] },
    ];
    let next = 1;
    counts.forEach((c, i) => {
        pages.push({
            id: 101 + i,
            name: String(i + 1),
            order: i + 1,
            beats: Array.from({ length: c }, (_, k) => ({ index: next + k })),
        });
        next += c;
    });
    return pages;
};

let rowId = 1;
const row = (
    marcher_id: number,
    page_id: number,
    x: number,
    y: number,
    path_data_id: number | null = null,
): ConversionMarcherPage => ({
    id: rowId++,
    marcher_id,
    page_id,
    x,
    y,
    path_data_id,
});

describe("planPageConversion", () => {
    it("plans homes, one timeline, and one direct transition per page with one slot per marcher", () => {
        const pages = pagesOf(4, 8);
        const plan = planPageConversion({
            pages,
            marcherIds: [7, 3],
            marcherPages: [
                row(3, 100, 0.1, 0.2),
                row(7, 100, 10, 20),
                row(3, 101, 1.5, 2.5),
                row(7, 101, 11, 21),
                row(3, 102, -3, 1e-7),
                row(7, 102, 12, 22),
            ],
        });
        expect(plan.homes).toEqual([
            { marcherId: 3, home: [0.1, 0.2] },
            { marcherId: 7, home: [10, 20] },
        ]);
        expect(plan.timeline).toEqual({
            name: CONVERTED_TIMELINE_NAME,
            startBeat: 0,
            endBeat: 13,
        });
        expect(plan.transitions).toEqual([
            {
                pageId: 101,
                startBeat: 1,
                endBeat: 5,
                marcherIds: [3, 7],
                points: [
                    [1.5, 2.5],
                    [11, 21],
                ],
            },
            {
                pageId: 102,
                startBeat: 5,
                endBeat: 13,
                marcherIds: [3, 7],
                points: [
                    [-3, 1e-7],
                    [12, 22],
                ],
            },
        ]);
        expect(plan.report.pages.map(pageHasLoss)).toEqual([
            false,
            false,
            false,
        ]);
        expect(describePageConversionReport(plan.report)).toEqual([]);
    });

    it("a page's end beat is the next page's start beat, and page 0 sits on [0, 1)", () => {
        const pages = pagesOf(3, 5, 1);
        expect(pages.map(pageBeatRange)).toEqual([
            { startBeat: 0, endBeat: 1 },
            { startBeat: 1, endBeat: 4 },
            { startBeat: 4, endBeat: 9 },
            { startBeat: 9, endBeat: 10 },
        ]);
    });

    it("a show with only page 0 gets homes and an empty timeline over [0, 1)", () => {
        const plan = planPageConversion({
            pages: pagesOf(),
            marcherIds: [1],
            marcherPages: [row(1, 100, 4, 5)],
        });
        expect(plan.homes).toEqual([{ marcherId: 1, home: [4, 5] }]);
        expect(plan.timeline.endBeat).toBe(1);
        expect(plan.transitions).toEqual([]);
    });

    it("a marcher without a row on a page holds there: no slot, and the report lists it", () => {
        const plan = planPageConversion({
            pages: pagesOf(2, 2),
            marcherIds: [1, 2],
            marcherPages: [
                row(1, 100, 0, 0),
                row(2, 100, 5, 5),
                row(1, 101, 1, 1),
                row(1, 102, 2, 2),
                row(2, 102, 6, 6),
            ],
        });
        expect(plan.transitions.map((t) => t.marcherIds)).toEqual([
            [1],
            [1, 2],
        ]);
        expect(plan.report.pages[1]!.missingMarchers).toEqual([2]);
        expect(pageHasLoss(plan.report.pages[1]!)).toBe(true);
        expect(describePageConversionReport(plan.report)).toEqual([
            "Page 1 [1, 3): marchers without a row hold: 2",
        ]);
    });

    it("homes come from the first page with a row; a marcher with none keeps its home", () => {
        const plan = planPageConversion({
            pages: pagesOf(2, 2),
            marcherIds: [1, 2, 3],
            marcherPages: [
                row(1, 100, 0, 0),
                row(2, 102, 9, 8),
                row(1, 101, 1, 1),
                row(1, 102, 2, 2),
            ],
        });
        expect(plan.homes).toEqual([
            { marcherId: 1, home: [0, 0] },
            { marcherId: 2, home: [9, 8] },
        ]);
        expect(plan.report.homesFromLaterPage).toEqual([2]);
        expect(plan.report.marchersWithoutRows).toEqual([3]);
        expect(plan.report.pages[0]!.missingMarchers).toEqual([2, 3]);
    });

    it("skips pages with no beats or no rows, and reports why", () => {
        const pages: ConversionPage[] = [
            ...pagesOf(2),
            { id: 200, name: "2", order: 2, beats: [] },
            { id: 201, name: "3", order: 3, beats: [{ index: 3 }] },
        ];
        const plan = planPageConversion({
            pages,
            marcherIds: [1],
            marcherPages: [
                row(1, 100, 0, 0),
                row(1, 101, 1, 1),
                row(1, 200, 2, 2),
            ],
        });
        expect(plan.transitions.map((t) => t.pageId)).toEqual([101]);
        expect(plan.report.pages.map((p) => p.skipped)).toEqual([
            null,
            null,
            "no-beats",
            "no-marchers",
        ]);
        expect(plan.timeline.endBeat).toBe(3);
    });

    it("ignores rows of unknown marchers and duplicate marcher ids", () => {
        const plan = planPageConversion({
            pages: pagesOf(1),
            marcherIds: [1, 1],
            marcherPages: [
                row(1, 100, 0, 0),
                row(9, 100, 3, 3),
                row(1, 101, 1, 1),
                row(9, 101, 4, 4),
            ],
        });
        expect(plan.homes.map((h) => h.marcherId)).toEqual([1]);
        expect(plan.transitions[0]!.marcherIds).toEqual([1]);
    });

    it("refuses a show with no pages", () => {
        expect(() =>
            planPageConversion({ pages: [], marcherIds: [], marcherPages: [] }),
        ).toThrow(/no pages/);
    });
});

describe("the loss report (P6.3)", () => {
    it("lists pathways, midsets and curved shapes on the page they move into", () => {
        const rows = [
            row(1, 100, 0, 0),
            row(2, 100, 1, 1),
            row(1, 101, 5, 5, 40),
            row(2, 101, 6, 6),
            row(1, 102, 7, 7),
            row(2, 102, 8, 8, 41),
        ];
        const plan = planPageConversion({
            pages: pagesOf(4, 4),
            marcherIds: [1, 2],
            marcherPages: rows,
            midsets: [
                { id: 61, mp_id: rows[4]!.id, progress_placement: 0.5 },
                { id: 60, mp_id: rows[4]!.id, progress_placement: 0.25 },
            ],
            shapePages: [
                { id: 70, shape_id: 1, page_id: 101, svg_path: "M 0 0 L 10 0" },
                {
                    id: 71,
                    shape_id: 2,
                    page_id: 101,
                    svg_path: "M 0 0 Q 5 5 10 0",
                },
                {
                    id: 72,
                    shape_id: 3,
                    page_id: 102,
                    svg_path: "M 0 0 C 1 1 2 2 3 3",
                },
            ],
        });
        const [, p1, p2] = plan.report.pages;
        expect(p1!.pathways).toEqual([{ marcherId: 1, pathwayId: 40 }]);
        expect(p1!.curvedShapes).toEqual([{ shapePageId: 71, shapeId: 2 }]);
        expect(p1!.midsets).toEqual([]);
        expect(p2!.pathways).toEqual([{ marcherId: 2, pathwayId: 41 }]);
        expect(p2!.midsets).toEqual([
            { marcherId: 1, midsetId: 60, progress: 0.25 },
            { marcherId: 1, midsetId: 61, progress: 0.5 },
        ]);
        expect(p2!.curvedShapes).toEqual([{ shapePageId: 72, shapeId: 3 }]);
        // Page-end coordinates are still copied exactly
        expect(plan.transitions[0]!.points).toEqual([
            [5, 5],
            [6, 6],
        ]);
        expect(describePageConversionReport(plan.report)).toEqual([
            "Page 1 [1, 5): 1 pathway(s), kept only at the page end (marchers 1); 1 curved shape(s), kept only as points (shape pages 71)",
            "Page 2 [5, 9): 1 pathway(s), kept only at the page end (marchers 2); 2 midset(s) dropped; 1 curved shape(s), kept only as points (shape pages 72)",
        ]);
    });

    it("counts rows whose rotation, notes or appearance overrides are dropped", () => {
        const base = row(1, 101, 1, 1);
        const rows = [
            row(1, 100, 0, 0),
            row(2, 100, 0, 0),
            row(3, 100, 0, 0),
            { ...base, rotation_degrees: 90, notes: "", fill_color: null },
            { ...row(2, 101, 2, 2), notes: "hold", visible: 0 },
            {
                ...row(3, 101, 3, 3),
                rotation_degrees: 0,
                visible: 1,
                label_visible: 1,
                equipment_state: "",
            },
        ];
        const plan = planPageConversion({
            pages: pagesOf(2),
            marcherIds: [1, 2, 3],
            marcherPages: rows,
        });
        expect(plan.report.pages[0]!.droppedFields).toEqual({
            rotation: 0,
            notes: 0,
            appearance: 0,
        });
        expect(plan.report.pages[1]!.droppedFields).toEqual({
            rotation: 1,
            notes: 1,
            appearance: 1,
        });
        expect(plan.transitions[0]!.points).toEqual([
            [1, 1],
            [2, 2],
            [3, 3],
        ]);
        expect(describePageConversionReport(plan.report)).toEqual([
            "Page 1 [1, 3): dropped from rows: rotation 1, notes 1, appearance overrides 1",
        ]);
        for (const override of [
            { fill_color: "#fff" },
            { outline_color: "red" },
            { shape_type: "x" },
            { equipment_name: "flag" },
            { equipment_state: "up" },
            { label_visible: 0 },
        ])
            expect(
                droppedFieldsOf({ ...base, ...override }).appearance,
                JSON.stringify(override),
            ).toBe(true);
    });

    it("tells curved SVG paths from polylines", () => {
        expect(svgPathIsCurved("M 0 0 L 10 0 L 10 10 Z")).toBe(false);
        expect(svgPathIsCurved("M 1e2 0 l 5 5 H 3 V 4 z")).toBe(false);
        for (const cmd of ["C", "c", "S", "s", "Q", "q", "T", "t", "A", "a"])
            expect(svgPathIsCurved(`M 0 0 ${cmd} 1 1 2 2`)).toBe(true);
    });
});

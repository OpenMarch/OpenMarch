import { describe, expect, it } from "vitest";
import {
    basicPageBox,
    neighborPageTarget,
    planCanvasEdit,
    TimelineNotReadyError,
} from "../timelineCoordinateWrites";
import { basicEditSpot } from "@/components/timeline/TimelineIsolationBar";
import { describePages, withoutLockedMarchers } from "../basicLocks";

/** Basic mode's edit routing (UI-19, docs/timeline/research/basic-mode). */

const BOXES = [
    { start: 1, end: 9, name: "1" },
    { start: 9, end: 17, name: "2" },
];
const PAGES = [
    { id: 10, name: "0", beats: [{ index: 0 }] },
    {
        id: 11,
        name: "1",
        beats: Array.from({ length: 8 }, (_, i) => ({ index: i + 1 })),
    },
    {
        id: 12,
        name: "2",
        beats: Array.from({ length: 8 }, (_, i) => ({ index: i + 9 })),
    },
];

describe("planCanvasEdit in Basic", () => {
    const state = (end: number) => ({
        selection: { kind: "range" as const, start: 9, end },
        isolation: null,
        pageBoxes: BOXES,
    });

    it("edits at the playhead inside its page box (mid-page)", () => {
        expect(planCanvasEdit(state(13), true)).toEqual({
            ok: true,
            target: { kind: "point", beat: 13, box: { start: 9, end: 17 } },
            beat: 13,
        });
    });

    it("a page's flag edits that page, not the next", () => {
        expect(planCanvasEdit(state(9), true)).toMatchObject({
            target: { kind: "point", beat: 9, box: { start: 1, end: 9 } },
        });
    });

    it("Expert keeps the window", () => {
        expect(planCanvasEdit(state(13), false)).toMatchObject({
            target: { kind: "range", start: 9, end: 13 },
        });
    });

    it("home stays home", () => {
        expect(
            planCanvasEdit(
                {
                    selection: { kind: "home" },
                    isolation: null,
                    pageBoxes: BOXES,
                },
                true,
            ),
        ).toMatchObject({ target: { kind: "home" } });
    });

    it("waits for the boxes to load instead of editing the window", () => {
        const plan = planCanvasEdit({ ...state(13), pageBoxes: [] }, true);
        expect(plan.ok).toBe(false);
        expect(!plan.ok && plan.error).toBeInstanceOf(TimelineNotReadyError);
    });

    it("refuses past the last flag, where there is no page box", () => {
        const plan = planCanvasEdit(state(20), true);
        expect(plan.ok).toBe(false);
        expect(!plan.ok && plan.error).toMatchObject({
            refusal: "pastLastPage",
        });
    });

    it("Expert still edits the window past the last flag", () => {
        expect(planCanvasEdit(state(20), false)).toMatchObject({
            target: { kind: "range", start: 9, end: 20 },
        });
    });
});

describe("basicPageBox", () => {
    it("is the box holding the beat, or ending on it", () => {
        expect(basicPageBox({ pageBoxes: BOXES }, 1)).toBeNull();
        expect(basicPageBox({ pageBoxes: BOXES }, 2)).toEqual({
            start: 1,
            end: 9,
        });
        expect(basicPageBox({ pageBoxes: BOXES }, 17)).toEqual({
            start: 9,
            end: 17,
        });
        expect(basicPageBox({ pageBoxes: BOXES }, 18)).toBeNull();
    });
});

describe("neighborPageTarget in Basic", () => {
    it("writes on the page's flag inside its box", () => {
        const page = { id: 12, previousPageId: 11, beats: PAGES[2]!.beats };
        expect(neighborPageTarget(page as never, true)).toEqual({
            kind: "point",
            beat: 17,
            box: { start: 9, end: 17 },
        });
        expect(neighborPageTarget(page as never, false)).toEqual({
            kind: "range",
            start: 9,
            end: 17,
        });
    });
});

describe("the field line in Basic", () => {
    const box = { start: 9, end: 17 };
    it("names the page on a flag, and the count inside a page", () => {
        expect(basicEditSpot({ beat: 17, box }, PAGES)).toEqual({
            pageName: "2",
            count: null,
        });
        expect(basicEditSpot({ beat: 13, box }, PAGES)).toEqual({
            pageName: "2",
            count: 4,
        });
        expect(
            basicEditSpot({ beat: 40, box: { start: 17, end: 40 } }, PAGES),
        ).toBeNull();
    });

    it("names what the writer plans in Basic", () => {
        const spot = (end: number) => {
            const plan = planCanvasEdit(
                {
                    selection: { kind: "range", start: 9, end },
                    isolation: null,
                    pageBoxes: BOXES,
                },
                true,
            );
            return plan.ok && plan.target.kind === "point"
                ? basicEditSpot(plan.target, PAGES)
                : null;
        };
        expect(spot(13)).toEqual({ pageName: "2", count: 4 });
        expect(spot(17)).toEqual({ pageName: "2", count: null });
        // Past the last flag Basic refuses, so the line names no page
        expect(spot(20)).toBeNull();
    });
});

describe("withoutLockedMarchers", () => {
    const locks = {
        boxes: BOXES,
        locked: new Map([[1, new Map([[2, "crossesFlag" as const]])]]),
    };
    const moves = [{ marcherId: 1 }, { marcherId: 2 }, { marcherId: 3 }];

    it("drops marchers locked on the edited box", () => {
        expect(
            withoutLockedMarchers(
                { kind: "point", beat: 13, box: { start: 9, end: 17 } },
                moves,
                locks,
            ),
        ).toEqual({ moves: [{ marcherId: 1 }, { marcherId: 3 }], locked: [2] });
    });

    it("leaves other boxes and Expert targets alone", () => {
        expect(
            withoutLockedMarchers(
                { kind: "point", beat: 5, box: { start: 1, end: 9 } },
                moves,
                locks,
            ).locked,
        ).toEqual([]);
        expect(
            withoutLockedMarchers(
                { kind: "range", start: 9, end: 17 },
                moves,
                locks,
            ).locked,
        ).toEqual([]);
    });

    it("describes pages", () => {
        expect(describePages(["4"])).toBe("Page 4");
        expect(describePages(["4", "5", "9"])).toBe("Pages 4, 5 and 9");
    });
});

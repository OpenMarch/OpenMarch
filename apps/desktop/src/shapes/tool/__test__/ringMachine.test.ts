// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../../box/boxTool";
import { curveTool, lineTool } from "../../line/lineTool";
import { rowTool } from "../../__test__/fakeRowKind";
import { SHAPE_TOOLS } from "../shapeTools";
import { toolId } from "../toolKind";
import {
    basicShapeRows,
    starredRows,
    toggleStar,
} from "../../library/shapeLibrary";
import {
    clickRing,
    latchRing,
    openRing,
    pointRing,
    releaseRingKey,
    RING_TAP_MS,
    ringSlots,
    slotAt,
    type RingShape,
} from "../ringMachine";
import type { ShapeToolEntry } from "../shapeTools";

const basics: ShapeToolEntry[] = [
    { kind: boxTool, action: "shapeBlock" },
    { kind: rowTool, action: "shapeBlock" },
];

const star = (id: string): RingShape => ({
    id,
    label: id,
    kind: rowTool,
});

describe("the favorites ring's slots", () => {
    it("holds the basic kinds in the tab's order when nothing is starred", () => {
        expect(ringSlots([], basics).map((s) => s.label)).toEqual([
            "Box",
            "Row",
        ]);
    });

    it("puts starred shapes first, then fills empty slots with basic kinds", () => {
        expect(
            ringSlots([star("Tight box"), star("Wide row")], basics).map(
                (s) => s.label,
            ),
        ).toEqual(["Tight box", "Wide row", "Box", "Row"]);
    });

    it("holds at most 8, stars winning over basic kinds", () => {
        const stars = Array.from({ length: 7 }, (_, i) => star(`S${i + 1}`));
        expect(ringSlots(stars, basics).map((s) => s.label)).toEqual([
            "S1",
            "S2",
            "S3",
            "S4",
            "S5",
            "S6",
            "S7",
            "Box",
        ]);
        const many = Array.from({ length: 10 }, (_, i) => star(`S${i + 1}`));
        expect(ringSlots(many, basics)).toHaveLength(8);
    });

    it("doesn't repeat a basic kind that is starred itself", () => {
        const starredBox: RingShape = {
            id: boxTool.shape.id,
            label: "Box",
            kind: boxTool,
        };
        expect(ringSlots([starredBox], basics).map((s) => s.label)).toEqual([
            "Box",
            "Row",
        ]);
    });

    it("includes Line and Curve in the ring's basic slots", () => {
        expect(ringSlots([], SHAPE_TOOLS).map((s) => s.id)).toEqual([
            "block",
            "circle",
            "line",
            "curve",
        ]);
    });

    it("can star Line and Curve for the favorites ring", () => {
        const rows = basicShapeRows(SHAPE_TOOLS);
        expect(toggleStar([], toolId(lineTool), rows)).toEqual({
            stars: ["line"],
        });
        expect(toggleStar(["line"], toolId(curveTool), rows)).toEqual({
            stars: ["line", "curve"],
        });
        let stars = toggleStar([], toolId(lineTool), rows);
        if (!("stars" in stars)) throw new Error("expected room to star");
        let starred = stars.stars;
        stars = toggleStar(starred, toolId(curveTool), rows);
        if (!("stars" in stars)) throw new Error("expected room to star");
        starred = stars.stars;
        const slots = ringSlots(starredRows(starred, rows), SHAPE_TOOLS);
        expect(slots.slice(0, 2).map((s) => s.label)).toEqual([
            "Line",
            "Curve",
        ]);
    });
});

describe("aiming at a slot", () => {
    // Slots go clockwise from the top, so with four: up, right, down, left
    it("picks the slot in the pointer's direction from the center", () => {
        expect(slotAt({ x: 0, y: -100 }, 4, false)).toBe(0);
        expect(slotAt({ x: 100, y: 10 }, 4, false)).toBe(1);
        expect(slotAt({ x: -5, y: 100 }, 4, false)).toBe(2);
        expect(slotAt({ x: -100, y: 0 }, 4, false)).toBe(3);
    });

    it("aims at nothing near the center", () => {
        expect(slotAt({ x: 5, y: -5 }, 4, false)).toBeNull();
    });

    it("with one slot, any direction away from the center is it", () => {
        expect(slotAt({ x: 0, y: 80 }, 1, false)).toBe(0);
        expect(slotAt({ x: -80, y: 0 }, 1, false)).toBe(0);
    });

    it("a held ring is a flick: far away still aims; a latched ring aims only near its slots", () => {
        expect(slotAt({ x: 0, y: -600 }, 4, false)).toBe(0);
        expect(slotAt({ x: 0, y: -600 }, 4, true)).toBeNull();
        expect(slotAt({ x: 0, y: -100 }, 4, true)).toBe(0);
    });

    it("an empty ring aims at nothing", () => {
        expect(slotAt({ x: 0, y: -100 }, 0, false)).toBeNull();
    });
});

describe("holding and tapping R", () => {
    const center = { x: 400, y: 300 };
    const up = { x: 400, y: 200 };

    it("hold, slide and let go picks the slot under the pointer", () => {
        const ring = pointRing(openRing(center, 0), up, 4);
        expect(releaseRingKey(ring, 600)).toEqual({ pick: 0, ring: null });
    });

    it("a quick tap latches the ring open", () => {
        const ring = openRing(center, 0);
        const { pick, ring: after } = releaseRingKey(ring, RING_TAP_MS - 50);
        expect(pick).toBeNull();
        expect(after).toMatchObject({ center, latched: true });
    });

    it("a quick slide and release still picks", () => {
        const ring = pointRing(openRing(center, 0), up, 4);
        expect(releaseRingKey(ring, 40).pick).toBe(0);
    });

    it("a long hold let go over the center closes it, picking nothing", () => {
        const ring = openRing(center, 0);
        expect(releaseRingKey(ring, RING_TAP_MS + 300)).toEqual({
            pick: null,
            ring: null,
        });
    });

    it("pointing back at the center lets go of the slot", () => {
        const ring = pointRing(
            pointRing(openRing(center, 0), up, 4),
            center,
            4,
        );
        expect(ring.hot).toBeNull();
    });

    it("a latched ring: a click on a slot picks it, a click elsewhere dismisses it", () => {
        const latched = releaseRingKey(openRing(center, 0), 10).ring!;
        expect(clickRing(latched, up, 4)).toBe(0);
        expect(clickRing(latched, { x: 400, y: 900 }, 4)).toBeNull();
        expect(clickRing(latched, center, 4)).toBeNull();
    });

    it("opened from the command palette it's latched, as a tap leaves it (#411)", () => {
        const fromPalette = latchRing(openRing(center, 0));
        expect(fromPalette.latched).toBe(true);
        // No key to let go: a late release changes nothing, and a click picks
        expect(releaseRingKey(fromPalette, 5000)).toEqual({
            pick: null,
            ring: fromPalette,
        });
        expect(clickRing(fromPalette, up, 4)).toBe(0);
    });
});

describe("the aim line", () => {
    const center = { x: 400, y: 300 };

    it("starts where the pointer was when the ring opened", () => {
        expect(openRing(center, 0).aim).toEqual(center);
        expect(openRing(center, 0, { x: 20, y: 10 }).aim).toEqual({
            x: 20,
            y: 10,
        });
    });

    it("follows the pointer, even where no slot changes", () => {
        const ring = pointRing(openRing(center, 0), { x: 400, y: 200 }, 4);
        expect(ring.aim).toEqual({ x: 400, y: 200 });
        const further = pointRing(ring, { x: 405, y: 150 }, 4);
        expect(further.hot).toBe(0);
        expect(further.aim).toEqual({ x: 405, y: 150 });
    });

    it("a latched ring keeps following the pointer", () => {
        const latched = releaseRingKey(openRing(center, 0), 10).ring!;
        expect(pointRing(latched, { x: 900, y: 300 }, 4).aim).toEqual({
            x: 900,
            y: 300,
        });
    });
});

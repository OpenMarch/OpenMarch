import { describe, expect, it } from "vitest";
import {
    groupLegDistances,
    laneOutline,
    memberWalkOf,
    scheduleOf,
    type PathShape,
} from "../pathEdit";

/**
 * Group paths on the canvas (pathways step 15, spec Appendix I.8): each member's lane, and the
 * legs Big steps judges. A block whose end set is its start moved over walks every leg at the
 * reference walk's one speed; another end set changes speed only onto and off the path.
 */
const shape: PathShape = {
    from: { x: 0, y: 0 },
    to: { x: 40, y: 0 },
    points: [{ at: { x: 10, y: 10 } }, { at: { x: 30, y: 10 } }],
};
const offsets = [
    { x: -2, y: -2 },
    { x: 2, y: -2 },
    { x: -2, y: 2 },
    { x: 2, y: 2 },
];

describe("group path legs (Big steps) and lanes", () => {
    it("a block moved over: every leg's distance over the move is the reference walk's length", () => {
        const schedule = scheduleOf(shape);
        const walks = offsets.map((o, i) => ({
            marcherId: i + 1,
            walk: memberWalkOf(schedule, {
                from: o,
                to: { x: 40 + o.x, y: o.y },
                offset: o,
            }),
        }));
        const legs = groupLegDistances(schedule, walks);
        const L = schedule.W.L;
        expect(legs.filter((l) => l.where === "along")).toEqual([
            { where: "along", marcherId: null, distance: L },
        ]);
        expect(legs.filter((l) => l.where !== "along")).toHaveLength(8);
        for (const l of legs)
            expect(Math.abs(l.distance - L)).toBeLessThan(1e-9);
    });

    it("an end set of another shape: the last legs differ, the middle is judged once", () => {
        const schedule = scheduleOf(shape);
        const walks = offsets.map((o, i) => ({
            marcherId: i + 1,
            walk: memberWalkOf(schedule, {
                from: o,
                to: { x: 36 + 4 * i, y: 20 },
                offset: o,
            }),
        }));
        const off = groupLegDistances(schedule, walks).filter(
            (l) => l.where === "off",
        );
        expect(
            new Set(off.map((l) => l.distance.toFixed(6))).size,
        ).toBeGreaterThan(1);
    });

    it("a lane runs from the member's start through its placed points to its end", () => {
        const schedule = scheduleOf(shape);
        const o = { x: 2, y: -2 };
        const lane = laneOutline(
            memberWalkOf(schedule, { from: o, to: { x: 50, y: 5 }, offset: o }),
        );
        expect(lane[0]).toEqual({ x: 2, y: -2 });
        expect(lane).toContainEqual({ x: 12, y: 8 });
        expect(lane).toContainEqual({ x: 32, y: 8 });
        expect(lane.at(-1)).toEqual({ x: 50, y: 5 });
    });
});

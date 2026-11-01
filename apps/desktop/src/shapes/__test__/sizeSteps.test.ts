// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { boxFrame, drawBox, type BoxParams } from "../box/boxGeometry";
import { chipLayout, sizeRun, type SizeRun } from "../editor/chip";
import type { ToolEnv } from "../tool/toolKind";

/**
 * The size number's − and + (owner lab feedback on #387, 2026-10-23: "fairly jarring"). Fix A:
 * the box no longer creeps. A run of presses keeps the pivot where it was when the run began (the
 * chip's anchor), and a corner exactly between two half steps goes against the way the box grew,
 * so the box stays within a quarter step of where it was and + then − comes back to the same
 * place. It grows from the center (the shape's pivot), as the owner picked from the lab.
 */

const STEP = 10;
const half = STEP / 2;
// The field rounds a tie up, as getRoundCoordinates does: the creep came from this
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({
        x: Math.round(p.x / half) * half,
        y: Math.round(p.y / half) * half,
    }),
    hitRadius: 3,
};

/** 23 marchers, Short back 6 × 4, 2 steps across and 2½ deep */
function start(): BoxParams {
    const drawn = drawBox({ x: 0, y: 0 }, { x: 100, y: 75 }, 23, env)!;
    return { ...drawn, across: 2 * STEP, deep: 2.5 * STEP };
}

const size = (p: BoxParams, e: ToolEnv = env) =>
    chipLayout(boxTool, p, 23, e).values.find((x) => x.param.key === "size")!;

/** Presses − and + as the chip does, one run: the anchor holds while each press follows the last */
function stepped(p: BoxParams, presses: readonly (-1 | 1)[]) {
    const seen: BoxParams[] = [p];
    let run: SizeRun | null = null;
    for (const by of presses) {
        const now = seen.at(-1)!;
        const anchor = sizeRun(run, boxTool, now, 23);
        const s = size(now, { ...env, anchor });
        const next = (by === 1 ? s.more : s.less) as BoxParams | null;
        expect(next).not.toBeNull();
        run = { params: next, anchor };
        seen.push(next!);
    }
    return seen;
}

describe("the size number's − and +", () => {
    it("comes back to the same place after + then −, with no creep", () => {
        const p = start();
        expect(size(p).display).toBe("6 × 4");
        const seen = stepped(p, [1, 1, 1, -1, -1, -1]);
        expect(size(seen[3]!).display).toBe("9 × 3");
        expect(seen.at(-1)!.center).toEqual(p.center);
        // And the other way round
        const back = stepped(p, [-1, -1, 1, 1]);
        expect(back.at(-1)!.center).toEqual(p.center);
    });

    it("comes back with no anchor too, one press each way", () => {
        const p = start();
        const more = size(p).more as BoxParams;
        expect(size(more).less).toEqual(p);
    });

    it("starts a new run when the shape changes some other way", () => {
        const p = start();
        const s = size(p);
        const run: SizeRun = { params: s.more, anchor: { x: 999, y: 999 } };
        // The run's own result keeps its anchor; anything else starts from its pivot
        expect(sizeRun(run, boxTool, s.more, 23)).toEqual({ x: 999, y: 999 });
        expect(sizeRun(run, boxTool, p, 23)).toEqual(p.center);
    });

    it("keeps the center within a quarter step of where it was at every step", () => {
        const p = start();
        for (const q of stepped(p, [1, 1, 1, -1, -1, -1, -1, -1]))
            expect(Math.abs(q.center.y - p.center.y)).toBeLessThanOrEqual(
                STEP / 4 + 1e-9,
            );
    });

    it("grows from the center (the owner picked center + glide)", () => {
        const p = start();
        const seen = stepped(p, [-1]);
        // 6 × 4 to 5 × 5: one rank deeper, about the center, so the front rank moves
        const front = (q: BoxParams) => q.center.y + boxFrame(q, 23).halfDepth;
        expect(front(seen[1]!)).not.toBeCloseTo(front(p), 6);
        expect(Math.abs(seen[1]!.center.y - p.center.y)).toBeLessThanOrEqual(
            STEP / 4 + 1e-9,
        );
    });
});

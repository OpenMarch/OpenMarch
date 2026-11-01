// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BOX_PARAMS } from "../boxParams";
import {
    boxFrame,
    changeFiles,
    stretchBox,
    type BoxHandleKey,
    type BoxParams,
} from "../boxGeometry";
import { scrubSpacing } from "../../editor/boxEdits";
import type { ToolEnv } from "../../tool/toolKind";

/**
 * Exact intervals that aren't half steps (#423): a typed 1⅔ stays 5/3 step and shows as 1⅔, and
 * the box keeps its held marcher where it was when its interval isn't a half step.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env = (over: Partial<ToolEnv> = {}): ToolEnv => ({
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
    ...over,
});
const [, ACROSS, DEEP] = BOX_PARAMS;
const exact = (a: number, b: number) =>
    expect(Math.abs(a - b)).toBeLessThan(1e-9);

/** 3 files by 3 ranks, 2 steps apart, its middle marcher on 0, 0 */
const box: BoxParams = {
    center: { x: 0, y: 0 },
    rotation: 0,
    files: 3,
    across: 2 * STEP,
    deep: 2 * STEP,
};

describe("typing a spacing that isn't a half step", () => {
    it("keeps 1⅔ exact however it's typed, and shows it as 1⅔", () => {
        for (const text of ["1⅔", "1 2/3", "1-2/3", "5/3", "1⅔ steps"]) {
            const p = ACROSS!.type(box, 9, text, env())!;
            exact(p.across, (5 / 3) * STEP);
            expect(ACROSS!.display(p, 9, STEP), text).toBe("1⅔");
        }
    });

    it("still keeps typed hundredths", () => {
        const p = ACROSS!.type(box, 9, "1.37", env())!;
        exact(p.across, 1.37 * STEP);
        expect(ACROSS!.display(p, 9, STEP)).toBe("1.37");
    });

    it("keeps fine drags on hundredths", () => {
        // 7 px with fine: 7 hundredths more
        const p = scrubSpacing(box, "across", 7, 9, env({ snap: false }));
        exact(p.across, 2.07 * STEP);
    });

    it("with the ratio lock at 1, makes deep exactly what across was typed", () => {
        const p = ACROSS!.type(box, 9, "2⅔", env({ ratioLocked: true }))!;
        exact(p.across, (8 / 3) * STEP);
        exact(p.deep, (8 / 3) * STEP);
        expect(DEEP!.display(p, 9, STEP)).toBe("2⅔");
    });

    it("with the ratio lock at 2, keeps the typed ratio exact, not on half steps", () => {
        const tall = { ...box, deep: 4 * STEP };
        const p = ACROSS!.type(tall, 9, "1⅔", env({ ratioLocked: true }))!;
        exact(p.deep, (10 / 3) * STEP);
    });
});

describe("the grid snap with an interval that isn't a half step", () => {
    const third = (5 / 3) * STEP;
    /** 3 by 3, 1⅔ steps apart both ways, its middle marcher on the grid at 0, 0 */
    const thirds: BoxParams = { ...box, across: third, deep: third };
    const edges = (p: BoxParams) => {
        const f = boxFrame(p, 9);
        return {
            left: f.center.x - f.halfWidth,
            right: f.center.x + f.halfWidth,
            back: f.center.y - f.halfDepth,
            front: f.center.y + f.halfDepth,
            center: f.center,
        };
    };

    it("keeps the center pivot where it was through + and − presses", () => {
        let p = thirds;
        for (let i = 0; i < 4; i++) {
            p = changeFiles(p, 9, 1, env());
            exact(edges(p).center.x, 0);
            exact(edges(p).center.y, 0);
            p = changeFiles(p, 9, -1, env());
            exact(edges(p).center.x, 0);
            exact(edges(p).center.y, 0);
        }
        exact(p.across, third);
    });

    it("keeps the center pivot when the spacing is dragged back onto half steps", () => {
        // 8 px is half a step more: 2⅙, on half steps 2
        const p = scrubSpacing(thirds, "across", 8, 9, env());
        exact(p.across, 2 * STEP);
        exact(edges(p).center.x, 0);
    });

    const pulls: [
        BoxHandleKey,
        { x: number; y: number },
        "left" | "right" | "back" | "front",
    ][] = [
        ["e", { x: 4 * STEP, y: 0 }, "left"],
        ["w", { x: -4 * STEP, y: 0 }, "right"],
        ["s", { x: 0, y: 4 * STEP }, "back"],
        ["n", { x: 0, y: -4 * STEP }, "front"],
    ];
    for (const [key, to, fixed] of pulls) {
        it(`keeps the fixed edge, and the other axis, where they were stretching from ${key}`, () => {
            const was = edges(thirds);
            const p = stretchBox(thirds, 9, key, to, env());
            const now = edges(p);
            exact(now[fixed], was[fixed]);
            // The other axis doesn't move
            if (key === "e" || key === "w") {
                exact(now.back, was.back);
                exact(now.front, was.front);
            } else {
                exact(now.left, was.left);
                exact(now.right, was.right);
            }
        });
    }
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { circleTool } from "../circle/circleTool";
import { withMode } from "../distribute/modes";
import type { BoxParams } from "../box/boxGeometry";
import type { DistributionMode } from "../distribute/distribution";
import type { ShapeFrame } from "../frame/frame";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    type ToolState,
} from "../tool/toolMachine";
import type { ShapeContext, XY } from "../types";

/**
 * Every mode switch keeps the frame the designer drew (#449, after #439): the center exactly, the
 * size within half a step per side (Grid and Outline stand on half-step intervals), and Grid →
 * Spread → Grid is the box it was.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

function drawn(kind: AnyToolKind, n: number, from: XY, to: XY): ToolState {
    let t = openTool(kind, marchers(n));
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx);
}

const switched = (t: ToolState, mode: DistributionMode) =>
    edit(t, withMode(t.kind, t.params, t.spots, mode, env), ctx);

const frameOf = (t: ToolState): ShapeFrame => t.kind.frameOf(t.params, t.spots);

function expectKept(
    now: ShapeFrame,
    was: ShapeFrame,
    what: string,
    /** Switches made: each may move a side up to half a step */
    switches = 1,
    /** More an outline may miss by: its across interval kept to 600ths of a step (#458) */
    slack = 0,
) {
    expect(now.center.x, `${what}: center`).toBeCloseTo(was.center.x, 9);
    expect(now.center.y, `${what}: center`).toBeCloseTo(was.center.y, 9);
    expect(now.rotation, `${what}: turn`).toBe(was.rotation);
    expect(
        Math.abs(now.halfWidth - was.halfWidth),
        `${what}: width ${2 * was.halfWidth} → ${2 * now.halfWidth}`,
    ).toBeLessThanOrEqual(switches * half + slack + 1e-9);
    expect(
        Math.abs(now.halfDepth - was.halfDepth),
        `${what}: depth ${2 * was.halfDepth} → ${2 * now.halfDepth}`,
    ).toBeLessThanOrEqual(switches * half + slack + 1e-9);
}

const COUNTS = [7, 12, 15, 24, 48];
/** An outline's interval kept to 600ths of a 10-unit step, over up to 24 intervals a side */
const ROUNDING = (24 * 10) / 600 / 2;
const BOX_MODES: DistributionMode[] = ["files", "outline", "spread"];
/** Boxes as drawn: wide, square-ish, deep */
const DRAWS: [XY, XY][] = [
    [
        { x: 0, y: 0 },
        { x: 120, y: 50 },
    ],
    [
        { x: 0, y: 0 },
        { x: 70, y: 60 },
    ],
    [
        { x: 0, y: 0 },
        { x: 40, y: 110 },
    ],
];

describe("a box keeps its frame through every mode switch (#449)", () => {
    describe.each(COUNTS)("at %i marchers", (n) => {
        it.each(
            BOX_MODES.flatMap((a) =>
                BOX_MODES.filter((b) => b !== a).map((b) => [a, b] as const),
            ),
        )("%s → %s", (a, b) => {
            for (const [from, to] of DRAWS) {
                const start = switched(drawn(boxTool, n, from, to), a);
                const was = frameOf(start);
                // A frame with no area (a line) has nothing to keep
                if (!(was.halfWidth > 0) || !(was.halfDepth > 0)) continue;
                const now = switched(start, b);
                // Outline keeps the frame to its across interval's 600ths of a step (#458, #459)
                const slack = a === "outline" || b === "outline" ? ROUNDING : 0;
                expectKept(
                    frameOf(now),
                    was,
                    `${a} → ${b} drawn to ${to.x},${to.y}`,
                    1,
                    slack,
                );
            }
        });
    });

    it.each(COUNTS)(
        "Grid → Spread → Grid is the box drawn, and Grid → Outline → Grid within half a step a side each way, at %i",
        (n) => {
            for (const [from, to] of DRAWS) {
                const grid = drawn(boxTool, n, from, to);
                const viaSpread = switched(switched(grid, "spread"), "files");
                expect(viaSpread.params).toEqual(
                    expect.objectContaining({
                        center: (grid.params as { center: XY }).center,
                        files: (grid.params as { files: number }).files,
                        across: (grid.params as { across: number }).across,
                        deep: (grid.params as { deep: number }).deep,
                    }),
                );
                const viaOutline = switched(switched(grid, "outline"), "files");
                expectKept(
                    frameOf(viaOutline),
                    frameOf(grid),
                    "via outline",
                    2,
                );
            }
        },
    );
});

describe("cycling modes never walks the box (#449 review)", () => {
    /** Counts and drawn boxes that walked before: each switch measured the last one's frame */
    const CASES: [number, XY][] = [
        [48, { x: 45, y: 110 }],
        [31, { x: 35, y: 30 }],
        [15, { x: 80, y: 60 }],
        [31, { x: 70, y: 60 }],
        ...[7, 12, 15, 24, 48].flatMap((n) =>
            DRAWS.map(([, to]) => [n, to] as [number, XY]),
        ),
    ];

    it.each(
        BOX_MODES.flatMap((a) =>
            BOX_MODES.filter((b) => b !== a).map((b) => [a, b] as const),
        ),
    )(
        "%s → %s → back, five times: the same frame and numbers each time",
        (a, b) => {
            for (const [n, to] of CASES) {
                const start = switched(
                    drawn(boxTool, n, { x: 0, y: 0 }, to),
                    a,
                );
                const frame = frameOf(start);
                let t = start;
                for (let cycle = 1; cycle <= 5; cycle++) {
                    t = switched(switched(t, b), a);
                    const what = `${n} drawn to ${to.x},${to.y}, cycle ${cycle}`;
                    expect(frameOf(t), what).toEqual(frame);
                    const { files, across, deep } = t.params as {
                        files: number;
                        across: number;
                        deep: number;
                    };
                    expect({ files, across, deep }, what).toEqual({
                        files: (start.params as { files: number }).files,
                        across: (start.params as { across: number }).across,
                        deep: (start.params as { deep: number }).deep,
                    });
                }
            }
        },
    );

    it("fits the box as reshaped since the last switch, not the one remembered", () => {
        const grid = drawn(boxTool, 24, { x: 0, y: 0 }, { x: 120, y: 50 });
        let outline = switched(grid, "outline");
        // A handle widens the outline: that's the box the designer wants now
        const e = boxTool
            .handles(outline.params, 24)
            .find((h) => h.key === "e")!;
        outline = press(outline, e.at, env);
        outline = pointerMove(outline, { x: e.at.x + 40, y: e.at.y }, env);
        outline = release(outline, ctx);
        const reshaped = frameOf(outline);
        expect(reshaped.halfWidth).toBeGreaterThan(
            frameOf(grid).halfWidth + 10,
        );
        const back = switched(outline, "files");
        expectKept(frameOf(back), reshaped, "after a reshape");
    });

    it("remembers through a placed recipe, saved as JSON", () => {
        const grid = drawn(boxTool, 15, { x: 0, y: 0 }, { x: 80, y: 60 });
        const outline = switched(grid, "outline");
        const saved = {
            ...outline,
            params: JSON.parse(JSON.stringify(outline.params)),
        };
        expect(frameOf(switched(saved, "files"))).toEqual(frameOf(grid));
    });

    it("Grid → Outline keeps 31 in 70 × 60, across exact off the half steps and deep following (owner on #458, #459)", () => {
        const grid = drawn(boxTool, 31, { x: 0, y: 0 }, { x: 70, y: 60 });
        const outline = switched(grid, "outline");
        const p = outline.params as { across: number; deep: number };
        expect(p.across % half).not.toBe(0);
        expectKept(
            frameOf(outline),
            frameOf(grid),
            "31 in 70 × 60",
            0,
            ROUNDING,
        );
    });
});

describe("a circle keeps its radius through every mode switch (#449)", () => {
    it.each(COUNTS)("Outline ↔ Spread at %i", (n) => {
        const outline = drawn(circleTool, n, { x: 0, y: 0 }, { x: 60, y: 0 });
        const spread = switched(outline, "spread");
        expectKept(frameOf(spread), frameOf(outline), "outline → spread");
        expectKept(
            frameOf(switched(spread, "outline")),
            frameOf(outline),
            "and back",
        );
    });
});

describe("what a box remembers, read from a file (#451 review)", () => {
    const N = 24;
    const grid = drawn(boxTool, N, { x: 0, y: 0 }, { x: 120, y: 50 });
    const outline = switched(grid, "outline");
    type Stored = { modes?: Record<string, unknown> };
    const memory = (outline.params as Stored).modes!;
    const withModes = (modes: unknown) => ({
        ...(outline.params as object),
        modes,
    });
    const forgotten = withModes(undefined);
    const toGrid = (params: unknown, n = N) =>
        withMode(boxTool, params, n, "files", env);

    it("remembers Grid's numbers as left", () => {
        const back = toGrid(outline.params) as BoxParams;
        const was = grid.params as BoxParams;
        expect([back.files, back.across, back.deep]).toEqual([
            was.files,
            was.across,
            was.deep,
        ]);
    });

    it.each([
        ["missing", undefined],
        ["not an object", "grid"],
        ["null", null],
        ["without a frame", { ...memory, frame: undefined }],
        [
            "with a frame of no size",
            { ...memory, frame: { width: 0, depth: 5 } },
        ],
        ["with a negative frame", { ...memory, seen: { width: -1, depth: 5 } }],
        ["with no count", { ...memory, count: undefined }],
        ["with a count that isn't a number", { ...memory, count: "24" }],
        ["with left numbers that aren't objects", { ...memory, left: 7 }],
    ])("starts from the box as it is when its memory is %s", (_, modes) => {
        expect(toGrid(withModes(modes))).toEqual(toGrid(forgotten));
    });

    it("forgets when the count changes: the box as it is is the new frame", () => {
        expect(toGrid(outline.params, N + 1)).toEqual(toGrid(forgotten, N + 1));
        const after = toGrid(outline.params, N + 1) as Stored;
        expect(after.modes?.count).toBe(N + 1);
    });

    const left = memory.left as Record<string, Record<string, unknown>>;
    it.each([
        ["more files than marchers", { files: N + 1 }],
        ["a part file", { files: 2.5 }],
        ["an interval wider than any field", { across: 1e12 }],
        ["an interval that isn't a number", { deep: "10" }],
    ])("ignores Grid's numbers when they hold %s", (_, bad) => {
        const modes = {
            ...memory,
            left: { ...left, files: { ...left.files, ...bad } },
        };
        const { files: _files, ...others } = left;
        expect(toGrid(withModes(modes))).toEqual(
            toGrid(withModes({ ...memory, left: others })),
        );
    });
});

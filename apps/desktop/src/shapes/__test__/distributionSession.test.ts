import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import {
    boxDistribution,
    changeFiles,
    filesOf,
    type BoxParams,
} from "../box/boxGeometry";
import { blockKind, type BlockParams } from "../kinds/block";
import {
    filesDistribution,
    type FilesDistribution,
} from "../distribute/distribution";
import {
    distributionOf,
    parseMode,
    switchModes,
    withMode,
} from "../distribute/modes";
import { boxesAt, type PlacedRecipe } from "../placed/placedBox";
import { placementOf } from "../tool/shapePlacement";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    undo,
    type ToolState,
} from "../tool/toolMachine";
import type { ShapeContext, XY } from "../types";
import { padTool, rowTool, type PadParams } from "./fakeRowKind";

/**
 * Distribution in the shape session (#386, spec #385): a closed kind is filled by the host's
 * distributor in the modes it declares, the mode is one undo step, and a recipe keeps its
 * distribution. Driven with the box and a fake closed kind the host has never heard of.
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

const xyOf = (spots: readonly XY[]) => spots.map((s) => [s.x, s.y]);

/** What placing `t` saves, through JSON as the database keeps it, read back as a placed box */
function reopened(t: ToolState) {
    const placement = placementOf(t, ctx)!;
    const recipe: PlacedRecipe = {
        ...placement.recipe,
        id: 1,
        timelineId: 10,
        members: placement.members,
        params: JSON.parse(JSON.stringify(placement.recipe.params)),
    };
    const at = new Map(placement.members.map((m) => [m.marcherId, m]));
    const [box] = boxesAt({
        recipes: [recipe],
        endBeatOf: () => 8,
        beat: 8,
        positionOf: (id) => at.get(id),
    });
    return { box: box!, stored: recipe.params as Record<string, unknown> };
}

describe("a fake closed kind fills through the distributor", () => {
    it("lays its spots out in Files, the short rank at the back", () => {
        // 5 marchers in 3 files, 2 steps apart, around (120, 100)
        const t = drawn(padTool, 5, { x: 100, y: 100 }, { x: 140, y: 100 });
        expect(xyOf(slotsOf(t, ctx))).toEqual([
            [110, 90],
            [130, 90],
            [100, 110],
            [120, 110],
            [140, 110],
        ]);
    });

    it("offers its own modes, the box Files, Outline and Spread, and open kinds none", () => {
        expect(switchModes(padTool)).toEqual(["files", "outline"]);
        expect(switchModes(boxTool)).toEqual(["files", "outline", "spread"]);
        expect(switchModes(rowTool)).toEqual([]);
    });

    it("switches mode as one undo step", () => {
        const t = drawn(padTool, 5, { x: 100, y: 100 }, { x: 140, y: 100 });
        expect(distributionOf(padTool, t.params, 5)?.mode).toBe("files");
        const outline = edit(
            t,
            withMode(padTool, t.params, 5, "outline", env),
            ctx,
        );
        expect((outline.params as PadParams).distribution).toEqual({
            mode: "outline",
            oddGap: { side: "back", at: null, style: "spread" },
        });
        expect(undo(outline).params).toBe(t.params);
    });

    it("leaves a shape alone in its own mode or one its kind lacks", () => {
        const t = drawn(padTool, 5, { x: 100, y: 100 }, { x: 140, y: 100 });
        expect(withMode(padTool, t.params, 5, "files", env)).toBe(t.params);
        expect(withMode(padTool, t.params, 5, "spread", env)).toBe(t.params);
        const box = drawn(boxTool, 6, { x: 0, y: 0 }, { x: 20, y: 10 });
        expect(withMode(boxTool, box.params, 6, "files", env)).toBe(box.params);
    });

    it("reads a typed mode by its name or the start of it", () => {
        expect(parseMode("Outline", ["files", "outline"])).toBe("outline");
        expect(parseMode(" out", ["files", "outline"])).toBe("outline");
        expect(parseMode("g", ["files", "outline"])).toBe("files");
        expect(parseMode("spread", ["files", "outline"])).toBeNull();
        expect(parseMode("", ["files", "outline"])).toBeNull();
    });
});

describe("the box's distribution", () => {
    it("is Files, Short back, no stagger when drawn, and writes no pattern", () => {
        // 3 × 2
        const t = drawn(boxTool, 6, { x: 0, y: 0 }, { x: 20, y: 10 });
        const p = t.params as BoxParams;
        expect(p.distribution).toEqual(filesDistribution(3));
        expect(p).not.toHaveProperty("pattern");
        expect(p).not.toHaveProperty("shortRankAt");
    });

    it("keeps its layout's file count with the box's through a change of files", () => {
        const t = drawn(boxTool, 12, { x: 0, y: 0 }, { x: 30, y: 20 });
        const more = changeFiles(t.params as BoxParams, 12, 2, env);
        expect(filesOf(more)).toBe(6);
        expect((more.distribution as FilesDistribution).layout.files).toBe(6);
    });

    it("keeps its stagger through a stretch", () => {
        let t = drawn(boxTool, 6, { x: 0, y: 0 }, { x: 20, y: 10 });
        t = edit(
            t,
            boxTool.closed!.withDistribution(
                t.params as BoxParams,
                6,
                { ...filesDistribution(3), stagger: [1, 2] },
                env,
            ),
            ctx,
        );
        const handle = boxTool.handles(t.params, 6).find((h) => h.key === "e")!;
        t = press(t, handle.at, env);
        t = pointerMove(t, { x: handle.at.x + 20, y: handle.at.y }, env);
        t = release(t, ctx);
        expect((t.params as BoxParams).across).toBe(20);
        expect(boxDistribution(t.params as BoxParams)).toMatchObject({
            stagger: [1, 2],
        });
    });

    it("saves and reopens with its distribution and spots", () => {
        let t = drawn(boxTool, 6, { x: 0, y: 0 }, { x: 20, y: 10 });
        t = edit(
            t,
            boxTool.closed!.withDistribution(
                t.params as BoxParams,
                6,
                { ...filesDistribution(3), stagger: [-1, 3] },
                env,
            ),
            ctx,
        );
        const { box, stored } = reopened(t);
        expect(stored.distribution).toEqual({
            mode: "files",
            layout: { family: "shortBack", files: 3, byFile: false },
            stagger: [-1, 3],
        });
        expect(boxDistribution(box.params)).toEqual(stored.distribution);
        expect(boxTool.shape.generate(box.params, 6, ctx)).toEqual(
            slotsOf(t, ctx),
        );
    });

    it("reads an old recipe (pattern: grid, no distribution) as Files, Short back, unchanged", () => {
        const old = {
            center: { x: 50, y: 40 },
            rotation: 0.3,
            files: 4,
            across: 20,
            deep: 10,
            pattern: "grid",
            shortRank: "center",
            shortRankAt: "back",
            spots: 10,
        };
        const today = blockKind.generate(old as BlockParams, 10, ctx);
        const recipe: PlacedRecipe = {
            id: 1,
            timelineId: 10,
            kind: "block",
            kindVersion: 1,
            params: old,
            orderMode: "nearest",
            reverse: false,
            createdAt: "",
            members: today.map((s, slot) => ({
                marcherId: slot + 1,
                slot,
                x: s.x,
                y: s.y,
            })),
        } as unknown as PlacedRecipe;
        const [box] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => today[id - 1],
        });
        expect(boxDistribution(box!.params)).toEqual(filesDistribution(4));
        expect(boxTool.shape.generate(box!.params, 10, ctx)).toEqual(today);
    });

    it("reads a distribution it can't use as Files, Short back", () => {
        const p = {
            center: { x: 0, y: 0 },
            rotation: 0,
            files: 3,
            across: 10,
            deep: 10,
            distribution: { mode: "zigzag", stagger: "much" },
        } as unknown as BoxParams;
        expect(boxDistribution(p)).toEqual(filesDistribution(3));
        const bad = {
            ...p,
            distribution: { mode: "files", layout: {}, stagger: [1, 0] },
        } as unknown as BoxParams;
        expect(boxDistribution(bad)).toEqual(filesDistribution(3));
    });
});

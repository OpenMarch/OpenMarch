import { describe, expect, it } from "vitest";
import { boxTool } from "../boxTool";
import {
    boxBlock,
    boxDistribution,
    boxFrame,
    type BoxParams,
} from "../boxGeometry";
import type { FilesLayout, LayoutFamily } from "../../distribute/distribution";
import { layoutOf, withLayout } from "../../distribute/modes";
import { layoutCatalogue, layoutOrientations } from "../../distribute/layouts";
import { chipLayout, quarterTurn } from "../../editor/chip";
import { boxesAt, type PlacedRecipe } from "../../placed/placedBox";
import { placementOf } from "../../tool/shapePlacement";
import type { ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, Slot, XY } from "../../types";

/**
 * The box's layouts in the shape session (#387, spec #385): picking a version, the stepper and
 * drags keeping the chosen layout, the last-used layout for a new box, and Short back standing in
 * when a layout can't make the count.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const envWith = (layout?: LayoutFamily): ToolEnv => ({
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
    layout,
});
const env = envWith();
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

function drawn(n: number, from: XY, to: XY, e: ToolEnv = env): ToolState {
    let t = openTool(boxTool, marchers(n));
    t = press(t, from, e);
    t = pointerMove(t, to, e);
    return release(t, ctx);
}

/** How many spots stand on each line across (by y), back first */
const rankCounts = (slots: readonly Slot[]) => countsBy(slots, (s) => s.y);
/** How many spots stand on each line front to back (by x), left first */
const fileCounts = (slots: readonly Slot[]) => countsBy(slots, (s) => s.x);
function countsBy(slots: readonly Slot[], key: (s: Slot) => number) {
    const by = new Map<number, number>();
    for (const s of slots) {
        const k = Math.round(key(s) * 1000) / 1000;
        by.set(k, (by.get(k) ?? 0) + 1);
    }
    return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
}

const versionOf = (n: number, family: LayoutFamily, label: string, i = 0) =>
    layoutCatalogue(n)
        .find((r) => r.family === family)!
        .versions.filter((v) => v.label === label)[i]!;

const pick = (t: ToolState, layout: FilesLayout) =>
    edit(t, withLayout(boxTool, t.params, t.spots, layout, env), ctx);

const sizeOf = (p: BoxParams, n: number, e: ToolEnv = env) =>
    chipLayout(boxTool, p, n, e).values.find((x) => x.param.key === "size")!;

describe("picking a layout", () => {
    // 23 marchers, drawn about square: Short back 6 × 4, 1 short
    const start = () => drawn(23, { x: 0, y: 0 }, { x: 80, y: 80 });

    it("offers the box's catalogue, and the box starts in Short back", () => {
        const t = start();
        expect(
            boxTool.closed!.layouts!.catalogue(23).map((r) => r.label),
        ).toEqual(["Full", "Stagger", "Rounded", "Short back", "Notched"]);
        expect(layoutOf(boxTool, t.params, 23)!.layout.family).toBe(
            "shortBack",
        );
    });

    it("lays out Stagger 5 × 5 as 5 / 4 / 5 / 4 / 5, the short ranks between the files", () => {
        const t = pick(start(), versionOf(23, "stagger", "5 × 5").layout);
        const slots = slotsOf(t, ctx);
        expect(slots).toHaveLength(23);
        expect(rankCounts(slots)).toEqual([5, 4, 5, 4, 5]);
        expect(fileCounts(slots)).toEqual([3, 2, 3, 2, 3, 2, 3, 2, 3]);
        const p = t.params as BoxParams;
        expect(boxFrame(p, 23).halfWidth).toBe(2 * p.across);
        expect(boxFrame(p, 23).halfDepth).toBe(2 * p.deep);
        expect(sizeOf(p, 23).display).toBe("5 × 5");
        expect(sizeOf(p, 23).note).toBeNull();
    });

    it("lays out a turned version by file", () => {
        // Not listed (it's a quarter turn of 5 × 5), but drawn deep or typed it's there
        const turned = layoutOrientations(23, "stagger").find(
            (v) => v.layout.byFile && v.label === "5 × 5",
        )!.layout;
        const slots = slotsOf(pick(start(), turned), ctx);
        expect(fileCounts(slots)).toEqual([5, 4, 5, 4, 5]);
        expect(slots).toHaveLength(23);
    });

    it("is one undo step, and remembers nothing else about the box", () => {
        const t = start();
        const p = pick(t, versionOf(23, "rounded", "5 × 5 staggered").layout);
        expect(rankCounts(slotsOf(p, ctx))).toEqual([4, 5, 5, 5, 4]);
        expect(undo(p).params).toBe(t.params);
        expect((p.params as BoxParams).across).toBe(
            (t.params as BoxParams).across,
        );
    });

    it("centers Stagger, Rounded and Notched ranks however the box is staggered", () => {
        const t = pick(
            start(),
            versionOf(23, "notched", "5 × 5 straight").layout,
        );
        const p = t.params as BoxParams;
        const d = boxDistribution(p);
        if (d.mode !== "files") throw new Error("files");
        const leaned = boxTool.closed!.withDistribution(
            p,
            23,
            { ...d, stagger: [1, 3] },
            env,
        );
        expect(boxTool.shape.generate(leaned, 23, ctx)).toEqual(
            slotsOf(t, ctx),
        );
    });

    it("comes back from a saved recipe in its layout", () => {
        const t = pick(start(), versionOf(23, "stagger", "8 × 3").layout);
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
        expect(boxDistribution(box!.params)).toMatchObject({
            layout: { family: "stagger", files: 8, byFile: false },
        });
        expect(boxTool.shape.generate(box!.params, 23, ctx)).toEqual(
            slotsOf(t, ctx),
        );
    });
});

describe("keeping the layout", () => {
    it("stores a layout given at a width it can't make the count with as its nearest version", () => {
        // A saved Stagger applied at the drawn file count (#393): 6 across can't make 23
        const t = drawn(23, { x: 0, y: 0 }, { x: 80, y: 80 });
        const p = boxTool.closed!.withDistribution(
            t.params as BoxParams,
            23,
            {
                mode: "files",
                layout: { family: "stagger", files: 6, byFile: false },
                stagger: [0, 1],
            },
            env,
        );
        expect(boxDistribution(p)).toMatchObject({
            layout: { family: "stagger", files: 5, byFile: false },
        });
        expect(p.files).toBe(5);
        expect(rankCounts(boxTool.shape.generate(p, 23, ctx))).toEqual([
            5, 4, 5, 4, 5,
        ]);
    });

    it("keeps a layout whose family can't make the count as asked, Short back standing in", () => {
        const t = drawn(23, { x: 0, y: 0 }, { x: 80, y: 80 });
        const p = boxTool.closed!.withDistribution(
            t.params as BoxParams,
            23,
            {
                mode: "files",
                layout: { family: "full", files: 6, byFile: false },
                stagger: [0, 1],
            },
            env,
        );
        expect(boxDistribution(p)).toMatchObject({
            layout: { family: "full", files: 6 },
        });
        expect(boxTool.shape.generate(p, 23, ctx)).toHaveLength(23);
        // The chip's layout menu shows Full greyed with what it needs; no text note
        expect(boxBlock(p, 23).fellBack).toBe("full");
        expect(sizeOf(p, 23).note).toBeNull();
    });

    it("steps the size between versions of the chosen layout", () => {
        // 24 as Full 6 × 4
        let t = drawn(24, { x: 0, y: 0 }, { x: 100, y: 60 });
        t = pick(t, versionOf(24, "full", "6 × 4").layout);
        const size = sizeOf(t.params as BoxParams, 24);
        expect(sizeOf(size.more as BoxParams, 24).display).toBe("8 × 3");
        expect(sizeOf(size.less as BoxParams, 24).display).toBe("4 × 6");
        expect(
            boxDistribution(size.more as BoxParams).mode === "files" &&
                boxBlock(size.more as BoxParams, 24).layout.family,
        ).toBe("full");
        // 3 × 8 is the deepest Full for 24: nothing narrower
        const deepest = pick(
            t,
            layoutOrientations(24, "full").find((v) => v.label === "3 × 8")!
                .layout,
        );
        expect(sizeOf(deepest.params as BoxParams, 24).less).toBeNull();
    });

    it("steps through turned versions too, by how many across", () => {
        let t = drawn(23, { x: 0, y: 0 }, { x: 80, y: 80 });
        t = pick(t, versionOf(23, "stagger", "5 × 5").layout);
        const more = sizeOf(t.params as BoxParams, 23).more as BoxParams;
        expect(sizeOf(more, 23).display).toBe("8 × 3");
        // 9 × 3 is 3 × 9 turned a quarter
        const wider = sizeOf(more, 23).more as BoxParams;
        expect(sizeOf(wider, 23).display).toBe("9 × 3");
        expect(boxBlock(wider, 23).layout).toMatchObject({
            family: "stagger",
            byFile: true,
        });
        const less = sizeOf(t.params as BoxParams, 23).less as BoxParams;
        expect(sizeOf(less, 23).display).toBe("3 × 9");
        expect(boxBlock(less, 23).layout).toMatchObject({
            family: "stagger",
            byFile: false,
        });
    });

    it("keeps Short back's stepper as it was: one more or fewer across", () => {
        const t = drawn(23, { x: 0, y: 0 }, { x: 80, y: 80 });
        const size = sizeOf(t.params as BoxParams, 23);
        expect(size.display).toBe("6 × 4");
        expect(sizeOf(size.more as BoxParams, 23).display).toBe("7 × 4");
        expect(sizeOf(size.less as BoxParams, 23).display).toBe("5 × 5");
    });

    it("keeps the layout through a handle drag", () => {
        let t = drawn(23, { x: 0, y: 0 }, { x: 80, y: 80 });
        t = pick(t, versionOf(23, "stagger", "5 × 5").layout);
        const handle = boxTool
            .handles(t.params, 23)
            .find((h) => h.key === "e")!;
        t = press(t, handle.at, env);
        t = pointerMove(t, { x: handle.at.x + 40, y: handle.at.y }, env);
        t = release(t, ctx);
        expect(boxBlock(t.params as BoxParams, 23).layout.family).toBe(
            "stagger",
        );
        expect(rankCounts(slotsOf(t, ctx))).toEqual([5, 4, 5, 4, 5]);
    });

    it("keeps the layout when the count changes, in the version nearest its proportions", () => {
        let t = drawn(23, { x: 0, y: 0 }, { x: 80, y: 80 });
        t = pick(t, versionOf(23, "stagger", "5 × 5").layout);
        const p = t.params as BoxParams;
        expect(boxBlock(p, 22).lines).toEqual([4, 5, 4, 5, 4]);
        expect(boxTool.shape.generate(p, 22, ctx)).toHaveLength(22);
        expect(sizeOf(p, 22).note).toBeNull();
    });

    it("falls back to Short back with a chip note when the layout can't make the count", () => {
        let t = drawn(24, { x: 0, y: 0 }, { x: 100, y: 60 });
        t = pick(t, versionOf(24, "full", "6 × 4").layout);
        const p = t.params as BoxParams;
        expect(boxBlock(p, 23).layout.family).toBe("shortBack");
        expect(boxTool.shape.generate(p, 23, ctx)).toHaveLength(23);
        // The chip's layout menu shows Full greyed with what it needs; no text note
        expect(boxBlock(p, 23).fellBack).toBe("full");
        expect(sizeOf(p, 23).note).toBeNull();
        // and it comes back when the count does
        expect(boxBlock(p, 24).layout.family).toBe("full");
    });
});

describe("the chip's turn button", () => {
    it("turns the box a quarter, so the deep version is one click from the wide one", () => {
        let t = drawn(24, { x: 0, y: 0 }, { x: 100, y: 60 });
        t = pick(t, versionOf(24, "full", "8 × 3").layout);
        const turned = quarterTurn(boxTool, t.params, 24, env) as BoxParams;
        expect(sizeOf(turned, 24).display).toBe("3 × 8");
        const slots = boxTool.shape.generate(turned, 24, ctx);
        expect(slots).toHaveLength(24);
        expect(fileCounts(slots)).toEqual([8, 8, 8]);
        // The picker still finds its version, turned
        expect(boxBlock(turned, 24).layout.family).toBe("full");
    });
});

describe("the layout a new box starts in", () => {
    it("is the last used, in the version nearest the drawn proportions", () => {
        const square = drawn(
            23,
            { x: 0, y: 0 },
            { x: 80, y: 80 },
            envWith("stagger"),
        );
        expect(sizeOf(square.params as BoxParams, 23).display).toBe("5 × 5");
        expect(rankCounts(slotsOf(square, ctx))).toEqual([5, 4, 5, 4, 5]);
        const wide = drawn(
            23,
            { x: 0, y: 0 },
            { x: 140, y: 40 },
            envWith("stagger"),
        );
        // 3½ : 1 drawn: 9 × 3 is exactly 3:1, within it
        expect(sizeOf(wide.params as BoxParams, 23).display).toBe("9 × 3");
    });

    it("falls back to Short back, noting the layout it stands in for", () => {
        const t = drawn(23, { x: 0, y: 0 }, { x: 80, y: 80 }, envWith("full"));
        const p = t.params as BoxParams;
        expect(boxBlock(p, 23).layout.family).toBe("shortBack");
        expect(slotsOf(t, ctx)).toHaveLength(23);
        // The chip's layout menu shows Full greyed with what it needs; no text note
        expect(boxBlock(p, 23).fellBack).toBe("full");
        expect(sizeOf(p, 23).note).toBeNull();
    });

    it("is Short back with nothing remembered, exactly as before", () => {
        const t = drawn(23, { x: 0, y: 0 }, { x: 80, y: 80 });
        expect(boxDistribution(t.params as BoxParams)).toMatchObject({
            layout: { family: "shortBack", files: 6 },
        });
        expect(sizeOf(t.params as BoxParams, 23).note).toBe("1 short");
    });
});

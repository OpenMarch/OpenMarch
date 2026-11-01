import { describe, expect, it } from "vitest";
import { SavedShapeSchema } from "@/db-functions/savedShapes";
import { boxTool } from "../../box/boxTool";
import { filesOf, ranksOf, type BoxParams } from "../../box/boxGeometry";
import {
    savedShapeOf,
    newerSavedShapes,
    savedShapeRows,
    savedToolKind,
    suggestedName,
    intervalsOf,
} from "../savedShapes";
import { placementOf } from "../../tool/shapePlacement";
import { shapeSteps, startingParams } from "../../command/shapeSteps";
import type { AnyToolKind, ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    switchKind,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";
import { padTool, rowTool, type RowParams } from "../../__test__/fakeRowKind";
import type { Distribution } from "../../distribute/distribution";
import { distributionOf } from "../../distribute/modes";

/**
 * Saved shapes (#353): saving keeps a shape's kind and intervals, not its size or count, so a
 * saved shape applied to another selection lays out that many spots the saved distance apart.
 * Driven through the shape session with the box and a fake kind.
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
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

function drawn(kind: AnyToolKind, n: number, from: XY, to: XY): ToolState {
    let t = openTool(kind, marchers(n));
    t = press(t, from, env());
    t = pointerMove(t, to, env());
    return release(t, ctx);
}

/** A box of 6 drawn 2 steps apart, then widened to 3 across and 1½ deep in the chip */
function wideBox(): ToolState {
    const t = drawn(boxTool, 6, { x: 0, y: 0 }, { x: 40, y: 20 });
    const [, across, deep] = boxTool.params;
    let params = across!.type(t.params, 6, "3", env())!;
    params = deep!.type(params, 6, "1.5", env())!;
    return edit(t, params, ctx);
}

const AT = "2026-10-22T12:00:00.000Z";
const SAVED = { id: "s1", name: "Wide box", at: AT };

describe("saving a shape", () => {
    it("keeps the kind and its intervals in steps, not its size or count", () => {
        const t = wideBox();
        const saved = savedShapeOf(t.kind, t.params, t.spots, STEP, SAVED);
        expect(saved).toEqual({
            id: "s1",
            name: "Wide box",
            kind: boxTool.shape.id,
            kindVersion: boxTool.shape.version,
            intervals: { across: 3, deep: 1.5 },
            distribution: {
                mode: "files",
                layout: { family: "shortBack", byFile: false },
                stagger: [0, 1],
            },
            createdAt: AT,
            updatedAt: AT,
        });
    });

    it("works for a kind the host doesn't know", () => {
        const t = drawn(rowTool, 5, { x: 0, y: 0 }, { x: 60, y: 0 });
        const saved = savedShapeOf(t.kind, t.params, t.spots, STEP, SAVED);
        expect(saved.kind).toBe(rowTool.shape.id);
        expect(saved.intervals).toEqual({
            gap: (t.params as RowParams).gap / STEP,
        });
    });

    it("offers the kind and its spacing as the name", () => {
        const t = wideBox();
        expect(suggestedName(t.kind, t.params, t.spots, STEP)).toBe(
            "Box 3 × 1½ apart",
        );
    });

    it("saving a shape opened from a saved one names the basic kind", () => {
        const kind = savedToolKind(rowTool, {
            ...SAVED,
            kind: rowTool.shape.id,
            kindVersion: 1,
            intervals: { gap: 3 },
        });
        const t = drawn(kind, 4, { x: 0, y: 0 }, { x: 50, y: 0 });
        const again = savedShapeOf(t.kind, t.params, t.spots, STEP, {
            id: "s2",
            name: "Again",
            at: AT,
        });
        expect(again.kind).toBe(rowTool.shape.id);
        expect(again.intervals).toEqual({ gap: 3 });
    });
});

describe("applying a saved shape to another selection", () => {
    const saved = () => savedShapeOf(boxTool, wideBox().params, 6, STEP, SAVED);

    it("keeps its intervals and fits the new count", () => {
        const kind = savedToolKind(boxTool, saved());
        for (const n of [4, 12, 15]) {
            const t = drawn(kind, n, { x: 0, y: 0 }, { x: 80, y: 40 });
            const p = t.params as BoxParams;
            expect(filesOf(p) * ranksOf(p, n)).toBeGreaterThanOrEqual(n);
            expect(intervalsOf(boxTool, p, n, STEP)).toEqual({
                across: 3,
                deep: 1.5,
            });
            // The placed recipe is an ordinary box: it reopens without the saved shape
            expect(placementOf(t, ctx)?.recipe.kind).toBe(boxTool.shape.id);
            expect(placementOf(t, ctx)?.members).toHaveLength(n);
        }
    });

    it("keeps the corner the drag started from", () => {
        const kind = savedToolKind(boxTool, saved());
        const t = drawn(kind, 8, { x: 0, y: 0 }, { x: 70, y: 30 });
        const frame = boxTool.frameOf(t.params, 8);
        expect(frame.center.x - frame.halfWidth).toBeCloseTo(0);
        expect(frame.center.y - frame.halfDepth).toBeCloseTo(0);
    });

    it("turns an open shape into it keeping the frame's center", () => {
        const kind = savedToolKind(boxTool, saved());
        const open = drawn(boxTool, 9, { x: 0, y: 0 }, { x: 40, y: 40 });
        const switched = switchKind(open, kind, ctx, env());
        expect(switched.kind).toBe(kind);
        expect(intervalsOf(boxTool, switched.params, 9, STEP)).toEqual({
            across: 3,
            deep: 1.5,
        });
        expect(boxTool.frameOf(switched.params, 9).center).toEqual(
            boxTool.frameOf(open.params, 9).center,
        );
    });

    it("works for a kind the host doesn't know", () => {
        const kind = savedToolKind(rowTool, {
            ...SAVED,
            kind: rowTool.shape.id,
            kindVersion: 1,
            intervals: { gap: 2.5 },
        });
        const t = drawn(kind, 7, { x: 0, y: 0 }, { x: 100, y: 0 });
        expect((t.params as RowParams).gap).toBe(25);
    });

    it("starts the command bar's steps from the saved intervals", () => {
        const kind = savedToolKind(boxTool, saved());
        const starts = marchers(10).map((m) => m.at);
        const base = startingParams(kind, starts, 10, env());
        expect(intervalsOf(boxTool, base, 10, STEP)).toEqual({
            across: 3,
            deep: 1.5,
        });
        const { steps } = shapeSteps(kind, base, 10, env(), []);
        expect(steps.map((s) => [s.param.key, s.initial])).toEqual([
            ["mode", "Grid"],
            ["size", expect.any(String)],
            ["across", "3"],
            ["deep", "1½"],
            ["layout", expect.any(String)],
        ]);
    });

    it("restores intervals by number, not by how they're shown (#423)", () => {
        // 2⅔ across and 1⅛ deep: the chip shows 1⅛ as "1.13"
        const t = drawn(boxTool, 6, { x: 0, y: 0 }, { x: 40, y: 20 });
        const [, across, deep] = boxTool.params;
        let params = across!.type(t.params, 6, "2⅔", env())!;
        params = deep!.type(params, 6, "9/8", env())!;
        const kind = savedToolKind(
            boxTool,
            savedShapeOf(boxTool, params, 6, STEP, SAVED),
        );
        const expectExact = (p: unknown, n: number) => {
            const got = intervalsOf(boxTool, p, n, STEP);
            expect(got.across).toBeCloseTo(8 / 3, 12);
            expect(got.deep).toBeCloseTo(9 / 8, 12);
        };
        const placed = drawn(kind, 6, { x: 0, y: 0 }, { x: 80, y: 40 });
        expectExact(placed.params, 6);
        // From the command bar
        const starts = marchers(6).map((m) => m.at);
        expectExact(startingParams(kind, starts, 6, env()), 6);
    });

    it("keeps a command bar step's number when its answer is the number as shown", () => {
        const kind = savedToolKind(boxTool, {
            ...SAVED,
            kind: boxTool.shape.id,
            kindVersion: boxTool.shape.version,
            intervals: { across: 9 / 8, deep: 9 / 8 },
        });
        const starts = marchers(6).map((m) => m.at);
        const base = startingParams(kind, starts, 6, env());
        const { params } = shapeSteps(kind, base, 6, env(), ["", "", "1.13"]);
        expect(intervalsOf(boxTool, params, 6, STEP).across).toBeCloseTo(
            9 / 8,
            12,
        );
    });

    it("is the same kind each time, so pickers can tell it's armed", () => {
        expect(savedToolKind(boxTool, saved())).toBe(
            savedToolKind(boxTool, saved()),
        );
    });
});

describe("the library's Saved group", () => {
    const tools = [{ kind: boxTool, action: "shapeBlock" as const }];
    const shape = (id: string, name: string) => ({
        id,
        name,
        kind: boxTool.shape.id,
        kindVersion: boxTool.shape.version,
        intervals: { across: 2, deep: 2 },
    });

    it("lists the user's saved shapes, then those only the open show has", () => {
        const rows = savedShapeRows(
            [shape("a", "Mine")],
            [shape("a", "Mine"), shape("b", "From the show")],
            tools,
        );
        expect(
            rows.map((r) => [r.id, r.label, r.note, r.saved?.inLibrary]),
        ).toEqual([
            ["a", "Mine", "Box · 2 apart", true],
            ["b", "From the show", "Box · 2 apart · this show only", false],
        ]);
        expect(rows.every((r) => r.group === "saved")).toBe(true);
    });

    it("leaves out a saved shape of a kind this app doesn't have", () => {
        expect(
            savedShapeRows(
                [{ ...shape("a", "Arc"), kind: "arc-from-later" }],
                [],
                tools,
            ),
        ).toEqual([]);
    });

    it("counts the saved shapes it leaves out for a newer app, each once", () => {
        const box = shape("a", "Box");
        const newer = { ...box, id: "n", kindVersion: box.kindVersion + 1 };
        expect(
            newerSavedShapes(
                [newer, box, { ...box, id: "k", kind: "arc-from-later" }],
                [newer, { ...newer, id: "b" }],
                tools,
            ),
        ).toBe(3);
        expect(newerSavedShapes([box], [box], tools)).toBe(0);
    });

    it("leaves out a saved shape of another version of a kind, as placed shapes do (B3)", () => {
        const box = shape("a", "Box");
        expect(
            savedShapeRows(
                [{ ...box, kindVersion: box.kindVersion + 1 }],
                [{ ...shape("b", "Old"), kindVersion: box.kindVersion - 1 }],
                tools,
            ),
        ).toEqual([]);
        expect(savedShapeRows([box], [], tools)).toHaveLength(1);
    });
});

/** A box of `n` drawn 2 steps apart, filled as `distribution` */
function filledBox(n: number, distribution: Distribution): ToolState {
    const t = drawn(boxTool, n, { x: 0, y: 0 }, { x: 40, y: 40 });
    return edit(
        t,
        boxTool.closed!.withDistribution(
            t.params as BoxParams,
            n,
            distribution,
            env(),
        ),
        ctx,
    );
}

const staggered = (files: number): Distribution => ({
    mode: "files",
    layout: { family: "shortBack", files, byFile: false },
    stagger: [1, 2],
});

/** The fake closed kind, able to spread too, as the circle and the box will (#391) */
const spreadPad = {
    ...padTool,
    closed: {
        ...padTool.closed!,
        modes: ["files", "outline", "spread"] as const,
    },
};

describe("a saved shape's distribution, description and dates (#393)", () => {
    it("keeps the layout family and stagger, but not the size", () => {
        const t = filledBox(9, staggered(3));
        const saved = savedShapeOf(t.kind, t.params, t.spots, STEP, SAVED);
        expect(saved.distribution).toEqual({
            mode: "files",
            layout: { family: "shortBack", byFile: false },
            stagger: [1, 2],
        });
    });

    it("keeps a spread's mode but not its seed or the count it was laid out for", () => {
        const spread = {
            mode: "spread",
            seed: 7,
            generator: 1,
            count: 9,
        } as unknown as Distribution;
        const params = spreadPad.closed.withDistribution(
            drawn(padTool, 9, { x: 0, y: 0 }, { x: 40, y: 0 }).params as never,
            9,
            spread,
            env(),
        );
        const saved = savedShapeOf(spreadPad, params, 9, STEP, SAVED);
        expect(saved.distribution).toMatchObject({ mode: "spread" });
        expect(saved.distribution).not.toHaveProperty("seed");
        expect(saved.distribution).not.toHaveProperty("count");
    });

    it("keeps no distribution for an open kind", () => {
        const t = drawn(rowTool, 5, { x: 0, y: 0 }, { x: 60, y: 0 });
        const saved = savedShapeOf(t.kind, t.params, t.spots, STEP, SAVED);
        expect(saved).not.toHaveProperty("distribution");
    });

    it("keeps a description, trimmed, and none when it's blank", () => {
        const t = wideBox();
        const of = (description: string) =>
            savedShapeOf(t.kind, t.params, t.spots, STEP, {
                ...SAVED,
                description,
            });
        expect(of("  For the opener ").description).toBe("For the opener");
        expect(of("   ")).not.toHaveProperty("description");
    });

    it("a saved staggered box applied to another count keeps its layout family and stagger", () => {
        const t = filledBox(9, staggered(3));
        const kind = savedToolKind(
            boxTool,
            savedShapeOf(t.kind, t.params, t.spots, STEP, SAVED),
        );
        for (const n of [5, 12, 23]) {
            const placed = drawn(kind, n, { x: 0, y: 0 }, { x: 80, y: 40 });
            const d = distributionOf(boxTool, placed.params, n);
            expect(d).toMatchObject({
                mode: "files",
                layout: { family: "shortBack", byFile: false },
                stagger: [1, 2],
            });
            // The size is the drawn one's, not the saved shape's
            if (d?.mode === "files")
                expect(d.layout.files).toBe(
                    filesOf(placed.params as BoxParams),
                );
            expect(placementOf(placed, ctx)?.members).toHaveLength(n);
        }
    });

    it("turning an open shape into a saved one fills it the saved way", () => {
        const t = filledBox(9, staggered(3));
        const kind = savedToolKind(
            boxTool,
            savedShapeOf(t.kind, t.params, t.spots, STEP, SAVED),
        );
        const open = drawn(boxTool, 10, { x: 0, y: 0 }, { x: 40, y: 40 });
        const switched = switchKind(open, kind, ctx, env());
        expect(distributionOf(boxTool, switched.params, 10)).toMatchObject({
            stagger: [1, 2],
        });
    });

    it("a saved spread is placed starting at seed 1", () => {
        const kind = savedToolKind(spreadPad, {
            id: "s",
            name: "Scatter",
            kind: padTool.shape.id,
            kindVersion: padTool.shape.version,
            intervals: {},
            distribution: { mode: "spread", generator: 1 },
        });
        const placed = drawn(kind, 9, { x: 0, y: 0 }, { x: 40, y: 0 });
        expect(
            (placed.params as { distribution?: unknown }).distribution,
        ).toMatchObject({ mode: "spread", seed: 1 });
    });

    it("a saved outline is placed in Outline", () => {
        const kind = savedToolKind(padTool, {
            id: "o",
            name: "Ring",
            kind: padTool.shape.id,
            kindVersion: padTool.shape.version,
            intervals: {},
            distribution: { mode: "outline" },
        });
        const placed = drawn(kind, 8, { x: 0, y: 0 }, { x: 40, y: 0 });
        expect(distributionOf(padTool, placed.params, 8)?.mode).toBe("outline");
    });

    it("a mode the kind can't take, or an unknown one, leaves the kind's own fill", () => {
        for (const mode of ["spread", "hexagonal"]) {
            const kind = savedToolKind(padTool, {
                id: `x-${mode}`,
                name: "Odd",
                kind: padTool.shape.id,
                kindVersion: padTool.shape.version,
                intervals: {},
                distribution: { mode },
            });
            const placed = drawn(kind, 8, { x: 0, y: 0 }, { x: 40, y: 0 });
            expect(distributionOf(padTool, placed.params, 8)?.mode).toBe(
                "files",
            );
        }
    });

    it("names the mode in the suggested name", () => {
        const name = (t: ToolState) =>
            suggestedName(t.kind, t.params, t.spots, STEP);
        const plain = drawn(boxTool, 9, { x: 0, y: 0 }, { x: 40, y: 40 });
        expect(name(plain)).toBe("Box 2 apart");
        expect(name(filledBox(9, staggered(3)))).toBe("Box 2 apart, stagger ½");
        expect(
            name(
                filledBox(9, {
                    ...staggered(3),
                    stagger: [-1, 3],
                } as Distribution),
            ),
        ).toBe("Box 2 apart, stagger ⅓ left");
        const pad = drawn(padTool, 9, { x: 0, y: 0 }, { x: 40, y: 0 });
        const spread = {
            ...pad,
            kind: spreadPad,
            params: spreadPad.closed.withDistribution(
                pad.params as never,
                9,
                { mode: "spread", seed: 1, generator: 1 } as Distribution,
                env(),
            ),
        };
        expect(name(spread)).toBe("Spread 2 apart");
    });
});

describe("the library's notes with a distribution and description (#393)", () => {
    const tools = [
        { kind: boxTool, action: "shapeBlock" as const },
        { kind: padTool, action: "shapeBlock" as const },
    ];
    const base = {
        kind: boxTool.shape.id,
        kindVersion: 1,
        intervals: { across: 2, deep: 2 },
    };

    it("names the mode and stagger in the note", () => {
        const rows = savedShapeRows(
            [
                {
                    ...base,
                    id: "a",
                    name: "Staggered",
                    distribution: {
                        mode: "files",
                        layout: { family: "shortBack", byFile: false },
                        stagger: [1, 2],
                    },
                },
                {
                    ...base,
                    id: "b",
                    name: "Scatter",
                    kind: padTool.shape.id,
                    intervals: { gap: 2 },
                    distribution: { mode: "spread", generator: 1 },
                },
            ],
            [],
            tools,
        );
        expect(rows.map((r) => r.note)).toEqual([
            "Box · 2 apart, stagger ½",
            `${padTool.shape.label} · Spread 2 apart`,
        ]);
    });

    it("an old entry with no distribution reads as before", () => {
        const [row] = savedShapeRows(
            [{ ...base, id: "a", name: "Old" }],
            [],
            tools,
        );
        expect(row!.note).toBe("Box · 2 apart");
    });
});

describe("the user's library as stored (#393)", () => {
    const old = {
        id: "a",
        name: "Old box",
        kind: "block",
        kindVersion: 1,
        intervals: { across: 2, deep: 2 },
    };

    it("reads an entry saved before shapes kept a distribution, description or dates", () => {
        expect(SavedShapeSchema.parse(old)).toEqual(old);
    });

    it("keeps the new fields as saved", () => {
        const entry = {
            ...old,
            description: "Opener",
            distribution: {
                mode: "files",
                layout: { family: "shortBack", byFile: false },
                stagger: [1, 2],
            },
            createdAt: AT,
            updatedAt: AT,
        };
        expect(SavedShapeSchema.parse(entry)).toEqual(entry);
    });

    it("reads the distribution as a recipe's, dropping a mode this version doesn't know", () => {
        expect(
            SavedShapeSchema.parse({
                ...old,
                distribution: { mode: "files", layout: { family: "zigzag" } },
            }).distribution,
        ).toEqual({
            mode: "files",
            layout: { family: "shortBack", byFile: false },
            stagger: [0, 1],
        });
        expect(
            SavedShapeSchema.parse({ ...old, distribution: { mode: "swirl" } }),
        ).toEqual(old);
    });

    it("drops a field that doesn't read, keeping the entry", () => {
        expect(
            SavedShapeSchema.parse({
                ...old,
                distribution: { stagger: "lots" },
                description: 4,
            }),
        ).toEqual(old);
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Checkpoint, FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    addCheckpoint,
    addCheckpointSeries,
    checkFieldInvariants,
    moveCheckpoints,
    removeCheckpoints,
    runFieldEdit,
    runFieldEdits,
    updateCheckpoints,
    type FieldEditResult,
} from "..";

const college = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const withEndZones =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_WITH_END_ZONES;
const grid = FieldPropertiesTemplates.INDOOR_50x80_8to5;

const snapshot = (fp: FieldProperties) => JSON.stringify(fp);
const xAt = (fp: FieldProperties, steps: number) =>
    fp.xCheckpoints.filter((c) => c.stepsFromCenterFront === steps);
const yAt = (fp: FieldProperties, steps: number) =>
    fp.yCheckpoints.filter((c) => c.stepsFromCenterFront === steps);
const byName = (fp: FieldProperties, name: string, steps: number) =>
    fp.xCheckpoints.find(
        (c) => c.name === name && c.stepsFromCenterFront === steps,
    )!;
const ref = (c: Checkpoint) => ({ axis: c.axis, id: c.id });
const codes = (r: FieldEditResult) => r.diff.errors.map((e) => e.code);

/** Every edit result: dry run never mutates; a refusal returns the input and lists nothing */
function expectWellFormed(before: FieldProperties, result: FieldEditResult) {
    if (!result.diff.ok) {
        expect(result.next).toBe(before);
        expect(result.diff.errors.length).toBeGreaterThan(0);
        expect(result.diff.checkpoints.added).toEqual([]);
        expect(result.diff.settings).toEqual([]);
    }
    // JSON-serializable, with no undefined anywhere (toStrictEqual sees it; JSON drops it)
    expect(JSON.parse(JSON.stringify(result.diff))).toStrictEqual(result.diff);
}

function run<T>(
    fp: FieldProperties,
    edit: (fp: FieldProperties, args: T) => FieldEditResult,
    args: T,
) {
    const before = snapshot(fp);
    const result = edit(fp, args);
    // The dry run never writes to its input (or the shared template)
    expect(snapshot(fp)).toBe(before);
    expectWellFormed(fp, result);
    return result;
}

describe("addCheckpoint", () => {
    it("goes halfway into the largest gap nearest the center, never on the outermost line (B6)", () => {
        const { next, diff } = run(college, addCheckpoint, { axis: "x" });
        expect(diff.ok).toBe(true);
        expect(diff.checkpoints.added).toHaveLength(1);
        const added = diff.checkpoints.added[0]!;
        // Every gap is 8 steps: the one by the 50, on side 2 among the two
        expect(added.stepsFromCenterFront).toBe(4);
        expect(added).toMatchObject({
            axis: "x",
            name: "47.5 yard line",
            terseName: "47.5",
            visible: true,
            useAsReference: true,
            id: 21,
        });
        expect(added.fieldLabel).toBeUndefined();
        expect(xAt(next, 4)).toHaveLength(1);
        expect(diff.checkpoints.removed).toEqual([]);
        expect(diff.settings).toEqual([]);
        expect(diff.geometry).toMatchObject({
            sizeChanged: false,
            centerChanged: false,
            stepSizeChanged: false,
        });
    });

    it("prefers a larger gap over a nearer one (end zones)", () => {
        const { diff } = run(withEndZones, addCheckpoint, { axis: "x" });
        // 80 → 96 is the largest gap
        expect(diff.checkpoints.added[0]).toMatchObject({
            stepsFromCenterFront: 88,
            name: "end zone 5",
            terseName: "EZ5",
        });
    });

    it("adds Y lines in the largest gap, behind the front", () => {
        const { diff } = run(college, addCheckpoint, { axis: "y" });
        const added = diff.checkpoints.added[0]!;
        expect(added.stepsFromCenterFront).toBeLessThan(0);
        expect(yAt(college, added.stepsFromCenterFront)).toHaveLength(0);
        expect(added.name).toMatch(/steps from front$/);
    });

    it("mirrors: the twin goes on the other side with side names swapped", () => {
        const { next, diff } = run(college, addCheckpoint, {
            axis: "x",
            steps: -4,
            name: "S1 hash mark",
            shortName: "S1h",
            mirror: true,
        });
        expect(
            diff.checkpoints.added.map((c) => [
                c.stepsFromCenterFront,
                c.name,
                c.terseName,
            ]),
        ).toEqual([
            [-4, "S1 hash mark", "S1h"],
            [4, "S2 hash mark", "S2h"],
        ]);
        expect(checkFieldInvariants(next).map((i) => i.code)).toEqual([]);
    });

    it("names follow position when not given, with yard numbers on the tens", () => {
        const fp = run(college, removeCheckpoints, {
            ids: [ref(byName(college, "30 yard line", -32))],
            mirror: true,
        }).next;
        const { diff } = run(fp, addCheckpoint, {
            axis: "x",
            steps: 32,
            mirror: true,
        });
        expect(diff.checkpoints.added).toHaveLength(2);
        for (const c of diff.checkpoints.added)
            expect(c).toMatchObject({
                name: "30 yard line",
                terseName: "30",
                fieldLabel: "30",
            });
    });

    it("adds between two checkpoints", () => {
        const a = byName(college, "45 yard line", -8);
        const b = byName(college, "40 yard line", -16);
        const { diff } = run(college, addCheckpoint, {
            axis: "x",
            between: [ref(a), ref(b)],
        });
        expect(diff.checkpoints.added[0]).toMatchObject({
            stepsFromCenterFront: -12,
            name: "42.5 yard line",
        });
    });

    it("refuses a spot that already has a line, Y in front, and bad args", () => {
        expect(
            codes(run(college, addCheckpoint, { axis: "x", steps: 8 })),
        ).toEqual(["duplicate-position"]);
        expect(
            codes(run(college, addCheckpoint, { axis: "y", steps: 3 })),
        ).toEqual(["y-in-front"]);
        expect(
            codes(
                run(college, addCheckpoint, {
                    axis: "z" as never,
                }),
            ),
        ).toEqual(["invalid-args"]);
        expect(
            codes(run(college, addCheckpoint, { axis: "x", name: " " })),
        ).toEqual(["invalid-args"]);
        expect(
            codes(
                run(college, addCheckpoint, {
                    axis: "x",
                    between: [
                        { axis: "x", id: 0 },
                        { axis: "x", id: 999 },
                    ],
                }),
            ),
        ).toEqual(["not-found"]);
        // Bare ids, or refs on the other axis, aren't refs
        expect(
            codes(
                run(college, addCheckpoint, {
                    axis: "x",
                    between: [0, 1] as never,
                }),
            ),
        ).toEqual(["invalid-args"]);
    });

    it("warns that a one-sided outer line makes X asymmetric", () => {
        const { diff } = run(college, addCheckpoint, { axis: "x", steps: 90 });
        expect(diff.ok).toBe(true);
        expect(diff.warnings.map((w) => w.code)).toEqual([
            "asymmetric-x",
            "field-resized",
        ]);
        expect(diff.geometry.sizeChanged).toBe(true);
        expect(diff.geometry.centerChanged).toBe(true);
        expect(diff.geometry.after.maxXSteps).toBe(90);
    });

    it("keeps X symmetric when mirroring an outer line", () => {
        const { next, diff } = run(college, addCheckpoint, {
            axis: "x",
            steps: 90,
            mirror: true,
        });
        expect(diff.warnings.map((w) => w.code)).toEqual(["field-resized"]);
        expect(diff.geometry.after.minXSteps).toBe(-90);
        expect(checkFieldInvariants(next)).toEqual([]);
    });
});

describe("addCheckpointSeries", () => {
    it("adds plain checkpoints every N steps and skips positions that have one", () => {
        const { next, diff } = run(college, addCheckpointSeries, {
            axis: "x",
            every: 4,
            from: 0,
            to: 16,
            mirror: true,
        });
        // 0, 8, 16 exist; 4 and 12 on both sides are new
        expect(
            diff.checkpoints.added
                .map((c) => c.stepsFromCenterFront)
                .sort((a, b) => a - b),
        ).toEqual([-12, -4, 4, 12]);
        expect(diff.warnings.map((w) => w.code)).toEqual(["skipped-existing"]);
        expect(checkFieldInvariants(next)).toEqual([]);
        // Unique ids
        expect(new Set(next.xCheckpoints.map((c) => c.id)).size).toBe(
            next.xCheckpoints.length,
        );
    });

    it("runs backwards from the front on Y", () => {
        const { diff } = run(grid, addCheckpointSeries, {
            axis: "y",
            every: 2,
            from: -2,
            to: -10,
        });
        expect(diff.ok).toBe(true);
        expect(
            diff.checkpoints.added.map((c) => c.stepsFromCenterFront),
        ).toEqual([-10, -8, -6, -4, -2]);
    });

    it("refuses a zero interval and huge series", () => {
        expect(
            codes(
                run(college, addCheckpointSeries, {
                    axis: "x",
                    every: 0,
                    from: 0,
                    to: 3,
                }),
            ),
        ).toEqual(["invalid-args"]);
        expect(
            codes(
                run(college, addCheckpointSeries, {
                    axis: "x",
                    every: 0.01,
                    from: 0,
                    to: 80,
                }),
            ),
        ).toEqual(["too-many"]);
    });
});

describe("removeCheckpoints", () => {
    it("removes many in one edit, twins too with mirror", () => {
        const fives = college.xCheckpoints.filter(
            (c) =>
                c.stepsFromCenterFront < 0 && c.stepsFromCenterFront % 16 !== 0,
        );
        const { next, diff } = run(college, removeCheckpoints, {
            ids: fives.map(ref),
            mirror: true,
        });
        expect(diff.checkpoints.removed).toHaveLength(fives.length * 2);
        expect(
            next.xCheckpoints.every((c) => c.stepsFromCenterFront % 16 === 0),
        ).toBe(true);
        expect(diff.geometry.sizeChanged).toBe(false);
    });

    it("refuses to leave fewer than 2 on an axis", () => {
        const result = run(college, removeCheckpoints, {
            ids: college.yCheckpoints.slice(0, -1).map(ref),
        });
        expect(codes(result)).toEqual(["min-checkpoints"]);
        expect(result.diff.errors[0]!.axis).toBe("y");
    });

    it("refuses unknown ids", () => {
        expect(
            codes(
                run(college, removeCheckpoints, {
                    ids: [{ axis: "x", id: 999 }],
                }),
            ),
        ).toEqual(["not-found"]);
        expect(codes(run(college, removeCheckpoints, { ids: [] }))).toEqual([
            "invalid-args",
        ]);
    });
});

describe("moveCheckpoints", () => {
    it("moves by steps, snapped, and auto names follow (typed names stay)", () => {
        const c = byName(college, "45 yard line", -8);
        const { next, diff } = run(college, moveCheckpoints, {
            ids: [ref(c)],
            by: -4.0000001,
        });
        expect(diff.checkpoints.moved).toEqual([
            {
                axis: "x",
                id: c.id,
                name: "42.5 yard line",
                from: -8,
                to: -12,
            },
        ]);
        expect(diff.checkpoints.renamed).toHaveLength(1);
        expect(xAt(next, -12)[0]!.terseName).toBe("42.5");

        const named = run(college, updateCheckpoints, {
            ids: [ref(c)],
            patch: { name: "Mine" },
        }).next;
        const moved = run(named, moveCheckpoints, { ids: [ref(c)], by: -4 });
        expect(moved.diff.checkpoints.renamed).toEqual([]);
        expect(xAt(moved.next, -12)[0]!.name).toBe("Mine");
        // Opting out keeps automatic names too
        expect(
            run(college, moveCheckpoints, {
                ids: [ref(c)],
                by: -4,
                followNames: false,
            }).diff.checkpoints.renamed,
        ).toEqual([]);
    });

    it("with mirror the twin moves to the mirrored spot and X stays symmetric", () => {
        const outer = byName(college, "0 yard line", 80);
        const { next, diff } = run(college, moveCheckpoints, {
            ids: [ref(outer)],
            to: 84,
            mirror: true,
        });
        expect(
            diff.checkpoints.moved.map((m) => [m.from, m.to]).sort(),
        ).toEqual(
            [
                [-80, -84],
                [80, 84],
            ].sort(),
        );
        expect(checkFieldInvariants(next)).toEqual([]);
        expect(diff.geometry.sizeChanged).toBe(true);
        expect(diff.geometry.centerChanged).toBe(true);
    });

    it("lists a line and its twin once: the first listed leads", () => {
        const a = byName(college, "45 yard line", -8);
        const b = byName(college, "45 yard line", 8);
        const { next } = run(college, moveCheckpoints, {
            ids: [ref(a), ref(b)],
            by: 2,
            mirror: true,
        });
        expect(xAt(next, -6)).toHaveLength(1);
        expect(xAt(next, 6)).toHaveLength(1);
    });

    it("refuses Y in front, collisions, a moving center with mirror, and by+to", () => {
        const front = college.yCheckpoints.find(
            (c) => c.stepsFromCenterFront < 0,
        )!;
        expect(
            codes(run(college, moveCheckpoints, { ids: [ref(front)], to: 2 })),
        ).toEqual(["y-in-front"]);
        expect(
            codes(
                run(college, moveCheckpoints, {
                    ids: [ref(byName(college, "45 yard line", -8))],
                    by: -8,
                }),
            ),
        ).toEqual(["duplicate-position"]);
        expect(
            codes(
                run(college, moveCheckpoints, {
                    ids: [ref(byName(college, "50 yard line", 0))],
                    by: 2,
                    mirror: true,
                }),
            ),
        ).toEqual(["center-locked"]);
        expect(
            codes(
                run(college, moveCheckpoints, {
                    ids: [ref(front)],
                    by: 1,
                    to: -1,
                }),
            ),
        ).toEqual(["invalid-args"]);
    });

    it("a one-sided outer move is allowed with an asymmetry warning", () => {
        const { diff } = run(college, moveCheckpoints, {
            ids: [ref(byName(college, "0 yard line", 80))],
            to: 84,
        });
        expect(diff.ok).toBe(true);
        expect(diff.warnings.map((w) => w.code)).toEqual([
            "asymmetric-x",
            "field-resized",
        ]);
    });
});

describe("updateCheckpoints", () => {
    it("bulk edits in one diff, mirrored names swapped", () => {
        const a = byName(college, "45 yard line", -8);
        const { next, diff } = run(college, updateCheckpoints, {
            ids: [ref(a)],
            patch: { shortName: "S1 45", visible: false, fieldLabel: "45" },
            mirror: true,
        });
        expect(
            diff.checkpoints.renamed.map((r) => r.to.shortName).sort(),
        ).toEqual(["S1 45", "S2 45"]);
        expect(diff.checkpoints.changed).toHaveLength(2);
        expect(xAt(next, 8)[0]).toMatchObject({
            visible: false,
            fieldLabel: "45",
        });
        expect(diff.geometry.sizeChanged).toBe(false);
    });

    it("clears a field label with an empty string", () => {
        const forty = byName(college, "40 yard line", -16);
        const { next, diff } = run(college, updateCheckpoints, {
            ids: [ref(forty)],
            patch: { fieldLabel: "" },
        });
        expect(xAt(next, -16)[0]!.fieldLabel).toBeUndefined();
        expect(diff.checkpoints.changed[0]!.changes).toEqual([
            { key: "fieldLabel", from: "40", to: null },
        ]);
    });

    it("refuses empty names, unknown keys and moves", () => {
        const a = ref(college.xCheckpoints[0]!);
        expect(
            codes(
                run(college, updateCheckpoints, {
                    ids: [a],
                    patch: { name: "" },
                }),
            ),
        ).toEqual(["invalid-args"]);
        expect(
            codes(
                run(college, updateCheckpoints, {
                    ids: [a],
                    patch: { stepsFromCenterFront: 3 } as never,
                }),
            ),
        ).toEqual(["invalid-args"]);
    });

    it("is empty when nothing changes", () => {
        const a = college.xCheckpoints[0]!;
        const result = run(college, updateCheckpoints, {
            ids: [ref(a)],
            patch: { name: a.name },
        });
        expect(result.diff).toMatchObject({ ok: true, empty: true });
        expect(result.next).toBe(college);
    });
});

describe("runFieldEdit / runFieldEdits", () => {
    it("runs by name and refuses unknown names without throwing", () => {
        expect(
            runFieldEdit(college, {
                edit: "addCheckpoint",
                args: { axis: "x" },
            }).diff.checkpoints.added,
        ).toHaveLength(1);
        const unknown = runFieldEdit(college, { edit: "nope", args: {} });
        expect(unknown.diff.errors[0]!.code).toBe("unknown-edit");
        expect(unknown.next).toBe(college);
        const malformed = runFieldEdit(college, {
            edit: "moveCheckpoints",
            args: null,
        });
        expect(malformed.diff.ok).toBe(false);
    });

    it("chains edits into one diff, all or nothing", () => {
        const c = byName(college, "45 yard line", -8);
        const chained = runFieldEdits(college, [
            { edit: "moveCheckpoints", args: { ids: [ref(c)], to: -6 } },
            {
                edit: "updateCheckpoints",
                args: { ids: [ref(c)], patch: { name: "Moved" } },
            },
        ]);
        expect(chained.diff.edit).toBe("moveCheckpoints+updateCheckpoints");
        expect(chained.diff.checkpoints.moved).toHaveLength(1);
        expect(xAt(chained.next, -6)[0]!.name).toBe("Moved");

        const refused = runFieldEdits(college, [
            { edit: "moveCheckpoints", args: { ids: [ref(c)], to: -6 } },
            { edit: "removeCheckpoints", args: { ids: [] } },
        ]);
        expect(refused.diff.ok).toBe(false);
        expect(refused.next).toBe(college);
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    FieldProperties,
    type Checkpoint,
    type FieldPropertyArgs,
} from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    addCheckpoint,
    addCheckpointSeries,
    autoCheckpointNames,
    checkFieldInvariants,
    diffFieldProperties,
    ENGLISH_CHECKPOINT_NAMER,
    mirrorTwin,
    moveCheckpoints,
    removeCheckpoints,
    runFieldEdit,
    runFieldEdits,
    setFieldSettings,
    updateCheckpoints,
    type CheckpointNamer,
    type FieldEditResult,
} from "..";
import { fieldArgs } from "../fieldModel";

const college = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const grid = FieldPropertiesTemplates.INDOOR_50x80_8to5;

const ref = (c: Checkpoint) => ({ axis: c.axis, id: c.id });
const codes = (r: FieldEditResult) => r.diff.errors.map((e) => e.code);
const warningCodes = (r: FieldEditResult) => r.diff.warnings.map((w) => w.code);
const x = (fp: FieldProperties, steps: number) =>
    fp.xCheckpoints.filter(
        (c) => Math.abs(c.stepsFromCenterFront - steps) < 1e-9,
    );
const field = (patch: Partial<FieldPropertyArgs>) =>
    new FieldProperties({ ...fieldArgs(college), ...patch });

/** A copy of `c` at `steps` with a new id: a line stacked on another, as an old file can have */
const stackedCopy = (
    c: Checkpoint,
    id: number,
    steps = c.stepsFromCenterFront,
) => ({
    ...c,
    id,
    stepsFromCenterFront: steps,
});

describe("already-broken files: only new violations are refused", () => {
    const fortyFive = x(college, 8)[0]!;
    // Two X lines at 8, as an old file can have
    const stacked = field({
        xCheckpoints: [...college.xCheckpoints, stackedCopy(fortyFive, 100)],
    });

    it("the stacked pair is a violation the file already has", () => {
        expect(checkFieldInvariants(stacked).map((i) => i.code)).toEqual([
            "duplicate-position",
        ]);
    });

    it("refuses moving a third line onto the stacked pair (by and to)", () => {
        const forty = x(stacked, 16)[0]!;
        expect(
            codes(moveCheckpoints(stacked, { ids: [ref(forty)], to: 8 })),
        ).toEqual(["duplicate-position"]);
        expect(
            codes(moveCheckpoints(stacked, { ids: [ref(forty)], by: -8 })),
        ).toEqual(["duplicate-position"]);
        expect(codes(addCheckpoint(stacked, { axis: "x", steps: 8 }))).toEqual([
            "duplicate-position",
        ]);
    });

    it("refuses a group that grows through the invariant check too (a chain)", () => {
        const forty = x(stacked, 16)[0]!;
        // Each step alone is fine; together the third line ends up on the pair
        const result = runFieldEdits(stacked, [
            { edit: "moveCheckpoints", args: { ids: [ref(forty)], to: 9 } },
            { edit: "moveCheckpoints", args: { ids: [ref(forty)], by: -1 } },
        ]);
        expect(codes(result)).toEqual(["duplicate-position"]);
    });

    it("still edits the file: renames, other moves, and shrinking the stack", () => {
        expect(
            updateCheckpoints(stacked, {
                ids: [{ axis: "x", id: 100 }],
                patch: { name: "Mine" },
            }).diff.ok,
        ).toBe(true);
        const forty = x(stacked, 16)[0]!;
        expect(
            moveCheckpoints(stacked, { ids: [ref(forty)], by: 2 }).diff.ok,
        ).toBe(true);
        // Moving one of the pair away fixes it
        const away = moveCheckpoints(stacked, {
            ids: [{ axis: "x", id: 100 }],
            to: 10,
        });
        expect(away.diff.ok).toBe(true);
        expect(checkFieldInvariants(away.next)).toEqual([]);

        // Three stacked: removing one leaves a smaller stack, allowed
        const three = field({
            xCheckpoints: [
                ...stacked.xCheckpoints,
                stackedCopy(fortyFive, 101),
            ],
        });
        const removed = removeCheckpoints(three, {
            ids: [{ axis: "x", id: 101 }],
        });
        expect(removed.diff.ok).toBe(true);
        expect(removed.diff.checkpoints.removed.map((c) => c.id)).toEqual([
            101,
        ]);
    });

    it("pairs stacked lines one to one in a position diff (no collapse)", () => {
        const without = field({
            xCheckpoints: stacked.xCheckpoints.filter((c) => c.id !== 100),
        });
        const diff = diffFieldProperties("test", stacked, without, {
            match: "position",
        });
        expect(diff.checkpoints.removed.map((c) => c.id)).toEqual([100]);
        expect(diff.checkpoints.added).toEqual([]);
        expect(
            diffFieldProperties("test", stacked, stacked, {
                match: "position",
            }).empty,
        ).toBe(true);
    });
});

describe("positions: half the resolution is one spot", () => {
    it("float twins (-26.666667 and 26.67) are twins and one spot", () => {
        const fp = field({
            xCheckpoints: [
                ...college.xCheckpoints,
                stackedCopy(x(college, 8)[0]!, 100, -26.666667),
                stackedCopy(x(college, 8)[0]!, 101, 26.67),
            ],
        });
        const a = fp.xCheckpoints.find((c) => c.id === 100)!;
        expect(mirrorTwin(fp.xCheckpoints, a)?.id).toBe(101);
        const removed = removeCheckpoints(fp, { ids: [ref(a)], mirror: true });
        expect(
            removed.diff.checkpoints.removed.map((c) => c.id).sort(),
        ).toEqual([100, 101]);
        expect(codes(addCheckpoint(fp, { axis: "x", steps: 26.67 }))).toEqual([
            "duplicate-position",
        ]);
        expect(codes(addCheckpoint(fp, { axis: "x", steps: -26.67 }))).toEqual([
            "duplicate-position",
        ]);
    });

    it("picks a twin deterministically among stacked candidates: nearest, then lowest id", () => {
        const base = x(college, 8)[0]!;
        const cs = [
            stackedCopy(base, 7, -8),
            stackedCopy(base, 50, 8.004),
            stackedCopy(base, 40, 8.001),
            stackedCopy(base, 30, 8.001),
        ];
        expect(mirrorTwin(cs, cs[0]!)?.id).toBe(30);
        expect(mirrorTwin([...cs].reverse(), cs[0]!)?.id).toBe(30);
    });

    it("-0 is 0", () => {
        const front = college.yCheckpoints.find(
            (c) => c.stepsFromCenterFront === 0,
        )!;
        const fp = field({
            yCheckpoints: college.yCheckpoints.map((c) =>
                c.id === front.id ? { ...c, stepsFromCenterFront: -0 } : c,
            ),
        });
        expect(checkFieldInvariants(fp)).toEqual([]);
        expect(codes(addCheckpoint(fp, { axis: "y", steps: 0 }))).toEqual([
            "duplicate-position",
        ]);
        const fifty = x(college, 0)[0]!;
        const centered = field({
            xCheckpoints: college.xCheckpoints.map((c) =>
                c.id === fifty.id ? { ...c, stepsFromCenterFront: -0 } : c,
            ),
        });
        expect(
            mirrorTwin(
                centered.xCheckpoints,
                centered.xCheckpoints.find((c) => c.id === fifty.id)!,
            ),
        ).toBeUndefined();
        const added = addCheckpoint(college, { axis: "x", steps: -0.001 });
        expect(codes(added)).toEqual(["duplicate-position"]);
    });
});

describe("series never resize the field", () => {
    it("leaves out positions past the outermost lines, and says so", () => {
        const result = addCheckpointSeries(college, {
            axis: "x",
            every: 8,
            from: 0,
            to: 100,
            mirror: true,
        });
        expect(result.diff.ok).toBe(true);
        expect(result.diff.checkpoints.added).toEqual([]);
        expect(result.diff.geometry.sizeChanged).toBe(false);
        expect(result.diff.geometry.centerChanged).toBe(false);
        expect(warningCodes(result)).toEqual([
            "outside-field",
            "skipped-existing",
        ]);

        const y = addCheckpointSeries(college, {
            axis: "y",
            every: 20,
            from: 0,
            to: -200,
        });
        expect(y.diff.geometry.sizeChanged).toBe(false);
        expect(
            y.diff.checkpoints.added.every(
                (c) => c.stepsFromCenterFront >= -85.33,
            ),
        ).toBe(true);
        // In front of the front is outside too
        const front = addCheckpointSeries(college, {
            axis: "y",
            every: 1,
            from: 0,
            to: 3,
        });
        expect(front.diff.ok).toBe(true);
        expect(warningCodes(front)).toContain("outside-field");
        expect(front.diff.checkpoints.added).toEqual([]);
    });

    it("adds lines that aren't references unless asked", () => {
        const plain = addCheckpointSeries(college, {
            axis: "x",
            every: 4,
            from: 4,
            to: 12,
        });
        expect(plain.diff.checkpoints.added).toHaveLength(2);
        expect(
            plain.diff.checkpoints.added.every((c) => !c.useAsReference),
        ).toBe(true);
        const references = addCheckpointSeries(college, {
            axis: "x",
            every: 4,
            from: 4,
            to: 12,
            useAsReference: true,
        });
        expect(
            references.diff.checkpoints.added.every((c) => c.useAsReference),
        ).toBe(true);
    });

    it("allowGeometryChange: false refuses an edit that resizes the field", () => {
        const args = { edit: "addCheckpoint", args: { axis: "x", steps: 90 } };
        expect(warningCodes(runFieldEdit(college, args))).toContain(
            "field-resized",
        );
        const refused = runFieldEdit(college, args, {
            allowGeometryChange: false,
        });
        expect(codes(refused)).toEqual(["field-resized"]);
        expect(refused.next).toBe(college);
        // A chain that ends the same size is fine
        const chain = runFieldEdits(
            college,
            [
                args,
                {
                    edit: "moveCheckpoints",
                    args: { ids: [{ axis: "x", id: 21 }], to: 76 },
                },
            ],
            { allowGeometryChange: false },
        );
        expect(chain.diff.ok).toBe(true);
        expect(warningCodes(chain)).not.toContain("field-resized");
    });
});

describe("moved auto-named lines: names and yard numbers follow", () => {
    it("clears the label off a labelled line moved off the tens, and sets it on the tens", () => {
        const forty = x(college, -16)[0]!;
        const moved = moveCheckpoints(college, { ids: [ref(forty)], by: -4 });
        const c = moved.next.xCheckpoints.find((l) => l.id === forty.id)!;
        expect(c).toMatchObject({ name: "37.5 yard line", terseName: "37.5" });
        expect(c.fieldLabel).toBeUndefined();
        expect(moved.diff.checkpoints.changed[0]!.changes).toEqual([
            { key: "fieldLabel", from: "40", to: null },
        ]);

        // The 45 moved onto the 40's spot gets the 40's number
        const fortyFive = x(college, -8)[0]!;
        const gone = removeCheckpoints(college, { ids: [ref(forty)] }).next;
        const onTen = moveCheckpoints(gone, { ids: [ref(fortyFive)], to: -16 });
        expect(
            onTen.next.xCheckpoints.find((l) => l.id === fortyFive.id),
        ).toMatchObject({ name: "40 yard line", fieldLabel: "40" });
    });

    it("never touches a typed label (or typed names)", () => {
        const forty = x(college, -16)[0]!;
        const labelled = updateCheckpoints(college, {
            ids: [ref(forty)],
            patch: { fieldLabel: "XL" },
        }).next;
        const moved = moveCheckpoints(labelled, { ids: [ref(forty)], by: -4 });
        expect(
            moved.next.xCheckpoints.find((l) => l.id === forty.id),
        ).toMatchObject({ name: "37.5 yard line", fieldLabel: "XL" });
    });
});

describe("naming", () => {
    const loud: CheckpointNamer = {
        ...ENGLISH_CHECKPOINT_NAMER,
        yardLine: (yards) => `LINE ${yards}`,
        stepsFromFront: (steps) => `${steps} PACES`,
    };

    it("takes a namer for new lines and moved auto-named ones", () => {
        const added = addCheckpoint(
            college,
            { axis: "x", steps: 4 },
            { namer: loud },
        );
        expect(added.diff.checkpoints.added[0]!.name).toBe("LINE 47.5");
        // A line named in English is still automatic for another namer
        const fortyFive = x(college, -8)[0]!;
        const moved = moveCheckpoints(
            college,
            { ids: [ref(fortyFive)], by: -4 },
            { namer: loud },
        );
        expect(moved.diff.checkpoints.renamed[0]!.to).toEqual({
            name: "LINE 42.5",
            shortName: "42.5",
        });
        expect(
            runFieldEdit(
                college,
                { edit: "addCheckpoint", args: { axis: "y" } },
                { namer: loud },
            ).diff.checkpoints.added[0]!.name,
        ).toMatch(/ PACES$/);
    });

    it("names grid lines past the 0 line by side, never negative", () => {
        expect(autoCheckpointNames(grid, "x", 20)).toMatchObject({
            name: "0 line",
            terseName: "0",
        });
        expect(autoCheckpointNames(grid, "x", -24)).toEqual({
            name: "Side 1 24 steps from center",
            terseName: "S1 24",
        });
        expect(autoCheckpointNames(grid, "x", 24)).toEqual({
            name: "Side 2 24 steps from center",
            terseName: "S2 24",
        });
    });
});

describe("warnings for what an edit silently skipped", () => {
    it("says when a mirrored twin's spot is taken", () => {
        const oneSided = addCheckpoint(college, { axis: "x", steps: 4 }).next;
        const result = addCheckpoint(oneSided, {
            axis: "x",
            steps: -4,
            mirror: true,
        });
        expect(result.diff.checkpoints.added).toHaveLength(1);
        expect(warningCodes(result)).toEqual(["mirror-twin-skipped"]);
    });

    it("says mirror is ignored on Y for every edit that takes it", () => {
        const y = ref(college.yCheckpoints[1]!);
        expect(
            warningCodes(addCheckpoint(college, { axis: "y", mirror: true })),
        ).toEqual(["mirror-ignored"]);
        expect(
            warningCodes(
                updateCheckpoints(college, {
                    ids: [y],
                    patch: { name: "Front hash" },
                    mirror: true,
                }),
            ),
        ).toEqual(["mirror-ignored"]);
        expect(
            warningCodes(
                moveCheckpoints(college, { ids: [y], by: -1, mirror: true }),
            ),
        ).toEqual(["mirror-ignored"]);
        expect(
            warningCodes(
                removeCheckpoints(college, { ids: [y], mirror: true }),
            ),
        ).toEqual(["mirror-ignored"]);
    });
});

describe("plain data for agents", () => {
    it("trims names before storing them", () => {
        const added = addCheckpoint(college, {
            axis: "x",
            steps: 4,
            name: "  Mine  ",
            shortName: " M ",
        });
        expect(added.diff.checkpoints.added[0]).toMatchObject({
            name: "Mine",
            terseName: "M",
        });
        const a = college.xCheckpoints[0]!;
        const renamed = updateCheckpoints(college, {
            ids: [ref(a)],
            patch: { name: ` ${a.name} ` },
        });
        expect(renamed.diff.empty).toBe(true);
    });

    it("refuses a non-list for runFieldEdits without throwing", () => {
        const result = runFieldEdits(college, { edit: "x" } as never);
        expect(codes(result)).toEqual(["invalid-args"]);
        expect(result.next).toBe(college);
    });

    it("lists removed values as null, and whole diffs survive JSON exactly", () => {
        const result = setFieldSettings(college, {
            patch: {
                yardNumberCoordinates: { homeStepsFromFrontToInside: null },
            },
        });
        expect(result.diff.settings).toEqual([
            {
                key: "yardNumberCoordinates.homeStepsFromFrontToInside",
                from: college.yardNumberCoordinates.homeStepsFromFrontToInside,
                to: null,
            },
        ]);
        // Template lines carry fieldLabel: undefined; the diff's copies don't
        const removed = removeCheckpoints(college, {
            ids: [ref(x(college, -8)[0]!)],
        });
        for (const r of [result, removed])
            expect(JSON.parse(JSON.stringify(r.diff))).toStrictEqual(r.diff);
    });
});

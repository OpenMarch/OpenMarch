// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { runFieldEdits } from "@/field/edits";
import {
    dragSteps,
    fieldSizeSteps,
    dragOverRuler,
    lineLabel,
    lineReadout,
    lineScreen,
    linesInBox,
    linesOn,
    overRuler,
    RULER_PX,
    rulerPx,
    TOUCH_RULER_PX,
    stepsToField,
    fieldToSteps,
    toRef,
} from "../lines";
import {
    boxSelect,
    clickLine,
    everyOther,
    existingSelection,
    selectAll,
    selectionForEdit,
    selectionWithTwins,
    walkLines,
} from "../lineSelection";
import { evaluate, resolveTypedPosition } from "../positionInput";
import {
    baseTemplateOf,
    changesFromTemplate,
    resizeField,
} from "../fieldEditPlans";

const college = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const grid = FieldPropertiesTemplates.INDOOR_50x80_8to5;
/** 2 screen px per field unit, the field's top-left at (100, 50) */
const view = { zoom: 2, panX: 100, panY: 50 };

const x = (fp: FieldProperties, steps: number) =>
    fp.xCheckpoints.find((c) => c.stepsFromCenterFront === steps)!;
const y = (fp: FieldProperties, steps: number) =>
    fp.yCheckpoints.find((c) => c.stepsFromCenterFront === steps)!;
const terse = (
    fp: FieldProperties,
    cs: readonly { axis: "x" | "y"; id: number }[],
) =>
    cs.map((r) => {
        const c = (r.axis === "x" ? fp.xCheckpoints : fp.yCheckpoints).find(
            (c) => c.id === r.id,
        )!;
        return lineLabel(fp, c);
    });

describe("positions", () => {
    it("maps steps to field units and back", () => {
        expect(stepsToField(college, "x", 0)).toBe(
            college.centerFrontPoint.xPixels,
        );
        expect(stepsToField(college, "x", 8)).toBe(
            college.centerFrontPoint.xPixels + 8 * college.pixelsPerStep,
        );
        expect(
            fieldToSteps(college, "y", stepsToField(college, "y", -28)),
        ).toBe(-28);
    });

    it("puts a line on screen through the view", () => {
        const fifty = x(college, 0);
        expect(lineScreen(college, view, fifty)).toBe(
            100 + college.centerFrontPoint.xPixels * 2,
        );
    });

    it("measures the field's size in steps", () => {
        expect(fieldSizeSteps(college)).toEqual({ width: 160, depth: 85.33 });
    });
});

describe("linesInBox", () => {
    it("takes the lines that run through the box", () => {
        // A thin box across the field between the hashes, from the S1 5 to the S2 5
        const top = lineScreen(college, view, y(college, -32)) + 10;
        const box = {
            x0: lineScreen(college, view, x(college, -72)) - 1,
            x1: lineScreen(college, view, x(college, 72)) + 1,
            y0: top,
            y1: top + 10,
        };
        const lines = linesInBox(college, view, box);
        expect(lines.every((c) => c.axis === "x")).toBe(true);
        expect(lines).toHaveLength(19);
    });
});

describe("dragSteps", () => {
    const px = (axis: "x" | "y", steps: number) =>
        axis === "x"
            ? view.panX + stepsToField(college, "x", steps) * view.zoom
            : view.panY + stepsToField(college, "y", steps) * view.zoom;

    it("snaps to whole steps, or half with Fine", () => {
        expect(dragSteps(college, view, "x", px("x", 44.3))).toBe(44);
        expect(dragSteps(college, view, "x", px("x", -44.3), 0.5)).toBe(-44.5);
    });

    it("keeps Y at or behind the front", () => {
        expect(dragSteps(college, view, "y", px("y", 3))).toBe(0);
        expect(dragSteps(college, view, "y", px("y", -12.2))).toBe(-12);
    });

    it("knows the rulers", () => {
        expect(overRuler("x", { x: 400, y: RULER_PX - 1 })).toBe(true);
        expect(overRuler("x", { x: 10, y: RULER_PX + 5 })).toBe(false);
        expect(overRuler("y", { x: 10, y: 400 })).toBe(true);
    });

    it("makes the rulers a finger wide in the touch layout only", () => {
        expect(rulerPx(false)).toBe(RULER_PX);
        expect(rulerPx(true)).toBe(TOUCH_RULER_PX);
        expect(TOUCH_RULER_PX).toBeGreaterThanOrEqual(44);
    });

    it("lets a tab slide along its ruler: over the ruler only after leaving it", () => {
        // A tab dragged sideways stays in the strip: a move, never a delete
        let armed = false;
        for (const x of [100, 120, 160]) {
            const r = dragOverRuler("x", { x, y: 10 }, armed);
            expect(r.over).toBe(false);
            armed = r.armed;
        }
        // Out onto the field, then back in: now letting go deletes
        armed = dragOverRuler("x", { x: 160, y: 200 }, armed).armed;
        expect(dragOverRuler("x", { x: 160, y: 10 }, armed).over).toBe(true);
        // The same for a Y tab, down its ruler
        expect(dragOverRuler("y", { x: 10, y: 300 }, false).over).toBe(false);
        // A drag from the field is armed from the start
        expect(dragOverRuler("y", { x: 10, y: 300 }, true).over).toBe(true);
    });
});

describe("lineReadout", () => {
    it("names the side, the distance and the lines either side, toward the center first", () => {
        const r = lineReadout(college, "x", 44);
        expect(r).toMatchObject({
            side: "right",
            sideName: "S2",
            distance: 44,
        });
        expect(r.neighbors).toEqual([
            { distance: 4, label: "S2 25" },
            { distance: 4, label: "S2 20" },
        ]);
    });

    it("on side 1 too", () => {
        const r = lineReadout(college, "x", -6);
        expect(r.side).toBe("left");
        expect(r.neighbors).toEqual([
            { distance: 6, label: "50" },
            { distance: 2, label: "S1 45" },
        ]);
    });

    it("leaves out the lines being moved", () => {
        const fortyFive = x(college, 8);
        const r = lineReadout(college, "x", 9, [toRef(fortyFive)]);
        expect(r.neighbors.map((n) => n.label)).toEqual(["50", "S2 40"]);
    });

    it("measures Y behind the front", () => {
        const r = lineReadout(college, "y", -20);
        expect(r).toMatchObject({ side: null, distance: 20 });
        expect(r.neighbors[0]!.label).toBe(y(college, 0).terseName);
    });
});

describe("selection", () => {
    const fifty = toRef(x(college, 0));
    const fortyFive = toRef(x(college, 8));

    it("clicks pick one, Shift adds and takes away", () => {
        expect(clickLine([fifty], fortyFive, false)).toEqual([fortyFive]);
        expect(clickLine([fifty], fortyFive, true)).toEqual([fifty, fortyFive]);
        expect(clickLine([fifty, fortyFive], fifty, true)).toEqual([fortyFive]);
    });

    it("a box adds with Shift", () => {
        expect(
            boxSelect([fifty], [x(college, 8), x(college, 0)], true),
        ).toEqual([fifty, fortyFive]);
        expect(boxSelect([fifty], [x(college, 8)], false)).toEqual([fortyFive]);
    });

    it("Tab walks X side 1 to side 2, then Y front to back, and round", () => {
        const first = walkLines(college, [], 1);
        expect(terse(college, first)).toEqual(["S1 0"]);
        const lastX = toRef(x(college, 80));
        expect(walkLines(college, [lastX], 1)[0]!.axis).toBe("y");
        const all = selectAll(college);
        expect(walkLines(college, [all[all.length - 1]!], 1)).toEqual([all[0]]);
        expect(walkLines(college, [], -1)).toEqual([all[all.length - 1]]);
    });

    it("every other keeps the first: a box from S1 5 to S2 5 leaves the ten 5-yard lines", () => {
        const fromFiveToFive = linesOn(college, "x")
            .filter((c) => Math.abs(c.stepsFromCenterFront) <= 72)
            .map(toRef);
        const kept = everyOther(college, fromFiveToFive);
        expect(terse(college, kept)).toEqual([
            "S1 5",
            "S1 15",
            "S1 25",
            "S1 35",
            "S1 45",
            "S2 45",
            "S2 35",
            "S2 25",
            "S2 15",
            "S2 5",
        ]);
    });

    it("mirror reaches each line's twin, and edits get one of each pair", () => {
        const s1FortyFive = toRef(x(college, -8));
        expect(selectionWithTwins(college, [fortyFive], true)).toEqual([
            fortyFive,
            s1FortyFive,
        ]);
        expect(selectionWithTwins(college, [fortyFive], false)).toEqual([
            fortyFive,
        ]);
        expect(
            selectionForEdit(college, [fortyFive, s1FortyFive, fifty], true),
        ).toEqual([fortyFive, fifty]);
        expect(
            selectionForEdit(college, [fortyFive, s1FortyFive], false),
        ).toEqual([fortyFive, s1FortyFive]);
    });

    it("drops lines the field no longer has", () => {
        const gone = { axis: "x" as const, id: 999 };
        expect(existingSelection(college, [fifty, gone])).toEqual([fifty]);
        const same = [fifty];
        expect(existingSelection(college, same)).toBe(same);
    });
});

describe("resolveTypedPosition", () => {
    const football = { axis: "x" as const, football: true, current: 24 };

    it("reads steps, relative steps and arithmetic", () => {
        expect(resolveTypedPosition("20", football)).toBe(20);
        expect(resolveTypedPosition("+4", football)).toBe(28);
        expect(resolveTypedPosition("-4", football)).toBe(20);
        expect(resolveTypedPosition("85.33/2", football)).toBe(42.665);
        expect(resolveTypedPosition("(40 + 48) / 2", football)).toBe(44);
    });

    it("reads yard lines on a football field", () => {
        expect(resolveTypedPosition("47.5yd", football)).toBe(4);
        expect(resolveTypedPosition("50 yd", football)).toBe(0);
        expect(resolveTypedPosition("+2.5yd", football)).toBe(28);
        expect(
            resolveTypedPosition("47.5yd", { ...football, football: false }),
        ).toBeNull();
        expect(
            resolveTypedPosition("47.5yd", { ...football, axis: "y" }),
        ).toBeNull();
    });

    it("refuses what isn't a position", () => {
        for (const text of ["", "abc", "4/0", "-30", "4+", "1..2", "(4"])
            expect(resolveTypedPosition(text, football)).toBeNull();
        expect(evaluate("2*(3+1)")).toBe(8);
    });
});

describe("plans", () => {
    it("finds the template a field is based on, and counts changes from it", () => {
        expect(baseTemplateOf(college)?.id).toBe(
            "COLLEGE_FOOTBALL_FIELD_NO_END_ZONES",
        );
        expect(baseTemplateOf({ name: "My gym" })).toBeNull();
        expect(changesFromTemplate(college, college)).toBe(0);
        const edited = runFieldEdits(college, [
            {
                edit: "addCheckpoint",
                args: { axis: "x", steps: 4, mirror: true },
            },
            {
                edit: "setFieldSettings",
                args: { patch: { halfLineXInterval: 2 } },
            },
        ]).next;
        expect(changesFromTemplate(edited, college)).toBe(3);
    });

    it("a new width moves the outer lines, centered", () => {
        const plan = resizeField(college, "x", 176);
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        const next = runFieldEdits(college, plan.edits).next;
        expect(fieldSizeSteps(next).width).toBe(176);
        expect(next.xCheckpoints).toHaveLength(college.xCheckpoints.length);
        expect(x(next, 88)).toBeDefined();
        expect(x(next, -88)).toBeDefined();
    });

    it("a new depth moves the back line", () => {
        const plan = resizeField(grid, "y", 64);
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        const next = runFieldEdits(grid, plan.edits).next;
        expect(fieldSizeSteps(next).depth).toBe(64);
    });

    it("refuses a size that would put an inner line on or past the edge", () => {
        expect(resizeField(college, "x", 144)).toEqual({
            ok: false,
            reason: "too-small",
        });
        expect(resizeField(college, "x", 0)).toEqual({
            ok: false,
            reason: "invalid",
        });
        expect(resizeField(college, "x", 160)).toEqual({ ok: true, edits: [] });
    });
});

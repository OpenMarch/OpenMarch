import { describe, expect, it } from "vitest";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { runFieldEdits, type FieldEditIssue } from "@/field/edits";
import { ghostLines } from "../FieldEditOverlay";
import { xLinesAsymmetric } from "../panel/LinesList";
import { toRef } from "../lines";
import { warningsToShow } from "../useApplyFieldEdits";
import { settingsToShowImage } from "../useFieldImageActions";

/** Small rules from the #824 review: the drag's ghosts, the warnings, the image's switch-on */

const college = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const x = (steps: number) =>
    college.xCheckpoints.find((c) => c.stepsFromCenterFront === steps)!;

describe("ghostLines", () => {
    it("draws a mirrored pair picked whole as two ghosts, not four", () => {
        const ghosts = ghostLines(
            college,
            {
                kind: "move",
                axis: "x",
                steps: 20,
                overRuler: false,
                lines: [toRef(x(16)), toRef(x(-16))],
            },
            true,
        );
        expect(ghosts).toEqual([
            { axis: "x", steps: 20, twin: false },
            { axis: "x", steps: -20, twin: true },
        ]);
    });

    it("draws each line once with Mirror off", () => {
        const ghosts = ghostLines(
            college,
            {
                kind: "move",
                axis: "x",
                steps: 20,
                overRuler: false,
                lines: [toRef(x(16)), toRef(x(-16))],
            },
            false,
        );
        expect(ghosts.map((g) => g.steps)).toEqual([20, -12]);
    });
});

describe("warnings", () => {
    const issue = (code: FieldEditIssue["code"]): FieldEditIssue => ({
        code,
        message: code,
    });

    it("toasts what you may not have meant, not that Y lines don't mirror", () => {
        expect(
            warningsToShow([
                issue("mirror-ignored"),
                issue("asymmetric-x"),
                issue("skipped-existing"),
            ]).map((w) => w.code),
        ).toEqual(["asymmetric-x", "skipped-existing"]);
    });

    it("knows when the outermost X lines are different distances from the center", () => {
        expect(xLinesAsymmetric(college)).toBe(false);
        const moved = runFieldEdits(college, [
            {
                edit: "moveCheckpoints",
                args: { ids: [toRef(x(80))], to: 84, mirror: false },
            },
        ]);
        expect(moved.diff.warnings.map((w) => w.code)).toContain(
            "asymmetric-x",
        );
        expect(xLinesAsymmetric(moved.next)).toBe(true);
    });
});

describe("settingsToShowImage", () => {
    it("turns a hidden or see-through image on, and leaves a shown one alone", () => {
        expect(
            settingsToShowImage({
                showFieldImage: false,
                backgroundImageOpacity: 0,
            }),
        ).toEqual({ showFieldImage: true, backgroundImageOpacity: 1 });
        expect(
            settingsToShowImage({
                showFieldImage: false,
                backgroundImageOpacity: 0.4,
            }),
        ).toEqual({ showFieldImage: true });
        expect(
            settingsToShowImage({
                showFieldImage: true,
                backgroundImageOpacity: 0.4,
            }),
        ).toBeNull();
    });
});

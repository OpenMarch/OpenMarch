// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    applyTemplate,
    FIELD_TEMPLATE_IDS,
    setFieldSettings,
    updateCheckpoints,
    type FieldEditResult,
} from "..";

const college = FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
const codes = (r: FieldEditResult) => r.diff.errors.map((e) => e.code);

function dryRun(
    fp: FieldProperties,
    edit: (fp: FieldProperties, args: never) => FieldEditResult,
    args: unknown,
) {
    const before = JSON.stringify(fp);
    const result = edit(fp, args as never);
    expect(JSON.stringify(fp)).toBe(before);
    if (!result.diff.ok) expect(result.next).toBe(fp);
    return result;
}

/** College with a look of its own: a theme color, a hidden edge label, a side name */
const customized = dryRun(college, setFieldSettings, {
    patch: {
        theme: { background: { r: 10, g: 20, b: 30, a: 1 } },
        topLabelsVisible: false,
        sideDescriptions: { terseLeft: "AL" },
        isCustom: true,
    },
}).next;

describe("setFieldSettings", () => {
    it("merges nested settings and lists each change by dotted key", () => {
        const { diff } = dryRun(college, setFieldSettings, {
            patch: {
                theme: { background: { r: 10, g: 20, b: 30, a: 1 } },
                topLabelsVisible: false,
                sideDescriptions: { terseLeft: "AL" },
            },
        });
        expect(diff.ok).toBe(true);
        expect(diff.settings.map((s) => s.key).sort()).toEqual(
            [
                "sideDescriptions.terseLeft",
                "theme.background",
                "topLabelsVisible",
            ].sort(),
        );
        expect(customized.sideDescriptions.terseRight).toBe("S2");
        expect(customized.theme.primaryStroke).toEqual(
            college.theme.primaryStroke,
        );
        expect(diff.geometry.sizeChanged).toBe(false);
    });

    it("says a step size change changes the geometry", () => {
        const { diff } = dryRun(college, setFieldSettings, {
            patch: { stepSizeInches: 30 },
        });
        expect(diff.geometry).toMatchObject({
            stepSizeChanged: true,
            // Same steps, more pixels: marchers stored in pixels shift
            sizeChanged: false,
            centerChanged: true,
        });
    });

    it("removes a yard-number value with null", () => {
        const { next } = dryRun(college, setFieldSettings, {
            patch: {
                yardNumberCoordinates: { homeStepsFromFrontToInside: null },
            },
        });
        expect("homeStepsFromFrontToInside" in next.yardNumberCoordinates).toBe(
            false,
        );
    });

    it("refuses bad values, unknown keys and checkpoints", () => {
        const refused = (patch: unknown) =>
            codes(dryRun(college, setFieldSettings, { patch }));
        expect(refused({ stepSizeInches: 0 })).toEqual(["invalid-args"]);
        expect(refused({ backgroundImageOpacity: 2 })).toEqual([
            "invalid-args",
        ]);
        expect(refused({ measurementSystem: "cubits" })).toEqual([
            "invalid-args",
        ]);
        expect(refused({ theme: { background: "red" } })).toEqual([
            "invalid-args",
        ]);
        expect(refused({ sideDescriptions: { terseLeft: "" } })).toEqual([
            "invalid-args",
        ]);
        expect(refused({ xCheckpoints: [] })).toEqual(["unknown-setting"]);
        expect(refused(null)).toEqual(["invalid-args"]);
    });
});

describe("applyTemplate", () => {
    it("keep none: everything comes from the template, and the diff says what was replaced", () => {
        const { next, diff } = dryRun(customized, applyTemplate, {
            template: "HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES",
            keep: "none",
        });
        expect(diff.ok).toBe(true);
        expect(diff.kept).toEqual([]);
        expect(next.theme).toEqual(
            FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES
                .theme,
        );
        expect(diff.settings.map((s) => s.key)).toEqual(
            expect.arrayContaining([
                "name",
                "theme.background",
                "topLabelsVisible",
                "isCustom",
            ]),
        );
        // Paired by position: the yard lines are the same, only the hashes differ
        expect(diff.checkpoints.moved).toEqual([]);
        expect(
            diff.checkpoints.added.every((c) => c.axis === "y") &&
                diff.checkpoints.removed.every((c) => c.axis === "y"),
        ).toBe(true);
        expect(diff.checkpoints.added.length).toBeGreaterThan(0);
    });

    it("keep look (default): template lines, the user's look kept and listed (B11)", () => {
        const { next, diff } = dryRun(customized, applyTemplate, {
            template: "INDOOR_50x80_8to5",
        });
        expect(diff.kept!.sort()).toEqual(
            [
                "sideDescriptions",
                "theme",
                "topLabelsVisible",
                // Football templates and grid templates differ here too
                ...["imageFillOrFit", "showFieldImage"].filter(
                    (k) =>
                        JSON.stringify(
                            customized[k as keyof FieldProperties],
                        ) !==
                        JSON.stringify(
                            FieldPropertiesTemplates.INDOOR_50x80_8to5[
                                k as keyof FieldProperties
                            ],
                        ),
                ),
            ].sort(),
        );
        expect(next.theme.background).toEqual({ r: 10, g: 20, b: 30, a: 1 });
        expect(next.topLabelsVisible).toBe(false);
        expect(next.xCheckpoints).toEqual(
            FieldPropertiesTemplates.INDOOR_50x80_8to5.xCheckpoints,
        );
        expect(next.name).toBe(FieldPropertiesTemplates.INDOOR_50x80_8to5.name);
        expect(next.isCustom).toBe(false);
        expect(diff.geometry.sizeChanged).toBe(true);
        expect(diff.geometry.centerChanged).toBe(true);
    });

    it("keep lines: the user's lines with the template's look", () => {
        const renamed = updateCheckpoints(customized, {
            ids: [{ axis: "x", id: 0 }],
            patch: { name: "Goal" },
        }).next;
        const { next, diff } = dryRun(renamed, applyTemplate, {
            template: "COLLEGE_FOOTBALL_FIELD_NO_END_ZONES",
            keep: "lines",
        });
        expect(diff.kept).toEqual(["xCheckpoints"]);
        expect(next.xCheckpoints).toEqual(renamed.xCheckpoints);
        expect(next.theme).toEqual(college.theme);
        expect(next.isCustom).toBe(true);
        expect(diff.geometry.sizeChanged).toBe(false);
    });

    it("never changes the template it copies", () => {
        const before = JSON.stringify(FieldPropertiesTemplates);
        const { next } = applyTemplate(customized, {
            template: "PRO_FOOTBALL_FIELD_WITH_END_ZONES",
            keep: "none",
        });
        (next.xCheckpoints[0] as { name: string }).name = "mutated";
        expect(JSON.stringify(FieldPropertiesTemplates)).toBe(before);
    });

    it("refuses unknown templates and keeps, listing the valid ones", () => {
        const unknown = dryRun(college, applyTemplate, { template: "MOON" });
        expect(codes(unknown)).toEqual(["unknown-template"]);
        expect(unknown.diff.errors[0]!.message).toContain(
            FIELD_TEMPLATE_IDS[0],
        );
        expect(
            codes(
                dryRun(college, applyTemplate, {
                    template: "INDOOR_50x80_8to5",
                    keep: "everything",
                }),
            ),
        ).toEqual(["invalid-args"]);
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    fieldReferenceLines,
    planField2d,
    planFieldImage,
    textCenterY,
} from "../fieldPlan";
import { yardNumberPath } from "../fieldNumbers";

const base: FieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
const withImage = (
    imageFillOrFit: "fit" | "fill",
    overrides: Partial<FieldProperties> = {},
) =>
    new FieldProperties({
        ...base,
        showFieldImage: true,
        imageFillOrFit,
        backgroundImageOpacity: 0.4,
        ...overrides,
    });

describe("planFieldImage", () => {
    const { width, height } = base;
    // Wider than the field
    const wide = { width: width * 2, height };

    it("fits a wide image to the field's width, centered vertically", () => {
        expect(planFieldImage(withImage("fit"), wide)).toEqual({
            x: 0,
            y: height / 4,
            width,
            height: height / 2,
            opacity: 0.4,
        });
    });

    it("fills the field with a wide image, overflowing the sides", () => {
        expect(planFieldImage(withImage("fill"), wide)).toEqual({
            x: -width / 2,
            y: 0,
            width: width * 2,
            height,
            opacity: 0.4,
        });
    });

    // Taller than the field
    const tall = { width, height: height * 2 };

    it("fits a tall image to the field's height, centered horizontally", () => {
        expect(planFieldImage(withImage("fit"), tall)).toEqual({
            x: width / 4,
            y: 0,
            width: width / 2,
            height,
            opacity: 0.4,
        });
    });

    it("fills the field with a tall image, overflowing top and bottom", () => {
        expect(planFieldImage(withImage("fill"), tall)).toEqual({
            x: 0,
            y: -height / 2,
            width,
            height: height * 2,
            opacity: 0.4,
        });
    });

    it("stretches an image whose size is unknown over the field", () => {
        expect(
            planFieldImage(withImage("fit"), { width: 0, height: 0 }),
        ).toEqual({ x: 0, y: 0, width, height, opacity: 0.4 });
    });

    it("draws nothing when the field hides its image or there's none", () => {
        expect(
            planFieldImage(withImage("fit", { showFieldImage: false }), wide),
        ).toBeNull();
        expect(planFieldImage(withImage("fit"), null)).toBeNull();
    });
});

describe("planField2d", () => {
    it("honors the grid and half line settings", () => {
        const roles = (gridLines: boolean, halfLines: boolean) =>
            new Set(
                planField2d(base, { gridLines, halfLines }).lines.map(
                    (l) => l.role,
                ),
            );
        expect(roles(true, true)).toEqual(
            new Set(["grid", "halfLine", "yardLine", "hash"]),
        );
        expect(roles(false, false)).toEqual(new Set(["yardLine", "hash"]));
    });
});

describe("planField2d yard numbers", () => {
    const options = { gridLines: false, halfLines: false };
    const { pixelsPerStep, centerFrontPoint } = base;
    const stepsToY = (steps: number) =>
        centerFrontPoint.yPixels - steps * pixelsPerStep;
    const labeled = base.xCheckpoints.filter((c) => c.fieldLabel);
    const lineX = (c: (typeof labeled)[number]) =>
        centerFrontPoint.xPixels + c.stepsFromCenterFront * pixelsPerStep;
    const ys = (path: string) =>
        (path.match(/-?\d+(\.\d+)?/g) ?? [])
            .map(Number)
            .filter((_, i) => i % 2 === 1);
    const coords = base.yardNumberCoordinates;

    it("paints every labeled yard line's number as a shape, on both sides, in each side's band", () => {
        const plan = planField2d(base, options);
        expect(plan.texts.filter((t) => t.role === "yardNumber")).toEqual([]);
        expect(plan.shapes).toHaveLength(labeled.length * 2);
        const home = [
            stepsToY(coords.homeStepsFromFrontToInside!),
            stepsToY(coords.homeStepsFromFrontToOutside!),
        ];
        const away = [
            stepsToY(coords.awayStepsFromFrontToOutside!),
            stepsToY(coords.awayStepsFromFrontToInside!),
        ];
        const inBand = (path: string, [top, bottom]: number[]) =>
            ys(path).every((y) => y >= top! - 1e-3 && y <= bottom! + 1e-3);
        const homeShapes = plan.shapes.filter((s) => inBand(s.path, home));
        const awayShapes = plan.shapes.filter((s) => inBand(s.path, away));
        expect(homeShapes).toHaveLength(labeled.length);
        expect(awayShapes).toHaveLength(labeled.length);
        for (const shape of plan.shapes)
            expect(shape.color).toEqual(base.theme.fieldLabel);
    });

    it("points the arrows at the nearer goal, with none at the 50", () => {
        const plan = planField2d(base, options);
        const [insideY, outsideY] = [
            stepsToY(coords.homeStepsFromFrontToInside!),
            stepsToY(coords.homeStepsFromFrontToOutside!),
        ];
        for (const c of labeled) {
            const direction =
                c.stepsFromCenterFront < 0
                    ? -1
                    : c.stepsFromCenterFront > 0
                      ? 1
                      : 0;
            expect(plan.shapes.map((s) => s.path)).toContain(
                yardNumberPath({
                    label: c.fieldLabel!,
                    lineX: lineX(c),
                    insideY,
                    outsideY,
                    arrowDirection: direction,
                }),
            );
        }
        expect(labeled.some((c) => c.stepsFromCenterFront === 0)).toBe(true);
    });

    it("paints only the side that has its coordinates, away without home", () => {
        const awayOnly = new FieldProperties({
            ...base,
            yardNumberCoordinates: {
                awayStepsFromFrontToInside: coords.awayStepsFromFrontToInside,
                awayStepsFromFrontToOutside: coords.awayStepsFromFrontToOutside,
            },
        });
        const plan = planField2d(awayOnly, options);
        expect(plan.shapes).toHaveLength(labeled.length);
        const top = stepsToY(coords.awayStepsFromFrontToOutside!);
        const bottom = stepsToY(coords.awayStepsFromFrontToInside!);
        for (const shape of plan.shapes)
            for (const y of ys(shape.path)) {
                expect(y).toBeGreaterThanOrEqual(top - 1e-3);
                expect(y).toBeLessThanOrEqual(bottom + 1e-3);
            }
    });

    it("writes a label that isn't digits as text, the away side's turned about its center", () => {
        const withGoal = new FieldProperties({
            ...base,
            xCheckpoints: base.xCheckpoints.map((c) =>
                c.fieldLabel === "10" ? { ...c, fieldLabel: "G" } : c,
            ),
        });
        const plan = planField2d(withGoal, options);
        const texts = plan.texts.filter((t) => t.role === "yardNumber");
        const goals = labeled.filter((c) => c.fieldLabel === "10");
        expect(texts).toHaveLength(goals.length * 2);
        expect(plan.shapes).toHaveLength((labeled.length - goals.length) * 2);
        for (const t of texts) {
            expect(t.text).toBe("G");
            expect(t.anchor).toBe("middle");
            expect(goals.map(lineX)).toContain(t.x);
            if (t.flipped) expect(textCenterY(t)).toBeLessThan(base.height / 2);
            else expect(textCenterY(t)).toBeGreaterThan(base.height / 2);
        }
        expect(texts.filter((t) => t.flipped)).toHaveLength(goals.length);
    });

    it("paints none when neither side has both coordinates", () => {
        const none = new FieldProperties({
            ...base,
            yardNumberCoordinates: {
                homeStepsFromFrontToInside: coords.homeStepsFromFrontToInside,
                awayStepsFromFrontToOutside: coords.awayStepsFromFrontToOutside,
            },
        });
        const plan = planField2d(none, options);
        expect(plan.shapes).toEqual([]);
        expect(plan.texts.filter((t) => t.role === "yardNumber")).toEqual([]);
    });
});

describe("fieldReferenceLines (#425)", () => {
    const steps = (
        fp: FieldProperties,
        values: readonly number[],
        axis: "x" | "y",
    ) =>
        values
            .map(
                (v) =>
                    (v -
                        (axis === "x"
                            ? fp.centerFrontPoint.xPixels
                            : fp.centerFrontPoint.yPixels)) /
                    fp.pixelsPerStep,
            )
            .map((v) => Math.round(v * 1000) / 1000)
            .sort((a, b) => a - b);

    it("has the yard lines and, front to back, the reference checkpoints, invisible ones too", () => {
        const lines = fieldReferenceLines(base);
        const x = steps(base, lines.x, "x");
        for (const yardLine of [-80, -8, 0, 8, 80])
            expect(x).toContain(yardLine);
        const y = steps(base, lines.y, "y");
        // Front sideline (invisible), the hashes and the grid back sideline; not the real one
        for (const line of [0, -28, -56, -85]) expect(y).toContain(line);
        expect(y).not.toContain(-85.33);
    });

    it("leaves out checkpoints that aren't references", () => {
        const college =
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
        const y = steps(college, fieldReferenceLines(college).y, "y");
        expect(y).toContain(-52);
        expect(y).not.toContain(-53.33);
    });

    it("adds half lines when the field sets them, once each", () => {
        const custom = new FieldProperties({
            ...base,
            halfLineXInterval: 4,
            halfLineYInterval: 4,
        });
        const lines = fieldReferenceLines(custom);
        const x = steps(custom, lines.x, "x");
        expect(x).toContain(4);
        expect(x).toContain(-12);
        expect(x.filter((v) => v === 8)).toHaveLength(1);
        expect(steps(custom, lines.y, "y")).toContain(-4);
        const none = fieldReferenceLines(
            new FieldProperties({
                ...base,
                halfLineXInterval: 0,
                halfLineYInterval: 0,
            }),
        );
        expect(steps(base, none.x, "x")).not.toContain(4);
    });
});

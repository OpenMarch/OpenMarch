import { describe, it, expect } from "vitest";
import { FieldProperties } from "@openmarch/core";
import {
    deriveMarcherFromLabel,
    fieldGeometry,
    sourcePointToPixels,
    type FieldGeometry,
} from "../drillTransform";
import type { DrillFieldBorder } from "@openmarch/drill-interop";

describe("deriveMarcherFromLabel", () => {
    it("splits a label into an alphabetic prefix and numeric order", () => {
        const trumpet = deriveMarcherFromLabel("T3");
        expect(trumpet.drill_prefix).toBe("T");
        expect(trumpet.drill_order).toBe(3);
        expect(trumpet.section).toBe("Trumpet");
    });

    it("maps a color guard label to its section", () => {
        const guard = deriveMarcherFromLabel("G10");
        expect(guard.drill_prefix).toBe("G");
        expect(guard.drill_order).toBe(10);
        expect(guard.section).toBe("Color Guard");
    });

    it("maps a truly unknown prefix to the Other section", () => {
        const derived = deriveMarcherFromLabel("ZZ5");
        expect(derived.drill_prefix).toBe("ZZ");
        expect(derived.section).toBe("Other");
    });

    it("handles labels without a number", () => {
        const derived = deriveMarcherFromLabel("X");
        expect(derived.drill_prefix).toBe("X");
        expect(derived.drill_order).toBe(0);
    });

    it("maps TS labels to tenor sax", () => {
        const derived = deriveMarcherFromLabel("TS1");
        expect(derived.drill_prefix).toBe("TS");
        expect(derived.drill_order).toBe(1);
        expect(derived.section).toBe("Tenor Sax");
    });

    it("maps BS labels to bass drum", () => {
        const derived = deriveMarcherFromLabel("BS1");
        expect(derived.section).toBe("Bass Drum");
    });
});

describe("sourcePointToPixels", () => {
    const border: DrillFieldBorder = {
        minX: -50,
        maxX: 50,
        minY: -26.25,
        maxY: 26.25,
    };
    const field: FieldGeometry = {
        pixelsPerStep: 10,
        centerFrontPoint: { xPixels: 500, yPixels: 420 },
        maxXSteps: 80,
        frontYSteps: 0,
        backYSteps: -84,
    };

    it("derives signed back sideline steps from unsigned y checkpoints", () => {
        const geometry = fieldGeometry(
            new FieldProperties({
                name: "Test Field",
                xCheckpoints: [
                    {
                        id: 1,
                        name: "50",
                        axis: "x",
                        terseName: "50",
                        stepsFromCenterFront: 80,
                        useAsReference: true,
                        visible: true,
                    },
                ],
                yCheckpoints: [
                    {
                        id: 1,
                        name: "Front Sideline",
                        axis: "y",
                        terseName: "FSL",
                        stepsFromCenterFront: 0,
                        useAsReference: true,
                        visible: true,
                    },
                    {
                        id: 2,
                        name: "Back Sideline",
                        axis: "y",
                        terseName: "BSL",
                        stepsFromCenterFront: 84,
                        useAsReference: true,
                        visible: true,
                    },
                ],
            }),
        );
        expect(geometry.frontYSteps).toBe(0);
        expect(geometry.backYSteps).toBe(-84);
    });

    it("places the front-center source point on the center front point", () => {
        const p = sourcePointToPixels({ x: 0, y: border.minY }, border, field);
        expect(p.x).toBeCloseTo(500, 5);
        expect(p.y).toBeCloseTo(420, 5);
    });

    it("maps the far corner to the field extents", () => {
        const p = sourcePointToPixels(
            { x: border.maxX, y: border.maxY },
            border,
            field,
        );
        expect(p.x).toBeCloseTo(1300, 5);
        expect(p.y).toBeCloseTo(-420, 5);
    });

    it("maps mid-field to half depth above the front sideline", () => {
        const p = sourcePointToPixels({ x: 0, y: 0 }, border, field);
        expect(p.x).toBeCloseTo(500, 5);
        expect(p.y).toBeCloseTo(0, 5);
    });
});

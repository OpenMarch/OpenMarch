import { legacyMockNCAAFieldProperties } from "@/__mocks__/globalMocks";
import { FieldProperties } from "@openmarch/core";
import { StepSize } from "../StepSize";
import { describe, expect, it } from "vitest";

describe("StepSize", () => {
    it("should be able to create a step size object", () => {
        const stepSize = new StepSize({
            marcher_id: 1,
            // on the 50, on the front hash
            startingX: 900,
            startingY: 644.96,
            // on the 50, 8 in front of the front hash
            endingX: 900,
            endingY: 734.96,
            counts: 8,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSize).toBeInstanceOf(StepSize);
        expect(stepSize.marcher_id).toBe(1);
        expect(stepSize.displayString()).toBe("8 to 5");
        expect(stepSize.stepsPerFiveYards).toBe(8);
    });

    it("should correctly identify a 16 to 5 step size", () => {
        const stepSize = new StepSize({
            marcher_id: 2,
            // on the 50, on the front hash
            startingX: 900,
            startingY: 644.96,
            // Splitting the 45 and 50 on S1, on the front hash
            endingX: 945,
            endingY: 644.96,
            counts: 8,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSize.displayString()).toBe("16 to 5");
        expect(stepSize.stepsPerFiveYards).toBe(16);
    });

    it("should correctly identify a diagonal step size", () => {
        const stepSize = new StepSize({
            marcher_id: 3,
            // on the 50, on the front hash
            startingX: 900,
            startingY: 644.96,
            // Splitting the 45 and 50 on S1, 3 behind the front hash
            endingX: 945,
            endingY: 611.21,
            counts: 8,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSize.displayString()).toBe("12.8 to 5");
        expect(stepSize.stepsPerFiveYards).toBe(12.8);
    });

    it("should correctly handle a 6 to 5 grid", () => {
        const sixToFiveGrid = new FieldProperties({
            ...legacyMockNCAAFieldProperties,
            stepSizeInches: 30,
        });
        const stepSize = new StepSize({
            marcher_id: 3,
            // on the 50, on the front hash
            startingX: 900,
            startingY: 644.96,
            // on the 50, 8 in front of the front hash (in 8 to 5 spacing, which is 6 steps in 6 to 5 grid)
            endingX: 900,
            endingY: 734.96,
            counts: 8,
            fieldProperties: sixToFiveGrid,
        });

        expect(stepSize.displayString()).toBe("8 to 5");
        expect(stepSize.stepsPerFiveYards).toBe(8);
    });

    it("should show 'Tiny' for step sizes smaller than 64 to 5", () => {
        const stepSize = new StepSize({
            marcher_id: 3,
            // on the 50, on the front hash
            startingX: 900,
            startingY: 644.96,
            // one hundredth of a pixel away
            endingX: 900,
            endingY: 644.97,
            counts: 8,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSize.displayString()).toBe("Tiny");
        expect(stepSize.stepsPerFiveYards).toBe(72000.00000006548);
    });

    it("should handle when counts are 0", () => {
        const stepSize = new StepSize({
            marcher_id: 3,
            // on the 50, on the front hash
            startingX: 900,
            startingY: 644.96,
            // Splitting the 45 and 50 on S1, 3 behind the front hash
            endingX: 945,
            endingY: 611.21,
            counts: 0,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSize.displayString()).toBe("Undefined");
        expect(stepSize.stepsPerFiveYards).toBeNaN();
    });

    it("should handle when the performer doesn't move", () => {
        const stepSize = new StepSize({
            marcher_id: 3,
            // on the 50, on the front hash
            startingX: 900,
            startingY: 644.96,
            // on the 50, on the front hash
            endingX: 900,
            endingY: 644.96,
            counts: 8,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSize.displayString()).toBe("Hold");
        expect(stepSize.stepsPerFiveYards).toBe(Infinity);
    });

    describe("inchesPerStep and exceedsThreshold", () => {
        // 8-to-5 move: 22.5 inches per step
        const eightToFive = new StepSize({
            marcher_id: 1,
            startingX: 900,
            startingY: 644.96,
            endingX: 900,
            endingY: 734.96,
            counts: 8,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        it("computes inches per step", () => {
            expect(eightToFive.inchesPerStep).toBeCloseTo(22.5);
        });

        it("is not over a 45-inch threshold for a normal step", () => {
            expect(eightToFive.exceedsThreshold(45)).toBe(false);
        });

        it("is over threshold for a very large step", () => {
            // 2 counts across 5 yards worth of pixels => ~90 in/step
            const huge = new StepSize({
                marcher_id: 1,
                startingX: 900,
                startingY: 644.96,
                endingX: 900,
                endingY: 824.96, // 16 steps of vertical travel
                counts: 2,
                fieldProperties: legacyMockNCAAFieldProperties,
            });
            expect(huge.inchesPerStep).toBeGreaterThan(45);
            expect(huge.exceedsThreshold(45)).toBe(true);
        });

        it("never warns for a hold (no movement)", () => {
            const hold = new StepSize({
                marcher_id: 1,
                startingX: 900,
                startingY: 644.96,
                endingX: 900,
                endingY: 644.96,
                counts: 8,
                fieldProperties: legacyMockNCAAFieldProperties,
            });
            expect(hold.inchesPerStep).toBe(0);
            expect(hold.exceedsThreshold(45)).toBe(false);
        });

        it("never warns for an undefined step (0 counts)", () => {
            const undef = new StepSize({
                marcher_id: 1,
                startingX: 900,
                startingY: 644.96,
                endingX: 945,
                endingY: 644.96,
                counts: 0,
                fieldProperties: legacyMockNCAAFieldProperties,
            });
            expect(undef.exceedsThreshold(45)).toBe(false);
        });

        it("does not warn at or within the 0.5in tolerance of the threshold", () => {
            // eightToFive is a 22.5in step
            expect(eightToFive.exceedsThreshold(22.5)).toBe(false); // exactly at threshold
            expect(eightToFive.exceedsThreshold(22.2)).toBe(false); // 0.3in over, inside the buffer
        });

        it("warns once a step is more than 0.5in over the threshold", () => {
            // 21.5in threshold puts the 22.5in step 1.0in over, past the buffer
            expect(eightToFive.exceedsThreshold(21.5)).toBe(true);
        });

        it("never warns when the threshold is 0, even for an enormous step", () => {
            const huge = new StepSize({
                marcher_id: 1,
                startingX: 900,
                startingY: 644.96,
                endingX: 900,
                endingY: 824.96,
                counts: 2,
                fieldProperties: legacyMockNCAAFieldProperties,
            });
            expect(huge.inchesPerStep).toBeGreaterThan(45);
            expect(huge.exceedsThreshold(0)).toBe(false);
            expect(eightToFive.exceedsThreshold(0)).toBe(false);
        });

        it("never warns for a negative threshold", () => {
            expect(eightToFive.exceedsThreshold(-10)).toBe(false);
        });
    });
});

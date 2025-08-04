import { legacyMockNCAAFieldProperties } from "@/__mocks__/globalMocks";
import { FieldProperties } from "@openmarch/core";
import Marcher from "../Marcher";
import MarcherPage from "../MarcherPage";
import Page from "../Page";
import { StepSize } from "../StepSize";
import { describe, expect, it } from "vitest";
import { marcherPageMapFromArray } from "@/global/classes/MarcherPageIndex";

describe("StepSize", () => {
    it("should be able to create a step size object", () => {
        const stepSize = new StepSize({
            marcher_id: 1,
            // on the 50, on the front hash
            startingX: 960,
            startingY: 687.96,
            // on the 50, 8 in front of the front hash
            endingX: 960,
            endingY: 783.96,
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
            startingX: 960,
            startingY: 687.96,
            // Splitting the 45 and 50 on S1, on the front hash
            endingX: 1008,
            endingY: 687.96,
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
            startingX: 960,
            startingY: 687.96,
            // Splitting the 45 and 50 on S1, 3 behind the front hash
            endingX: 1008,
            endingY: 651.96,
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
            startingX: 960,
            startingY: 687.96,
            // on the 50, 8 in front of the front hash (in 6 to 5 grid)
            endingX: 960,
            endingY: 807.96,
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
            startingX: 960,
            startingY: 687.96,
            // one hundredth of a pixel away
            endingX: 960,
            endingY: 687.97,
            counts: 8,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSize.displayString()).toBe("Tiny");
        expect(stepSize.stepsPerFiveYards).toBe(76800.00000006985);
    });

    it("should handle when counts are 0", () => {
        const stepSize = new StepSize({
            marcher_id: 3,
            // on the 50, on the front hash
            startingX: 960,
            startingY: 687.96,
            // Splitting the 45 and 50 on S1, 3 behind the front hash
            endingX: 1008,
            endingY: 651.96,
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
            startingX: 960,
            startingY: 687.96,
            // on the 50, on the front hash
            endingX: 960,
            endingY: 687.96,
            counts: 8,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSize.displayString()).toBe("Hold");
        expect(stepSize.stepsPerFiveYards).toBe(Infinity);
    });

    it("should create a step size from start and end marcher page", () => {
        const startingPage = {
            marcher_id: 1,
            // on the 50, on the front hash
            x: 960,
            y: 687.96,
        } as MarcherPage;
        const endingPage = {
            marcher_id: 1,
            // on the 50, 8 in front of the front hash
            x: 960,
            y: 783.96,
        } as MarcherPage;
        const page = {
            counts: 16,
        } as Page;
        const stepSize = StepSize.createStepSizeForMarcher({
            startingPage,
            endingPage,
            page,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSize).toBeDefined();
        expect(stepSize!.displayString()).toBe("16 to 5");
        expect(stepSize!.stepsPerFiveYards).toBe(16);
    });

    it("should return undefined when starting page is undefined", () => {
        const endingPage = {
            marcher_id: 1,
            // on the 50, 8 in front of the front hash
            x: 960,
            y: 783.96,
        } as MarcherPage;
        const page = {
            counts: 16,
        } as Page;
        const stepSize = StepSize.createStepSizeForMarcher({
            startingPage: undefined,
            endingPage,
            page,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSize).toBeUndefined();
    });

    it("should find step sizes for a list of marchers", () => {
        // selected marchers
        const marchers = [
            {
                id: 1,
            },
            {
                id: 2,
            },
            {
                id: 3,
            },
            // dots exist for marcher 4, verify that we don't return those in the list
        ] as Marcher[];
        const page = {
            counts: 8,
            id: 5,
            previousPageId: 4,
        } as Page;
        const marcherPageMap = marcherPageMapFromArray([
            // Marcher 1 - 8 to 5
            {
                marcher_id: 1,
                x: 960,
                y: 687.96,
                page_id: 4,
            },
            {
                marcher_id: 1,
                x: 960,
                y: 783.96,
                page_id: 5,
            },
            // Marcher 2 - 16 to 5
            {
                marcher_id: 2,
                x: 960,
                y: 687.96,
                page_id: 4,
            },
            {
                marcher_id: 2,
                x: 1008,
                y: 687.96,
                page_id: 5,
            },
            // Marcher 3 - 12.8 to 5
            {
                marcher_id: 3,
                x: 960,
                y: 687.96,
                page_id: 4,
            },
            {
                marcher_id: 3,
                x: 1008,
                y: 651.96,
                page_id: 5,
            },
            // Marcher 4 - 8 to 5
            {
                marcher_id: 4,
                x: 960,
                y: 687.96,
                page_id: 4,
            },
            {
                marcher_id: 4,
                x: 960,
                y: 783.96,
                page_id: 5,
            },
        ] as MarcherPage[]);
        const stepSizes = StepSize.createStepSizesForMarchers({
            marchers: marchers,
            marcherPages: marcherPageMap,
            page: page,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSizes).toBeDefined();
        expect(stepSizes.length).toBe(3);

        const marcher1StepSize = stepSizes.find(
            (stepSize) => stepSize?.marcher_id === 1,
        );
        expect(marcher1StepSize).toBeDefined();
        expect(marcher1StepSize!.displayString()).toBe("8 to 5");

        const marcher2StepSize = stepSizes.find(
            (stepSize) => stepSize?.marcher_id === 2,
        );
        expect(marcher2StepSize).toBeDefined();
        expect(marcher2StepSize!.displayString()).toBe("16 to 5");

        const marcher3StepSize = stepSizes.find(
            (stepSize) => stepSize?.marcher_id === 3,
        );
        expect(marcher3StepSize).toBeDefined();
        expect(marcher3StepSize!.displayString()).toBe("12.8 to 5");

        const marcher4StepSize = stepSizes.find(
            (stepSize) => stepSize?.marcher_id === 4,
        );
        expect(marcher4StepSize).toBeUndefined();
    });

    it("should find min and max step sizes for a list of marchers", () => {
        // selected marchers
        const marchers = [
            {
                id: 1,
            },
            {
                id: 2,
            },
            {
                id: 3,
            },
            // dots exist for marcher 4, verify that we don't return those in the list
        ] as Marcher[];
        const page = {
            counts: 8,
            id: 5,
            previousPageId: 4,
        } as Page;
        const marcherPageMap = marcherPageMapFromArray([
            // Marcher 1 - 8 to 5
            {
                marcher_id: 1,
                x: 960,
                y: 687.96,
                page_id: 4,
            },
            {
                marcher_id: 1,
                x: 960,
                y: 783.96,
                page_id: 5,
            },
            // Marcher 2 - 16 to 5
            {
                marcher_id: 2,
                x: 960,
                y: 687.96,
                page_id: 4,
            },
            {
                marcher_id: 2,
                x: 1008,
                y: 687.96,
                page_id: 5,
            },
            // Marcher 3 - 12.8 to 5
            {
                marcher_id: 3,
                x: 960,
                y: 687.96,
                page_id: 4,
            },
            {
                marcher_id: 3,
                x: 1008,
                y: 651.96,
                page_id: 5,
            },
            // Marcher 4 - 4 to 5
            {
                marcher_id: 4,
                x: 960,
                y: 687.96,
                page_id: 4,
            },
            {
                marcher_id: 4,
                x: 960,
                y: 495.96,
                page_id: 5,
            },
        ] as MarcherPage[]);
        const stepSizes = StepSize.getMinAndMaxStepSizesForMarchers({
            marchers: marchers,
            marcherPages: marcherPageMap,
            page: page,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSizes).toBeDefined();
        expect(stepSizes.min).toBeDefined();
        expect(stepSizes.max).toBeDefined();

        expect(stepSizes.min!.stepsPerFiveYards).toBe(16);
        expect(stepSizes.min!.marcher_id).toBe(2);

        expect(stepSizes.max!.stepsPerFiveYards).toBe(8);
        expect(stepSizes.max!.marcher_id).toBe(1);
    });

    it("should handle min and max when there is no previous page", () => {
        // selected marchers
        const marchers = [
            {
                id: 1,
            },
            {
                id: 2,
            },
            {
                id: 3,
            },
            // dots exist for marcher 4, verify that we don't return those in the list
        ] as Marcher[];
        const page = {
            counts: 8,
            id: 5,
            previousPageId: 4,
        } as Page;
        const marcherPageMap = marcherPageMapFromArray([
            {
                marcher_id: 1,
                x: 960,
                y: 783.96,
                page_id: 5,
            },
            {
                marcher_id: 2,
                x: 1008,
                y: 687.96,
                page_id: 5,
            },
            {
                marcher_id: 3,
                x: 1008,
                y: 651.96,
                page_id: 5,
            },
            {
                marcher_id: 4,
                x: 960,
                y: 495.96,
                page_id: 5,
            },
        ] as MarcherPage[]);
        const stepSizes = StepSize.getMinAndMaxStepSizesForMarchers({
            marchers: marchers,
            marcherPages: marcherPageMap,
            page: page,
            fieldProperties: legacyMockNCAAFieldProperties,
        });

        expect(stepSizes).toBeDefined();
        expect(stepSizes.min).toBeUndefined();
        expect(stepSizes.max).toBeUndefined();
    });
});

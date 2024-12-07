import FieldProperties from "../../FieldProperties";
import { describe, expect, it, beforeEach } from "vitest";
import FieldPropertiesTemplates from "../../FieldProperties.templates";

describe("FieldProperties.templates", () => {
    describe("college", () => {
        let collegeFieldProperties: FieldProperties;
        beforeEach(() => {
            collegeFieldProperties =
                FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
        });
        it("should create a valid FieldProperties object for college template", () => {
            // expect(collegeFieldProperties).toBeInstanceOf(collegeFieldProperties);
            expect(collegeFieldProperties.centerFrontPoint).toEqual({
                xPixels: 960,
                yPixels: 1023.96,
            });
            expect(collegeFieldProperties.xCheckpoints).toHaveLength(21);
            expect(collegeFieldProperties.yCheckpoints).toHaveLength(6);
            expect(collegeFieldProperties.width).toBe(1920);
            expect(collegeFieldProperties.height).toBe(1023.96);
        });

        it("should create the x checkpoints for a college football field without end zones", () => {
            const xCheckpoints = collegeFieldProperties.xCheckpoints;
            expect(xCheckpoints).toHaveLength(21);
            const test50YardLine = xCheckpoints.find(
                (checkpoint) => checkpoint.name === "50 yard line",
            );
            expect(test50YardLine).toEqual({
                name: "50 yard line",
                terseName: "50",
                axis: "x",
                stepsFromCenterFront: 0,
                useAsReference: true,
                fieldLabel: "50",
            });
            const test40YardLineS1 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === -16,
            );
            expect(test40YardLineS1).toEqual({
                name: "40 yard line",
                terseName: "40",
                axis: "x",
                stepsFromCenterFront: -16,
                useAsReference: true,
                fieldLabel: "40",
            });
            const test40YardLineS2 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === 16,
            );
            expect(test40YardLineS2).toEqual({
                name: "40 yard line",
                terseName: "40",
                axis: "x",
                stepsFromCenterFront: 16,
                useAsReference: true,
                fieldLabel: "40",
            });
            const test5YardLineS1 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === -72,
            );
            expect(test5YardLineS1).toEqual({
                name: "5 yard line",
                terseName: "5",
                axis: "x",
                stepsFromCenterFront: -72,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const test5YardLineS2 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === 72,
            );
            expect(test5YardLineS2).toEqual({
                name: "5 yard line",
                terseName: "5",
                axis: "x",
                stepsFromCenterFront: 72,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const test0YardLineS1 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === -80,
            );
            expect(test0YardLineS1).toEqual({
                name: "0 yard line",
                terseName: "0",
                axis: "x",
                stepsFromCenterFront: -80,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const test0YardLineS2 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === 80,
            );
            expect(test0YardLineS2).toEqual({
                name: "0 yard line",
                terseName: "0",
                axis: "x",
                stepsFromCenterFront: 80,
                useAsReference: true,
                fieldLabel: undefined,
            });
            // Test all yard lines
            for (let yards = 0; yards <= 100; yards = yards += 5) {
                const curYardLine = yards < 50 ? yards : 100 - yards;
                const stepsFromCenterFront = ((yards - 50) / 5) * 8;
                // If the yard line is a multiple of 10 and not 0, label it
                const label =
                    curYardLine !== 0 && curYardLine % 10 === 0
                        ? curYardLine.toString()
                        : undefined;

                const testYardLine = xCheckpoints.find(
                    (checkpoint) =>
                        checkpoint.stepsFromCenterFront ===
                        stepsFromCenterFront,
                );
                expect(testYardLine).toEqual({
                    name: `${curYardLine} yard line`,
                    axis: "x",
                    terseName: curYardLine.toString(),
                    stepsFromCenterFront: stepsFromCenterFront,
                    useAsReference: true,
                    fieldLabel: label,
                });
            }
        });

        it("should create the x checkpoints for a college football field without end zones", () => {
            const hsWithEndZones =
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES;
            const xCheckpoints = hsWithEndZones.xCheckpoints;
            expect(xCheckpoints).toHaveLength(23);
            const test50YardLine = xCheckpoints.find(
                (checkpoint) => checkpoint.name === "50 yard line",
            );
            expect(test50YardLine).toBeDefined();
            expect(test50YardLine).toEqual({
                name: "50 yard line",
                terseName: "50",
                axis: "x",
                stepsFromCenterFront: 0,
                useAsReference: true,
                fieldLabel: "50",
            });
            const test40YardLineS1 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === -16,
            );
            expect(test40YardLineS1).toBeDefined();
            expect(test40YardLineS1).toEqual({
                name: "40 yard line",
                terseName: "40",
                axis: "x",
                stepsFromCenterFront: -16,
                useAsReference: true,
                fieldLabel: "40",
            });
            const test40YardLineS2 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === 16,
            );
            expect(test40YardLineS2).toBeDefined();
            expect(test40YardLineS2).toEqual({
                name: "40 yard line",
                terseName: "40",
                axis: "x",
                stepsFromCenterFront: 16,
                useAsReference: true,
                fieldLabel: "40",
            });
            const test5YardLineS1 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === -72,
            );
            expect(test5YardLineS1).toBeDefined();
            expect(test5YardLineS1).toEqual({
                name: "5 yard line",
                terseName: "5",
                axis: "x",
                stepsFromCenterFront: -72,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const test5YardLineS2 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === 72,
            );
            expect(test5YardLineS2).toBeDefined();
            expect(test5YardLineS2).toEqual({
                name: "5 yard line",
                terseName: "5",
                axis: "x",
                stepsFromCenterFront: 72,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const test0YardLineS1 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === -80,
            );
            expect(test0YardLineS1).toBeDefined();
            expect(test0YardLineS1).toEqual({
                name: "0 yard line",
                terseName: "0",
                axis: "x",
                stepsFromCenterFront: -80,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const test0YardLineS2 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === 80,
            );
            expect(test0YardLineS2).toBeDefined();
            expect(test0YardLineS2).toEqual({
                name: "0 yard line",
                terseName: "0",
                axis: "x",
                stepsFromCenterFront: 80,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const endZoneS1 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === -96,
            );
            expect(endZoneS1).toBeDefined();
            expect(endZoneS1).toEqual({
                name: "end zone",
                terseName: "EZ",
                axis: "x",
                stepsFromCenterFront: -96,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const endZoneS2 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === 96,
            );
            expect(endZoneS2).toBeDefined();
            expect(endZoneS2).toEqual({
                name: "end zone",
                terseName: "EZ",
                axis: "x",
                stepsFromCenterFront: 96,
                useAsReference: true,
                fieldLabel: undefined,
            });
        });

        it("should create the y checkpoints for an college football field", () => {
            const yCheckpoints = collegeFieldProperties.yCheckpoints;
            expect(yCheckpoints).toHaveLength(6);
            const testFrontSideline = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "front sideline",
            );
            expect(testFrontSideline).toBeDefined();
            expect(testFrontSideline).toEqual({
                name: "front sideline",
                terseName: "FSL",
                axis: "y",
                stepsFromCenterFront: 0,
                useAsReference: true,
                visible: false,
            });
            const testFrontHash = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "NCAA front hash",
            );
            expect(testFrontHash).toBeDefined();
            expect(testFrontHash).toEqual({
                name: "NCAA front hash",
                terseName: "FH",
                axis: "y",
                stepsFromCenterFront: -32,
                useAsReference: true,
            });
            const testGridBackHash = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "grid NCAA back hash",
            );
            expect(testGridBackHash).toBeDefined();
            expect(testGridBackHash).toEqual({
                name: "grid NCAA back hash",
                terseName: "grid:BH",
                axis: "y",
                stepsFromCenterFront: -52,
                useAsReference: true,
            });
            const testRealBackHash = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "real NCAA back hash",
            );
            expect(testRealBackHash).toBeDefined();
            expect(testRealBackHash).toEqual({
                name: "real NCAA back hash",
                terseName: "real:BH",
                axis: "y",
                stepsFromCenterFront: -53.33,
                useAsReference: false,
            });
            const testGridBackSideline = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "grid back sideline",
            );
            expect(testGridBackSideline).toBeDefined();
            expect(testGridBackSideline).toEqual({
                name: "grid back sideline",
                terseName: "grid:BSL",
                axis: "y",
                stepsFromCenterFront: -85,
                useAsReference: true,
                visible: false,
            });
            const testRealBackSideline = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "real back sideline",
            );
            expect(testRealBackSideline).toBeDefined();
            expect(testRealBackSideline).toEqual({
                name: "real back sideline",
                terseName: "real:BSL",
                axis: "y",
                stepsFromCenterFront: -85.33,
                useAsReference: false,
                visible: false,
            });
        });

        it("should get the yard number coordinates for an college football field", () => {
            expect(collegeFieldProperties.yardNumberCoordinates).toEqual({
                homeStepsFromFrontToOutside: 11.2,
                homeStepsFromFrontToInside: 14.4,
                awayStepsFromFrontToInside: 70.9333,
                awayStepsFromFrontToOutside: 74.1333,
            });
        });
    });

    describe("High School", () => {
        let highSchoolFieldProperties: FieldProperties;
        beforeEach(() => {
            highSchoolFieldProperties =
                FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
        });
        it("should create a valid FieldProperties object for high school template", () => {
            // expect(highSchoolFieldProperties).toBeInstanceOf(highSchoolFieldProperties);
            expect(highSchoolFieldProperties.centerFrontPoint).toEqual({
                xPixels: 960,
                yPixels: 1023.96,
            });
            expect(highSchoolFieldProperties.xCheckpoints).toHaveLength(21);
            expect(highSchoolFieldProperties.yCheckpoints).toHaveLength(5);
            expect(highSchoolFieldProperties.width).toBe(1920);
            expect(highSchoolFieldProperties.height).toBe(1023.96);
        });

        it("should create the x checkpoints for an high school football field", () => {
            const xCheckpoints = highSchoolFieldProperties.xCheckpoints;
            expect(xCheckpoints).toHaveLength(21);
            const test50YardLine = xCheckpoints.find(
                (checkpoint) => checkpoint.name === "50 yard line",
            );
            expect(test50YardLine).toEqual({
                name: "50 yard line",
                terseName: "50",
                axis: "x",
                stepsFromCenterFront: 0,
                useAsReference: true,
                fieldLabel: "50",
            });
            const test40YardLineS1 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === -16,
            );
            expect(test40YardLineS1).toEqual({
                name: "40 yard line",
                terseName: "40",
                axis: "x",
                stepsFromCenterFront: -16,
                useAsReference: true,
                fieldLabel: "40",
            });
            const test40YardLineS2 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === 16,
            );
            expect(test40YardLineS2).toEqual({
                name: "40 yard line",
                terseName: "40",
                axis: "x",
                stepsFromCenterFront: 16,
                useAsReference: true,
                fieldLabel: "40",
            });
            const test5YardLineS1 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === -72,
            );
            expect(test5YardLineS1).toEqual({
                name: "5 yard line",
                terseName: "5",
                axis: "x",
                stepsFromCenterFront: -72,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const test5YardLineS2 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === 72,
            );
            expect(test5YardLineS2).toEqual({
                name: "5 yard line",
                terseName: "5",
                axis: "x",
                stepsFromCenterFront: 72,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const test0YardLineS1 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === -80,
            );
            expect(test0YardLineS1).toEqual({
                name: "0 yard line",
                terseName: "0",
                axis: "x",
                stepsFromCenterFront: -80,
                useAsReference: true,
                fieldLabel: undefined,
            });
            const test0YardLineS2 = xCheckpoints.find(
                (checkpoint) => checkpoint.stepsFromCenterFront === 80,
            );
            expect(test0YardLineS2).toEqual({
                name: "0 yard line",
                terseName: "0",
                axis: "x",
                stepsFromCenterFront: 80,
                useAsReference: true,
                fieldLabel: undefined,
            });
            // Test all yard lines
            for (let yards = 0; yards <= 100; yards = yards += 5) {
                const curYardLine = yards < 50 ? yards : 100 - yards;
                const stepsFromCenterFront = ((yards - 50) / 5) * 8;
                // If the yard line is a multiple of 10 and not 0, label it
                const label =
                    curYardLine !== 0 && curYardLine % 10 === 0
                        ? curYardLine.toString()
                        : undefined;

                const testYardLine = xCheckpoints.find(
                    (checkpoint) =>
                        checkpoint.stepsFromCenterFront ===
                        stepsFromCenterFront,
                );
                expect(testYardLine).toEqual({
                    name: `${curYardLine} yard line`,
                    axis: "x",
                    terseName: curYardLine.toString(),
                    stepsFromCenterFront: stepsFromCenterFront,
                    useAsReference: true,
                    fieldLabel: label,
                });
            }
        });

        it("should create the y checkpoints for an high school football field", () => {
            const yCheckpoints = highSchoolFieldProperties.yCheckpoints;
            expect(yCheckpoints).toHaveLength(5);
            const testFrontSideline = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "front sideline",
            );
            expect(testFrontSideline).toBeDefined();
            expect(testFrontSideline).toEqual({
                name: "front sideline",
                terseName: "FSL",
                axis: "y",
                stepsFromCenterFront: 0,
                useAsReference: true,
                visible: false,
            });
            const testFrontHash = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "HS front hash",
            );
            expect(testFrontHash).toBeDefined();
            expect(testFrontHash).toEqual({
                name: "HS front hash",
                terseName: "FH",
                axis: "y",
                stepsFromCenterFront: -28,
                useAsReference: true,
            });
            const testBackHash = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "HS back hash",
            );
            expect(testBackHash).toBeDefined();
            expect(testBackHash).toEqual({
                name: "HS back hash",
                terseName: "BH",
                axis: "y",
                stepsFromCenterFront: -56,
                useAsReference: true,
            });
            const testGridBackSideline = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "grid back sideline",
            );
            expect(testGridBackSideline).toBeDefined();
            expect(testGridBackSideline).toEqual({
                name: "grid back sideline",
                terseName: "grid:BSL",
                axis: "y",
                stepsFromCenterFront: -85,
                useAsReference: true,
                visible: false,
            });
            const testRealBackSideline = yCheckpoints.find(
                (checkpoint) => checkpoint.name === "real back sideline",
            );
            expect(testRealBackSideline).toBeDefined();
            expect(testRealBackSideline).toEqual({
                name: "real back sideline",
                terseName: "real:BSL",
                axis: "y",
                stepsFromCenterFront: -85.33,
                useAsReference: false,
                visible: false,
            });
        });

        it("should get the yard number coordinates for a high school football field", () => {
            expect(highSchoolFieldProperties.yardNumberCoordinates).toEqual({
                homeStepsFromFrontToOutside: 11.2,
                homeStepsFromFrontToInside: 14.4,
                awayStepsFromFrontToInside: 70.9333,
                awayStepsFromFrontToOutside: 74.1333,
            });
        });
    });
});

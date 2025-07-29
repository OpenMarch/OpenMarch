import { describe, it, expect } from "vitest";
import { FieldProperties, type Checkpoint } from "../FieldProperties";

const xCheckpoints: Checkpoint[] = [
    {
        id: 1,
        name: "50",
        axis: "x",
        terseName: "50",
        stepsFromCenterFront: 0,
        useAsReference: true,
        visible: true,
    },
    {
        id: 2,
        name: "45",
        axis: "x",
        terseName: "45",
        stepsFromCenterFront: 8,
        useAsReference: true,
        visible: true,
    },
    {
        id: 3,
        name: "45",
        axis: "x",
        terseName: "45",
        stepsFromCenterFront: -8,
        useAsReference: true,
        visible: true,
    },
    {
        id: 4,
        name: "Endzone",
        axis: "x",
        terseName: "EZ",
        stepsFromCenterFront: 80,
        useAsReference: true,
        visible: true,
    },
    {
        id: 5,
        name: "Endzone",
        axis: "x",
        terseName: "EZ",
        stepsFromCenterFront: -80,
        useAsReference: true,
        visible: true,
    },
];

const yCheckpoints: Checkpoint[] = [
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
        name: "Front Hash",
        axis: "y",
        terseName: "FH",
        stepsFromCenterFront: 32,
        useAsReference: true,
        visible: true,
    },
    {
        id: 3,
        name: "Back Hash",
        axis: "y",
        terseName: "BH",
        stepsFromCenterFront: 53.33,
        useAsReference: true,
        visible: true,
    },
    {
        id: 4,
        name: "Back Sideline",
        axis: "y",
        terseName: "BSL",
        stepsFromCenterFront: 85.33,
        useAsReference: true,
        visible: true,
    },
];

describe("FieldProperties", () => {
    it("should initialize with default values", () => {
        const field = new FieldProperties({
            name: "Test Field",
            xCheckpoints,
            yCheckpoints,
        });

        expect(field.name).toBe("Test Field");
        expect(field.xCheckpoints).toEqual(xCheckpoints);
        expect(field.yCheckpoints).toEqual(yCheckpoints);
        expect(field.stepSizeInches).toBe(22.5);
        expect(field.measurementSystem).toBe("imperial");
        expect(field.isCustom).toBe(true);
    });

    it("should throw an error for duplicate x-checkpoint IDs", () => {
        const invalidXCheckpoints: Checkpoint[] = [
            ...xCheckpoints,
            {
                id: 1,
                name: "Duplicate",
                axis: "x",
                terseName: "Dup",
                stepsFromCenterFront: 10,
                useAsReference: false,
                visible: true,
            },
        ];
        expect(
            () =>
                new FieldProperties({
                    name: "Test Field",
                    xCheckpoints: invalidXCheckpoints,
                    yCheckpoints,
                }),
        ).toThrow("Duplicate x checkpoint ID found: 1");
    });

    it("should throw an error for duplicate y-checkpoint IDs", () => {
        const invalidYCheckpoints: Checkpoint[] = [
            ...yCheckpoints,
            {
                id: 1,
                name: "Duplicate",
                axis: "y",
                terseName: "Dup",
                stepsFromCenterFront: 10,
                useAsReference: false,
                visible: true,
            },
        ];
        expect(
            () =>
                new FieldProperties({
                    name: "Test Field",
                    xCheckpoints,
                    yCheckpoints: invalidYCheckpoints,
                }),
        ).toThrow("Duplicate y checkpoint id found: 1");
    });

    it("should calculate width, height, and centerFrontPoint correctly", () => {
        const field = new FieldProperties({
            name: "Test Field",
            xCheckpoints,
            yCheckpoints,
        });

        const minX = -80;
        const maxX = 80;
        const minY = 0;
        const maxY = 85.33;
        const pixelsPerStep = 22.5 * 0.5;

        const expectedWidth = (maxX - minX) * pixelsPerStep;
        const expectedHeight = (maxY - minY) * pixelsPerStep;

        expect(field.width).toBeCloseTo(expectedWidth);
        expect(field.height).toBeCloseTo(expectedHeight);
        expect(field.centerFrontPoint.xPixels).toBeCloseTo(expectedWidth / 2);
        expect(field.centerFrontPoint.yPixels).toBeCloseTo(expectedHeight);
    });

    it("should calculate pixelsPerStep correctly", () => {
        const field = new FieldProperties({
            name: "Test Field",
            xCheckpoints,
            yCheckpoints,
            stepSizeInches: 20,
        });
        expect(field.pixelsPerStep).toBe(20 * FieldProperties.PIXELS_PER_INCH);
    });

    it("should calculate stepSizeInUnits correctly", () => {
        const imperialField = new FieldProperties({
            name: "Imperial Field",
            xCheckpoints,
            yCheckpoints,
            measurementSystem: "imperial",
            stepSizeInches: 22.5,
        });
        expect(imperialField.stepSizeInUnits).toBe(22.5);

        const metricField = new FieldProperties({
            name: "Metric Field",
            xCheckpoints,
            yCheckpoints,
            measurementSystem: "metric",
            stepSizeInches: 22.5,
        });
        expect(metricField.stepSizeInUnits).toBeCloseTo(22.5 * 2.54);
    });

    it("should convert centimeters to inches", () => {
        expect(FieldProperties.centimetersToInches(2.54)).toBe(1);
        expect(FieldProperties.centimetersToInches(10)).toBeCloseTo(3.937);
    });

    it("should calculate totalWidthInches and totalHeightInches correctly", () => {
        const field = new FieldProperties({
            name: "Test Field",
            xCheckpoints,
            yCheckpoints,
        });
        expect(field.totalWidthInches).toBe(
            field.width / FieldProperties.PIXELS_PER_INCH,
        );
        expect(field.totalHeightInches).toBe(
            field.height / FieldProperties.PIXELS_PER_INCH,
        );
    });

    it("should return prettyWidth and prettyHeight in imperial", () => {
        const field = new FieldProperties({
            name: "Imperial Field",
            xCheckpoints,
            yCheckpoints,
            measurementSystem: "imperial",
        });
        const widthInFeet = (field.totalWidthInches / 12).toFixed(2);
        const heightInFeet = (field.totalHeightInches / 12).toFixed(2);
        expect(field.prettyWidth).toBe(`${widthInFeet} ft`);
        expect(field.prettyHeight).toBe(`${heightInFeet} ft`);
    });

    it("should return prettyWidth and prettyHeight in metric", () => {
        const field = new FieldProperties({
            name: "Metric Field",
            xCheckpoints,
            yCheckpoints,
            measurementSystem: "metric",
        });
        const widthInMeters = (field.totalWidthInches * 0.0254).toFixed(2);
        const heightInMeters = (field.totalHeightInches * 0.0254).toFixed(2);
        expect(field.prettyWidth).toBe(`${widthInMeters} m`);
        expect(field.prettyHeight).toBe(`${heightInMeters} m`);
    });
});

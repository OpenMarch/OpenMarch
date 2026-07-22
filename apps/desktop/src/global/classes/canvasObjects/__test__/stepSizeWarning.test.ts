import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import { legacyMockNCAAFieldProperties } from "@/__mocks__/globalMocks";
import { evaluatePathWarning } from "../stepSizeWarning";

// Ensure the field has the 45" default threshold regardless of mock shape.
const fieldProperties = new FieldProperties({
    ...legacyMockNCAAFieldProperties,
    stepSizeWarningThresholdInches: 45,
});

describe("evaluatePathWarning", () => {
    it("shows an enabled, under-threshold path without warning", () => {
        const result = evaluatePathWarning({
            start: { x: 900, y: 644.96 },
            end: { x: 900, y: 734.96 }, // 8-to-5
            counts: 8,
            fieldProperties,
            pathEnabled: true,
            allowForceShow: true,
        });
        expect(result).toEqual({ show: true, isWarning: false });
    });

    it("hides an under-threshold path when disabled", () => {
        const result = evaluatePathWarning({
            start: { x: 900, y: 644.96 },
            end: { x: 900, y: 734.96 },
            counts: 8,
            fieldProperties,
            pathEnabled: false,
            allowForceShow: true,
        });
        expect(result).toEqual({ show: false, isWarning: false });
    });

    it("force-shows an over-threshold path when disabled and force-show is allowed", () => {
        const result = evaluatePathWarning({
            start: { x: 900, y: 644.96 },
            end: { x: 900, y: 824.96 }, // large travel
            counts: 2,
            fieldProperties,
            pathEnabled: false,
            allowForceShow: true, // next path
        });
        expect(result).toEqual({ show: true, isWarning: true });
    });

    it("keeps a hidden path hidden without evaluating the warning when force-show is not allowed", () => {
        const result = evaluatePathWarning({
            start: { x: 900, y: 644.96 },
            end: { x: 900, y: 824.96 }, // large travel, would be over threshold
            counts: 2,
            fieldProperties,
            pathEnabled: false,
            allowForceShow: false, // previous path: cannot show, so warning is not computed
        });
        expect(result).toEqual({ show: false, isWarning: false });
    });

    it("still shows an over-threshold path when its toggle is enabled, regardless of force-show", () => {
        const result = evaluatePathWarning({
            start: { x: 900, y: 644.96 },
            end: { x: 900, y: 824.96 },
            counts: 2,
            fieldProperties,
            pathEnabled: true,
            allowForceShow: false,
        });
        expect(result).toEqual({ show: true, isWarning: true });
    });

    describe("with a threshold of 0", () => {
        const noWarningField = new FieldProperties({
            ...legacyMockNCAAFieldProperties,
            stepSizeWarningThresholdInches: 0,
        });

        it("does not warn on a path that would otherwise be over threshold", () => {
            const result = evaluatePathWarning({
                start: { x: 900, y: 644.96 },
                end: { x: 900, y: 824.96 },
                counts: 2,
                fieldProperties: noWarningField,
                pathEnabled: true,
                allowForceShow: true,
            });
            expect(result).toEqual({ show: true, isWarning: false });
        });

        it("does not force-show a hidden path that would otherwise be over threshold", () => {
            const result = evaluatePathWarning({
                start: { x: 900, y: 644.96 },
                end: { x: 900, y: 824.96 },
                counts: 2,
                fieldProperties: noWarningField,
                pathEnabled: false,
                allowForceShow: true,
            });
            expect(result).toEqual({ show: false, isWarning: false });
        });
    });

    it("does not warn when counts are undefined", () => {
        const result = evaluatePathWarning({
            start: { x: 900, y: 644.96 },
            end: { x: 900, y: 824.96 },
            counts: undefined,
            fieldProperties,
            pathEnabled: true,
            allowForceShow: true,
        });
        expect(result).toEqual({ show: true, isWarning: false });
    });
});

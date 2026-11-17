// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { parseFieldFile } from "../FieldIoButtons.utils";
import { parseStoredFieldProperties } from "../fieldPropertiesSchema";

/** A field as Export Field writes it: the stored JSON. */
const exported = (field: FieldProperties) => JSON.stringify(field);

/** The field Import Field stores for a file's text. */
const imported = (text: string) => {
    const result = parseFieldFile(text);
    if (!result.ok) throw new Error(result.message);
    return new FieldProperties(JSON.parse(result.json));
};

const template =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;

describe(".fieldots import and export", () => {
    it("keeps a non-default step size warning threshold", () => {
        const field = new FieldProperties({
            ...template,
            stepSizeWarningThresholdInches: 30,
        });
        expect(imported(exported(field)).stepSizeWarningThresholdInches).toBe(
            30,
        );
    });

    it("keeps a threshold of 0 (the warning turned off)", () => {
        const field = new FieldProperties({
            ...template,
            stepSizeWarningThresholdInches: 0,
        });
        expect(imported(exported(field)).stepSizeWarningThresholdInches).toBe(
            0,
        );
    });

    it("gives files from before the threshold existed the default", () => {
        const { stepSizeWarningThresholdInches: _dropped, ...older } =
            JSON.parse(exported(template));
        expect(
            imported(JSON.stringify(older)).stepSizeWarningThresholdInches,
        ).toBe(FieldProperties.DEFAULT_STEP_SIZE_WARNING_THRESHOLD_INCHES);
    });

    it("round-trips the rest of the field unchanged", () => {
        const field = new FieldProperties({
            ...template,
            stepSizeWarningThresholdInches: 36,
            stepSizeInches: 30,
            halfLineXInterval: 4,
        });
        expect(imported(exported(field))).toEqual(field);
    });

    it("refuses a step size of 0 or less", () => {
        const json = JSON.parse(exported(template));
        expect(
            parseFieldFile(JSON.stringify({ ...json, stepSizeInches: 0 })).ok,
        ).toBe(false);
        expect(
            parseFieldFile(JSON.stringify({ ...json, stepSizeInches: -2 })).ok,
        ).toBe(false);
    });

    it("refuses a negative threshold", () => {
        const json = JSON.parse(exported(template));
        expect(
            parseFieldFile(
                JSON.stringify({ ...json, stepSizeWarningThresholdInches: -1 }),
            ).ok,
        ).toBe(false);
    });

    it("refuses text that isn't JSON", () => {
        expect(parseFieldFile("not json").ok).toBe(false);
    });
});

describe("parseStoredFieldProperties (a show's stored field, as the mobile export reads it)", () => {
    const stored = JSON.parse(exported(template));

    it("reads a stored step size of 0 or less as the default step size", () => {
        for (const stepSizeInches of [0, -2]) {
            const field = new FieldProperties(
                parseStoredFieldProperties({ ...stored, stepSizeInches }),
            );
            expect(field.stepSizeInches).toBe(22.5);
            expect(field.pixelsPerStep).toBeGreaterThan(0);
        }
    });

    it("reads a stored negative threshold as the default threshold", () => {
        const field = new FieldProperties(
            parseStoredFieldProperties({
                ...stored,
                stepSizeWarningThresholdInches: -1,
            }),
        );
        expect(field.stepSizeWarningThresholdInches).toBe(
            FieldProperties.DEFAULT_STEP_SIZE_WARNING_THRESHOLD_INCHES,
        );
    });

    it("keeps valid stored values as they are", () => {
        const field = new FieldProperties({
            ...template,
            stepSizeInches: 30,
            stepSizeWarningThresholdInches: 0,
        });
        expect(
            new FieldProperties(
                parseStoredFieldProperties(JSON.parse(exported(field))),
            ),
        ).toEqual(field);
    });
});

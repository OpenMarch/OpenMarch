import { describe, it, expect, beforeEach } from "vitest";
import { FieldProperties } from "@openmarch/core/field";
import { getFieldProperties } from "../FieldProperties";
import { setupTestSqlProxy } from "@/__mocks__/TestSqlProxy";
import FieldPropertiesTemplates from "../FieldProperties.templates";

const defaultFieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;

describe("FieldProperties", () => {
    beforeEach(async () => {
        await setupTestSqlProxy();
    });

    describe("getFieldProperties", () => {
        it("should retrieve field properties successfully", async () => {
            const result = await getFieldProperties();
            expect(result).toBeInstanceOf(FieldProperties);
            expect(result).toEqual(defaultFieldProperties);
        });
    });
});

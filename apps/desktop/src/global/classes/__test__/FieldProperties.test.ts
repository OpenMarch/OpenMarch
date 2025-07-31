import { describe, it, expect, beforeEach } from "vitest";
import { FieldProperties } from "@openmarch/core";
import {
    getFieldProperties,
    getFieldPropertiesImage,
    updateFieldPropertiesImage,
    deleteFieldPropertiesImage,
} from "../FieldProperties";
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

    describe("crud operations for field properties image", () => {
        it("should update and delete field properties image successfully", async () => {
            const mockBuffer = Buffer.from("mock image data");

            await updateFieldPropertiesImage(mockBuffer);

            const imageBuffer = await getFieldPropertiesImage();
            expect(imageBuffer).toEqual(mockBuffer);

            await deleteFieldPropertiesImage();
            const image = await getFieldPropertiesImage();
            expect(image).toBeNull();
        });
    });
});

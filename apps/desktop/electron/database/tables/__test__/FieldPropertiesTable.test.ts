import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import {
    getFieldProperties,
    getFieldPropertiesJson,
    updateFieldProperties,
    updateFieldPropertiesImage,
    deleteFieldPropertiesImage,
    getFieldPropertiesImage,
} from "../FieldPropertiesTable";
import Constants from "../../../../src/global/Constants";
import FieldPropertiesTemplates from "../../../../src/global/classes/FieldProperties.templates";
import { initTestDatabase } from "./testUtils";
import { FieldProperties } from "@openmarch/core/field";

const fs = await vi.importMock<typeof import("fs")>("fs");
vi.mock("fs", () => ({
    readFileSync: vi.fn(() => Buffer.from([1, 2, 3, 4])),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
}));
const defaultFieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
describe("FieldPropertiesTable", () => {
    let db: Database.Database;

    beforeEach(async () => {
        // Create in-memory database
        db = await initTestDatabase();
    });

    afterEach(() => {
        db.close();
    });

    describe("getFieldProperties", () => {
        it("should retrieve field properties successfully", () => {
            const result = getFieldProperties({ db });
            expect(result.success).toBe(true);
            expect(new FieldProperties(result.data)).toEqual(
                defaultFieldProperties,
            );
        });

        it("should handle malformed JSON data", () => {
            db.prepare(
                `UPDATE ${Constants.FieldPropertiesTableName} SET json_data = 'invalid-json'`,
            ).run();
            expect(() => getFieldProperties({ db })).toThrow();
        });
    });

    describe("getFieldPropertiesJson", () => {
        it("should retrieve raw JSON string", () => {
            const result = getFieldPropertiesJson({ db });
            expect(result.success).toBe(true);
            expect(typeof result.data).toBe("string");
            expect(result.data).toEqual(JSON.stringify(defaultFieldProperties));
        });
    });

    describe("updateFieldProperties", () => {
        it("should update with FieldProperties object", () => {
            const newProps =
                FieldPropertiesTemplates.PRO_FOOTBALL_FIELD_WITH_END_ZONES;
            const initialGetResult = getFieldProperties({ db });
            expect(new FieldProperties(initialGetResult.data)).toEqual(
                defaultFieldProperties,
            );
            const result = updateFieldProperties({
                db,
                fieldProperties: newProps,
            });
            expect(result.success).toBe(true);
            const newGetResult = getFieldProperties({ db });
            expect(new FieldProperties(newGetResult.data)).toEqual(
                FieldPropertiesTemplates.PRO_FOOTBALL_FIELD_WITH_END_ZONES,
            );
        });

        it("should update with JSON string", () => {
            const jsonString = '{"pixelsPerStep": 12, "stepsPerYard": 4}';
            const result = updateFieldProperties({
                db,
                fieldProperties: jsonString,
            });
            expect(result.success).toBe(true);
            expect(result.data?.pixelsPerStep).toBe(12);
        });

        it("should handle invalid JSON string", () => {
            const result = updateFieldProperties({
                db,
                fieldProperties: "invalid-json",
            });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe("updateFieldPropertiesImage", () => {
        it("should store image blob", () => {
            const tempImagePath = "mock/path/test-image.png";

            const mockBuffer = Buffer.from("mock image data");
            vi.mocked(fs.readFileSync).mockReturnValueOnce(mockBuffer);

            const result = updateFieldPropertiesImage({
                db,
                imagePath: tempImagePath,
            });

            expect(result.success).toBe(true);
            expect(result.data).toBe(tempImagePath);

            const imageBuffer = getFieldPropertiesImage({ db });
            expect(imageBuffer.success).toBe(true);
            expect(imageBuffer.data).toEqual(mockBuffer);

            expect(fs.readFileSync).toHaveBeenCalledWith(tempImagePath);
        });

        it("should handle file system errors", () => {
            vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
                throw new Error("File system error");
            });

            const result = updateFieldPropertiesImage({
                db,
                imagePath: "non-existent.png",
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });
    describe("deleteFieldPropertiesImage", () => {
        it("should delete image successfully", () => {
            // First add an image
            const tempImagePath = "mock/path/test-image.png";
            updateFieldPropertiesImage({ db, imagePath: tempImagePath });

            const result = deleteFieldPropertiesImage({ db });
            expect(result.success).toBe(true);

            // Verify image is null in database
            const imageCheck = db
                .prepare(
                    `SELECT image FROM ${Constants.FieldPropertiesTableName} WHERE id = 1`,
                )
                .get() as { image: Buffer | null };
            expect(imageCheck.image).toBeNull();
        });
    });
});

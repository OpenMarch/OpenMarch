import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import {
    updateFieldPropertiesImage,
    deleteFieldPropertiesImage,
    getFieldPropertiesImage,
} from "../FieldPropertiesTable";
import Constants from "../../../../src/global/Constants";
import { initTestDatabase } from "./testUtils";

const fs = await vi.importMock<typeof import("fs")>("fs");
vi.mock("fs", () => ({
    readFileSync: vi.fn(() => Buffer.from([1, 2, 3, 4])),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
}));

describe("FieldPropertiesTable", () => {
    let db: Database.Database;

    beforeEach(async () => {
        // Create in-memory database
        db = await initTestDatabase();
    });

    afterEach(() => {
        db.close();
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

import { describe, it, expect } from "vitest";
import { parsePdfToSheets } from "@/importers/pdfCoordinates";

describe("importer integration", () => {
    it("exposes parsePdfToSheets and rejects invalid data", async () => {
        await expect(parsePdfToSheets(new ArrayBuffer(0))).rejects.toBeTruthy();
    });
});

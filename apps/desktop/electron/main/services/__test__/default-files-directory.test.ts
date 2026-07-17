import { describe, it, expect } from "vitest";
import { computeDefaultDirectoryToPersist } from "../default-files-directory";

describe("computeDefaultDirectoryToPersist", () => {
    it("returns the parent directory when no value is stored yet", () => {
        expect(
            computeDefaultDirectoryToPersist(
                "",
                "/Users/jo/Shows/My Show.dots",
            ),
        ).toBe("/Users/jo/Shows");
    });

    it("returns the parent directory when stored value is undefined", () => {
        expect(
            computeDefaultDirectoryToPersist(
                undefined,
                "/Users/jo/Shows/a.dots",
            ),
        ).toBe("/Users/jo/Shows");
    });

    it("returns null (write-once) when a value is already stored", () => {
        expect(
            computeDefaultDirectoryToPersist(
                "/Users/jo/Existing",
                "/Users/jo/Shows/a.dots",
            ),
        ).toBeNull();
    });

    it("returns null when the new file path is empty", () => {
        expect(computeDefaultDirectoryToPersist("", "")).toBeNull();
    });
});

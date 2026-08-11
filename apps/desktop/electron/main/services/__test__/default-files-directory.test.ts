import { describe, it, expect } from "vitest";
import {
    computeDefaultDirectoryToPersist,
    resolveDefaultFilesDirectory,
} from "../default-files-directory";

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

describe("resolveDefaultFilesDirectory", () => {
    it("returns the stored value when there is no Playwright override", () => {
        expect(resolveDefaultFilesDirectory("/Users/jo/Shows")).toBe(
            "/Users/jo/Shows",
        );
    });

    it("returns an empty string when nothing is stored", () => {
        expect(resolveDefaultFilesDirectory(undefined)).toBe("");
        expect(resolveDefaultFilesDirectory("   ")).toBe("");
    });

    it("prefers the Playwright override over the stored value", () => {
        expect(
            resolveDefaultFilesDirectory(
                "/Users/jo/Shows",
                "/tmp/test-output-2",
            ),
        ).toBe("/tmp/test-output-2");
    });

    it("uses the Playwright override when nothing is stored", () => {
        expect(resolveDefaultFilesDirectory("", "/tmp/test-output-2")).toBe(
            "/tmp/test-output-2",
        );
    });
});

import { describe, it, expect } from "vitest";
import {
    computeDefaultDirectoryToPersist,
    resolveDefaultFilesDirectory,
    resolveNewFileDialogDirectory,
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

    it("treats a stored directory that no longer exists as unset", () => {
        expect(
            resolveDefaultFilesDirectory(
                "/Volumes/UnmountedDrive/Shows",
                undefined,
                () => false,
            ),
        ).toBe("");
    });

    it("keeps a stored directory that still exists", () => {
        expect(
            resolveDefaultFilesDirectory(
                "/Users/jo/Shows",
                undefined,
                () => true,
            ),
        ).toBe("/Users/jo/Shows");
    });

    it("does not existence-check the Playwright override", () => {
        expect(
            resolveDefaultFilesDirectory(
                "/Users/jo/Shows",
                "/tmp/test-output-2",
                () => false,
            ),
        ).toBe("/tmp/test-output-2");
    });
});

describe("resolveNewFileDialogDirectory", () => {
    const docs = "/Users/jo/Documents";

    it("prefers the stored default when it exists", () => {
        expect(
            resolveNewFileDialogDirectory(
                "/Users/jo/Shows",
                "/Users/jo/Old/Show.dots",
                docs,
                () => true,
            ),
        ).toBe("/Users/jo/Shows");
    });

    it("falls back to the last-opened file's folder when no default is stored", () => {
        expect(
            resolveNewFileDialogDirectory(
                "",
                "/Users/jo/Old/Show.dots",
                docs,
                () => true,
            ),
        ).toBe("/Users/jo/Old");
    });

    it("skips a stored default that no longer exists", () => {
        expect(
            resolveNewFileDialogDirectory(
                "/Volumes/Gone/Shows",
                "/Users/jo/Old/Show.dots",
                docs,
                (dir) => dir === "/Users/jo/Old",
            ),
        ).toBe("/Users/jo/Old");
    });

    it("falls back to Documents when nothing else exists", () => {
        expect(
            resolveNewFileDialogDirectory(
                "/Volumes/Gone/Shows",
                "/Volumes/Gone/Show.dots",
                docs,
                () => false,
            ),
        ).toBe(docs);
        expect(
            resolveNewFileDialogDirectory(undefined, "", docs, () => true),
        ).toBe(docs);
    });
});

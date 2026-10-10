import { describe, expect, it } from "vitest";
import { isWindows7 } from "../gpu";

describe("isWindows7", () => {
    it("is true for Windows 7 (NT 6.1)", () => {
        expect(isWindows7("win32", "6.1.7601")).toBe(true);
    });

    it("is false for newer Windows", () => {
        expect(isWindows7("win32", "10.0.22631")).toBe(false);
    });

    it("is false for a Linux 6.1 kernel", () => {
        expect(isWindows7("linux", "6.1.0-18-amd64")).toBe(false);
    });

    it("is false for macOS", () => {
        expect(isWindows7("darwin", "6.1.0")).toBe(false);
    });
});

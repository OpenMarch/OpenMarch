import { describe, expect, it } from "vitest";
import { isGpuCrash, isWindows7 } from "../gpu";

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

describe("isGpuCrash", () => {
    it.each(["crashed", "abnormal-exit", "killed", "oom", "launch-failed"])(
        "is true when the GPU process ends with %s",
        (reason) => {
            expect(isGpuCrash({ type: "GPU", reason })).toBe(true);
        },
    );

    it("is false when the GPU process exits cleanly", () => {
        expect(isGpuCrash({ type: "GPU", reason: "clean-exit" })).toBe(false);
    });

    it("is false for other processes", () => {
        expect(isGpuCrash({ type: "Utility", reason: "crashed" })).toBe(false);
    });
});

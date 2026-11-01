import { afterEach, describe, expect, it, vi } from "vitest";
import { hasOpfs, isAppleTouchDevice } from "../device";
import { touchSafeAccept } from "../fileAccept";

const ipadOs = {
    userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    maxTouchPoints: 5,
};
const mac = { ...ipadOs, maxTouchPoints: 0 };
const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" };
const android = {
    userAgent: "Mozilla/5.0 (Linux; Android 14)",
    maxTouchPoints: 5,
};

describe("isAppleTouchDevice", () => {
    it("knows iPadOS Safari, which says it is a Mac with touch", () => {
        expect(isAppleTouchDevice(ipadOs)).toBe(true);
        expect(isAppleTouchDevice(iphone)).toBe(true);
    });
    it("leaves Macs and other tablets out", () => {
        expect(isAppleTouchDevice(mac)).toBe(false);
        expect(isAppleTouchDevice(android)).toBe(false);
    });
    it("is the check the file pickers use", () => {
        expect(touchSafeAccept(".csv", ipadOs)).toBe("");
        expect(touchSafeAccept(".csv", android)).toBe(".csv");
    });
});

describe("hasOpfs", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("needs workers and the origin private file system", () => {
        vi.stubGlobal("Worker", function Worker() {});
        vi.stubGlobal("navigator", {
            ...navigator,
            storage: { getDirectory: async () => ({}) },
        });
        expect(hasOpfs()).toBe(true);
    });

    it("is false without the file system", () => {
        vi.stubGlobal("Worker", function Worker() {});
        vi.stubGlobal("navigator", { ...navigator, storage: undefined });
        expect(hasOpfs()).toBe(false);
    });
});

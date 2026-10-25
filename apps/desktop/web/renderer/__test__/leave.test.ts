import { describe, expect, it } from "vitest";
import { leaveDecision, leaveQuestion } from "../leave";

describe("leaveDecision", () => {
    it("goes ahead when the latest changes are stored", () => {
        expect(
            leaveDecision({
                storedInBrowser: true,
                changedInPage: true,
                flush: { safe: true },
            }),
        ).toEqual({ ask: false });
    });
    it("asks when storing failed, e.g. the disk is full", () => {
        const decision = leaveDecision({
            storedInBrowser: true,
            changedInPage: false,
            flush: { safe: false, error: "QuotaExceededError" },
        });
        expect(decision).toEqual({
            ask: true,
            reason: "unsaved",
            error: "QuotaExceededError",
        });
        expect(leaveQuestion(decision)).toMatch(/QuotaExceededError/);
    });
    it("asks when the worker didn't answer", () => {
        expect(
            leaveDecision({
                storedInBrowser: true,
                changedInPage: false,
                flush: null,
            }).ask,
        ).toBe(true);
    });
    it("asks in a memory-only tab with changes, and only then", () => {
        expect(
            leaveDecision({
                storedInBrowser: false,
                changedInPage: true,
                flush: null,
            }),
        ).toEqual({ ask: true, reason: "memory" });
        expect(
            leaveDecision({
                storedInBrowser: false,
                changedInPage: false,
                flush: null,
            }),
        ).toEqual({ ask: false });
        expect(
            leaveDecision({
                storedInBrowser: true,
                changedInPage: true,
                flush: { safe: false, memoryOnly: true },
            }).ask,
        ).toBe(true);
    });
});

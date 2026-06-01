import { describe, expect, it } from "vitest";
import { deriveEffectPlaybackStates } from "../effectPlayback";

describe("deriveEffectPlaybackStates", () => {
    const effects = [
        { id: 101, durationMs: 1000 },
        { id: 102, durationMs: 500 },
        { id: 103, durationMs: 250 },
    ] as const;

    it("returns upcoming for all effects when scene time is unavailable", () => {
        const byId = deriveEffectPlaybackStates(effects, null);
        expect(byId.get(101)).toEqual({ state: "upcoming", progressPct: 0 });
        expect(byId.get(102)).toEqual({ state: "upcoming", progressPct: 0 });
        expect(byId.get(103)).toEqual({ state: "upcoming", progressPct: 0 });
    });

    it("marks only one effect active and computes progress while in-range", () => {
        const byId = deriveEffectPlaybackStates(effects, 250);
        expect(byId.get(101)?.state).toBe("active");
        expect(byId.get(101)?.progressPct).toBe(25);
        expect(byId.get(102)).toEqual({ state: "upcoming", progressPct: 0 });
        expect(byId.get(103)).toEqual({ state: "upcoming", progressPct: 0 });
    });

    it("moves to next effect at boundaries and marks previous as played", () => {
        const byId = deriveEffectPlaybackStates(effects, 1000);
        expect(byId.get(101)).toEqual({ state: "played", progressPct: 100 });
        expect(byId.get(102)).toEqual({ state: "active", progressPct: 0 });
        expect(byId.get(103)).toEqual({ state: "upcoming", progressPct: 0 });
    });

    it("marks all effects played after total duration", () => {
        const byId = deriveEffectPlaybackStates(effects, 5000);
        expect(byId.get(101)).toEqual({ state: "played", progressPct: 100 });
        expect(byId.get(102)).toEqual({ state: "played", progressPct: 100 });
        expect(byId.get(103)).toEqual({ state: "played", progressPct: 100 });
    });
});

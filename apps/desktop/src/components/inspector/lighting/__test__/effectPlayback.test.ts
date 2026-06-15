import { describe, expect, it } from "vitest";
import { deriveEffectPlaybackStates } from "../effectPlayback";

describe("deriveEffectPlaybackStates", () => {
    const effects = [
        { id: 101, startMs: 0, durationMs: 1000 },
        { id: 102, startMs: 1000, durationMs: 500 },
        { id: 103, startMs: 1500, durationMs: 250 },
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

    it("supports overlapping effects with independent windows", () => {
        const overlapping = [
            { id: 1, startMs: 0, durationMs: 1000 },
            { id: 2, startMs: 500, durationMs: 1000 },
        ] as const;
        const byId = deriveEffectPlaybackStates(overlapping, 750);
        expect(byId.get(1)?.state).toBe("active");
        expect(byId.get(1)?.progressPct).toBe(75);
        expect(byId.get(2)?.state).toBe("active");
        expect(byId.get(2)?.progressPct).toBe(25);
    });
});

import { describe, expect, it } from "vitest";
import {
    buildLightingScenePlan,
    hex6ToLightingRgba,
    sampleMarcherLightingFill,
} from "../playback";

const baseFill = { r: 10, g: 20, b: 30, a: 1 };

describe("hex6ToLightingRgba", () => {
    it("returns black for invalid hex strings", () => {
        expect(hex6ToLightingRgba("invalid")).toEqual({
            r: 0,
            g: 0,
            b: 0,
            a: 1,
        });
    });

    it("returns black for empty hex strings", () => {
        expect(hex6ToLightingRgba("")).toEqual({
            r: 0,
            g: 0,
            b: 0,
            a: 1,
        });
    });
});

describe("buildLightingScenePlan", () => {
    it("accumulates step windows by duration", () => {
        const plan = buildLightingScenePlan([
            {
                type: "solid",
                argsJson: JSON.stringify({
                    durationMs: 1000,
                    color: "#ff0000",
                }),
                durationMs: 1000,
                marcherIds: [1],
            },
            {
                type: "solid",
                argsJson: JSON.stringify({ durationMs: 500, color: "#00ff00" }),
                durationMs: 500,
                marcherIds: [1],
            },
        ]);
        expect(plan.steps).toHaveLength(2);
        expect(plan.steps[0]!.startMs).toBe(0);
        expect(plan.steps[0]!.endMs).toBe(1000);
        expect(plan.steps[1]!.startMs).toBe(1000);
        expect(plan.steps[1]!.endMs).toBe(1500);
        expect(plan.effectsEndMs).toBe(1500);
    });

    it("uses explicit startMs when provided", () => {
        const plan = buildLightingScenePlan([
            {
                type: "solid",
                argsJson: JSON.stringify({
                    durationMs: 1000,
                    color: "#ff0000",
                }),
                durationMs: 100,
                startMs: 500,
                marcherIds: [1],
            },
            {
                type: "solid",
                argsJson: JSON.stringify({ durationMs: 500, color: "#00ff00" }),
                durationMs: 200,
                marcherIds: [2],
            },
        ]);
        expect(plan.steps[0]!.startMs).toBe(500);
        expect(plan.steps[0]!.endMs).toBe(600);
        expect(plan.steps[1]!.startMs).toBe(600);
        expect(plan.steps[1]!.endMs).toBe(800);
        expect(plan.effectsEndMs).toBe(800);
    });
});

describe("sampleMarcherLightingFill", () => {
    it("returns undefined when marcher is not linked to the active step", () => {
        const plan = buildLightingScenePlan([
            {
                type: "solid",
                argsJson: JSON.stringify({
                    durationMs: 1000,
                    color: "#ff0000",
                }),
                durationMs: 1000,
                marcherIds: [1],
            },
        ]);
        expect(
            sampleMarcherLightingFill(plan, 100, 2, baseFill),
        ).toBeUndefined();
    });

    it("returns undefined when no steps", () => {
        const plan = buildLightingScenePlan([]);
        expect(sampleMarcherLightingFill(plan, 0, 1, baseFill)).toBeUndefined();
    });

    it("returns solid color for solid effect", () => {
        const plan = buildLightingScenePlan([
            {
                type: "solid",
                argsJson: JSON.stringify({
                    durationMs: 1000,
                    color: "#112233",
                }),
                durationMs: 1000,
                marcherIds: [5],
            },
        ]);
        const c = sampleMarcherLightingFill(plan, 500, 5, baseFill);
        expect(c).toEqual(hex6ToLightingRgba("#112233"));
    });

    it("treats strobe like solid (placeholder)", () => {
        const plan = buildLightingScenePlan([
            {
                type: "strobe",
                argsJson: JSON.stringify({
                    durationMs: 1000,
                    color: "#abcdef",
                }),
                durationMs: 1000,
                marcherIds: [1],
            },
        ]);
        const c = sampleMarcherLightingFill(plan, 0, 1, baseFill);
        expect(c).toEqual(hex6ToLightingRgba("#abcdef"));
    });

    it("treats fade like solid for legacy rows", () => {
        const plan = buildLightingScenePlan([
            {
                type: "fade",
                argsJson: JSON.stringify({
                    durationMs: 1000,
                    color: "#ffffff",
                }),
                durationMs: 1000,
                marcherIds: [1],
            },
        ]);
        const mid = sampleMarcherLightingFill(plan, 500, 1, baseFill);
        expect(mid).toEqual(hex6ToLightingRgba("#ffffff"));
    });

    it("returns fade target color immediately at fade start", () => {
        const plan = buildLightingScenePlan([
            {
                type: "solid",
                argsJson: JSON.stringify({
                    durationMs: 1000,
                    color: "#0000ff",
                }),
                durationMs: 1000,
                marcherIds: [1],
            },
            {
                type: "fade",
                argsJson: JSON.stringify({
                    durationMs: 1000,
                    color: "#ff0000",
                }),
                durationMs: 1000,
                marcherIds: [1],
            },
        ]);
        const atFadeStart = sampleMarcherLightingFill(plan, 1000, 1, baseFill);
        expect(atFadeStart).toEqual(hex6ToLightingRgba("#ff0000"));
    });

    it("returns undefined when time is outside all steps", () => {
        const plan = buildLightingScenePlan([
            {
                type: "solid",
                argsJson: JSON.stringify({ durationMs: 100, color: "#ff0000" }),
                durationMs: 100,
                marcherIds: [1],
            },
        ]);
        expect(
            sampleMarcherLightingFill(plan, 100, 1, baseFill),
        ).toBeUndefined();
    });
});

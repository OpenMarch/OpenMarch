import { describe, expect, it } from "vitest";
import {
    benchmarkMarkdown,
    summarizeFrames,
    WARM_UP_FRAMES,
    type BenchmarkReport,
} from "../frameStats";

/** Frame end times for these intervals, after the warm-up frames. */
const framesEvery = (intervals: number[]) => {
    const ends = Array.from({ length: WARM_UP_FRAMES + 1 }, (_, i) => i * 100);
    for (const interval of intervals)
        ends.push(ends[ends.length - 1] + interval);
    return ends;
};

describe("summarizeFrames", () => {
    it("measures a steady 60 fps", () => {
        const stats = summarizeFrames({
            frameEnds: framesEvery(Array(60).fill(1000 / 60)),
            cpu: Array(WARM_UP_FRAMES + 61).fill(2),
            seconds: 1,
            drawCalls: 12,
        });
        expect(stats.frames).toBe(60);
        expect(stats.fps).toBeCloseTo(60);
        expect(stats.intervalP50).toBeCloseTo(16.67, 1);
        expect(stats.jank).toBe(0);
        expect(stats.cpuAvg).toBe(2);
        expect(stats.drawCalls).toBe(12);
    });

    it("leaves out the warm-up frames", () => {
        // A long first frame (shader compiles) doesn't count
        const ends = [0, 900, 916, 932, 948, 964, 980, 996, 1012];
        const stats = summarizeFrames({
            frameEnds: ends,
            cpu: [800, 5, 5, 5, 5, 1, 1, 1, 1],
            seconds: 1,
            drawCalls: 0,
        });
        expect(stats.frames).toBe(ends.length - WARM_UP_FRAMES - 1);
        expect(stats.intervalMax).toBe(16);
        expect(stats.cpuMax).toBe(1);
    });

    it("counts frames that came late as janky", () => {
        const stats = summarizeFrames({
            frameEnds: framesEvery([16, 16, 16, 16, 50, 16, 16, 100]),
            cpu: [],
            seconds: 1,
            drawCalls: 0,
        });
        expect(stats.jank).toBe(2);
        expect(stats.intervalP50).toBe(16);
        expect(stats.intervalMax).toBe(100);
        expect(stats.fps).toBeCloseTo(8 / 0.246);
    });

    it("reports nothing drawn as zero, not NaN", () => {
        const stats = summarizeFrames({
            frameEnds: [],
            cpu: [],
            seconds: 4,
            drawCalls: 0,
        });
        expect(stats).toEqual(
            expect.objectContaining({ frames: 0, fps: 0, cpuAvg: 0, jank: 0 }),
        );
    });
});

describe("benchmarkMarkdown", () => {
    it("writes the environment and a row per scenario", () => {
        const report: BenchmarkReport = {
            environment: {
                field: "three",
                renderer: "Google SwiftShader",
                gl: "software",
                quality: "low (software)",
                pixelRatio: 1,
                width: 1200,
                height: 700,
                marchers: 385,
                build: "production",
                userAgent: "Chrome/140",
                date: "2026-10-15T00:00:00.000Z",
            },
            results: [
                {
                    kind: "play",
                    stats: summarizeFrames({
                        frameEnds: framesEvery(Array(10).fill(20)),
                        cpu: Array(16).fill(1.5),
                        seconds: 4,
                        drawCalls: 9,
                    }),
                },
                { kind: "drag", skipped: "needs #196" },
            ],
        };
        const markdown = benchmarkMarkdown(report);
        expect(markdown).toContain(
            "| Renderer | Google SwiftShader (software) |",
        );
        expect(markdown).toContain(
            "| Field | three.js field, low (software), 1200 × 700 CSS px at 1× |",
        );
        expect(markdown).toContain("| Marchers | 385 |");
        expect(markdown).toContain(
            "| play | 50.0 | 20.0 | 20.0 | 20.0 | 0/10 | 1.50 | 1.50 | 9 |",
        );
        expect(markdown).toContain("| drag | skipped: needs #196 |");
    });
});

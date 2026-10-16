/**
 * The in-app field benchmark's numbers (ADR 0005 D-6.5, fork ticket #205),
 * ported from the prototype's "Run benchmarks" (`proto/three-canvas`,
 * `canvas-proto/editor.ts`). Plain TypeScript: the runner records frames, and
 * this turns them into the table anyone can paste into an issue.
 */

/** What the benchmark does to the field, one at a time. */
import type { GlKind } from "@/field/fieldQuality";

export type BenchmarkKind = "play" | "scrub" | "zoom" | "pan" | "drag";

export const BENCHMARK_KINDS: readonly BenchmarkKind[] = [
    "play",
    "scrub",
    "zoom",
    "pan",
    "drag",
];

export type FrameStats = {
    /** Frames measured (after the warm-up frames). */
    frames: number;
    /** How long the scenario ran, in seconds. */
    seconds: number;
    /** Frames drawn per second. */
    fps: number;
    /** Time between drawn frames, in ms. */
    intervalP50: number;
    intervalP95: number;
    intervalMax: number;
    /** Frames that came more than 1.5 × the median interval after the last. */
    jank: number;
    /** Main-thread time to update and submit a frame, in ms. */
    cpuAvg: number;
    cpuP95: number;
    cpuMax: number;
    /** Draw calls in the last frame; null where there are none to count. */
    drawCalls: number | null;
};

export type BenchmarkResult =
    | { kind: BenchmarkKind; stats: FrameStats }
    | { kind: BenchmarkKind; skipped: string };

/** The machine and field a run measured, so numbers can be compared. */
export type BenchmarkEnvironment = {
    /**
     * Which field was measured. Only the three.js field now; builds before
     * fork #209 also measured the Canvas2D field, so reports name it.
     */
    field: "three";
    /** The WebGL renderer string, e.g. "ANGLE (Intel, … UHD Graphics 620 …)". */
    renderer: string | null;
    gl: GlKind | null;
    /** The field's quality mode, and why it's low. */
    quality: string;
    /** Device pixels per CSS pixel the field draws at. */
    pixelRatio: number | null;
    /** The field's size on screen, in CSS pixels. */
    width: number;
    height: number;
    marchers: number;
    /** Only production builds give numbers worth comparing. */
    build: "production" | "development";
    userAgent: string;
    /** When the run finished, ISO 8601. */
    date: string;
};

export type BenchmarkReport = {
    environment: BenchmarkEnvironment;
    results: BenchmarkResult[];
};

/** Frames dropped from the start of each scenario: shader compiles, first uploads. */
export const WARM_UP_FRAMES = 5;

const percentile = (sorted: readonly number[], p: number) =>
    sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
        : 0;

const sum = (values: readonly number[]) =>
    values.reduce((total, value) => total + value, 0);

/**
 * Sums up one scenario's frames: `frameEnds` are when each drawn frame
 * finished (ms, ascending), `cpu` how long each took on the main thread.
 */
export function summarizeFrames({
    frameEnds,
    cpu,
    seconds,
    drawCalls,
}: {
    frameEnds: readonly number[];
    cpu: readonly number[];
    seconds: number;
    drawCalls: number | null;
}): FrameStats {
    const intervals: number[] = [];
    for (let i = WARM_UP_FRAMES + 1; i < frameEnds.length; i++)
        intervals.push(frameEnds[i] - frameEnds[i - 1]);
    intervals.sort((a, b) => a - b);
    const cpuSorted = cpu.slice(WARM_UP_FRAMES).sort((a, b) => a - b);
    const median = percentile(intervals, 0.5);
    const total = sum(intervals);
    return {
        frames: intervals.length,
        seconds,
        fps: total > 0 ? intervals.length / (total / 1000) : 0,
        intervalP50: median,
        intervalP95: percentile(intervals, 0.95),
        intervalMax: intervals[intervals.length - 1] ?? 0,
        jank: intervals.filter((interval) => interval > median * 1.5).length,
        cpuAvg: cpuSorted.length ? sum(cpuSorted) / cpuSorted.length : 0,
        cpuP95: percentile(cpuSorted, 0.95),
        cpuMax: cpuSorted[cpuSorted.length - 1] ?? 0,
        drawCalls,
    };
}

const fixed = (value: number, digits = 1) => value.toFixed(digits);

/** The report as Markdown: the environment, then one row per scenario. */
export function benchmarkMarkdown({
    environment: env,
    results,
}: BenchmarkReport): string {
    const lines = [
        "| | |",
        "| --- | --- |",
        `| Renderer | ${env.renderer ?? "none"} (${env.gl ?? "unknown"}) |`,
        `| Field | three.js field, ${env.quality}, ${env.width} × ${env.height} CSS px at ${env.pixelRatio ?? "?"}× |`,
        `| Marchers | ${env.marchers} |`,
        `| Build | ${env.build} |`,
        `| Browser | ${env.userAgent} |`,
        `| Date | ${env.date} |`,
        "",
        "| Scenario | fps | p50 ms | p95 ms | max ms | janky | CPU avg ms | CPU p95 ms | draw calls |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ...results.map((result) =>
            "skipped" in result
                ? `| ${result.kind} | skipped: ${result.skipped} | | | | | | | |`
                : `| ${result.kind} | ${fixed(result.stats.fps)} | ${fixed(result.stats.intervalP50)} | ${fixed(result.stats.intervalP95)} | ${fixed(result.stats.intervalMax)} | ${result.stats.jank}/${result.stats.frames} | ${fixed(result.stats.cpuAvg, 2)} | ${fixed(result.stats.cpuP95, 2)} | ${result.stats.drawCalls ?? "n/a"} |`,
        ),
    ];
    return lines.join("\n") + "\n";
}

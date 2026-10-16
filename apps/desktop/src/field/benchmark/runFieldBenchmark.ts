import {
    summarizeFrames,
    type BenchmarkKind,
    type BenchmarkResult,
} from "./frameStats";

/** One thing the benchmark does to the field, for a few seconds. */
export type BenchmarkScenario = {
    kind: BenchmarkKind;
    /** Throws {@link ScenarioSkipped} when it can't run; the result says why. */
    start(): void | Promise<void>;
    /**
     * Moves the scenario on, once per animation frame, `elapsed` ms after it
     * started. Returning false ends it early (playback reached the end).
     */
    step(elapsed: number): boolean | void;
    /** Puts back what the scenario changed. */
    stop(): void | Promise<void>;
};

/**
 * How the benchmark sees the field draw: calls `onStart` as a frame of the
 * field starts and `onEnd` once it has drawn, until the returned function is
 * called: `r3fFrames` (`three/benchmarkFrames.ts`). Nothing here imports
 * three.js, so the benchmark's runner and report stay out of the field's
 * three.js chunk.
 */
export type FrameProbe = {
    listen(onStart: () => void, onEnd: () => void): () => void;
    /** Draw calls in the last frame; null where there are none to count (Canvas2D). */
    drawCalls(): number | null;
};

/** Thrown by a scenario's `start` when it can't run on this show; the result says why. */
export class ScenarioSkipped extends Error {}

/** How long each scenario runs, as the prototype's "Run benchmarks". */
export const SCENARIO_MS = 4000;

export const nextFrame = () =>
    new Promise<number>((resolve) => requestAnimationFrame(resolve));

/**
 * Runs one scenario and measures every frame the field draws meanwhile: when
 * it finished, and the main-thread time from the start of the field's frame
 * to the end of its render (frame hooks, buffer uploads and draw
 * submission).
 */
export async function measureScenario(
    scenario: BenchmarkScenario,
    probe: FrameProbe,
    ms = SCENARIO_MS,
): Promise<BenchmarkResult> {
    try {
        await scenario.start();
    } catch (error) {
        if (error instanceof ScenarioSkipped)
            return { kind: scenario.kind, skipped: error.message };
        throw error;
    }
    await nextFrame();

    const frameEnds: number[] = [];
    const cpu: number[] = [];
    let frameStart = 0;
    let drawCalls: number | null = null;
    const off = probe.listen(
        () => {
            frameStart = performance.now();
        },
        () => {
            const end = performance.now();
            frameEnds.push(end);
            cpu.push(end - frameStart);
        },
    );

    const started = performance.now();
    try {
        await new Promise<void>((resolve, reject) => {
            const tick = () => {
                try {
                    const elapsed = performance.now() - started;
                    if (elapsed >= ms || scenario.step(elapsed) === false)
                        return resolve();
                    requestAnimationFrame(tick);
                } catch (error) {
                    reject(error);
                }
            };
            requestAnimationFrame(tick);
        });
    } finally {
        off();
        drawCalls = probe.drawCalls();
        await scenario.stop();
    }
    return {
        kind: scenario.kind,
        stats: summarizeFrames({
            frameEnds,
            cpu,
            seconds: (performance.now() - started) / 1000,
            drawCalls,
        }),
    };
}

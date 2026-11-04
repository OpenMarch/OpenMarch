import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslate } from "@tolgee/react";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { runAction } from "@/shortcuts/registry";
import { canvasPixelRatio, useFieldQualityStore } from "@/field/fieldQuality";
import { currentFieldQuality } from "@/field/three/useFieldQuality";
import {
    BENCHMARK_KINDS,
    type BenchmarkEnvironment,
    type BenchmarkKind,
    type BenchmarkReport,
    type BenchmarkResult,
} from "./frameStats";
import {
    fieldBenchmarkScenarios,
    pausePlayback,
    type BenchmarkView,
} from "./fieldScenarios";
import { measureScenario, type FrameProbe } from "./runFieldBenchmark";

declare global {
    // eslint-disable-next-line no-unused-vars
    interface Window {
        /**
         * Runs the field benchmark from a script (e.g. a Playwright run on real
         * hardware) and resolves with the report.
         */
        fieldBenchmark?: {
            run(kinds?: readonly BenchmarkKind[]): Promise<BenchmarkReport>;
        };
    }
}

const isProduction = import.meta.env.PROD;

/**
 * The in-app field benchmark (ADR 0005 D-6.5, #205), ported from the
 * prototype: plays, scrubs, zooms and pans the open show for a few seconds
 * each and reports frame times, with what drew them. Only scripts run it, through
 * `window.fieldBenchmark` (e2e/browser/render/benchmark.spec.mts); it isn't offered to users.
 */
export default function FieldBenchmark({
    frames,
    view,
    element,
    marcherCount,
}: {
    /** How the benchmark sees the field draw. */
    frames: FrameProbe;
    /** The field's view, which the zoom and pan scenarios move. */
    view: BenchmarkView;
    /** The element the field draws in, once it's up. */
    element: () => Element | null;
    /** How many marchers the field draws. */
    marcherCount: () => number;
}) {
    const { t } = useTranslate();
    const { isPlaying } = useIsPlaying()!;
    const playing = useRef(isPlaying);
    playing.current = isPlaying;

    const [running, setRunning] = useState<BenchmarkKind | null>(null);
    const busy = useRef(false);

    const environment = useCallback((): BenchmarkEnvironment => {
        const gl = useFieldQualityStore.getState().gl;
        const quality = currentFieldQuality();
        const canvas = element();
        const rect = canvas?.getBoundingClientRect();
        const pixelRatio = canvasPixelRatio(canvas);
        return {
            field: "three",
            renderer: gl?.renderer ?? null,
            gl: gl?.kind ?? null,
            quality:
                quality.mode === "low" ? `low (${quality.reason})` : "full",
            pixelRatio,
            width: Math.round(rect?.width ?? 0),
            height: Math.round(rect?.height ?? 0),
            marchers: marcherCount(),
            build: isProduction ? "production" : "development",
            userAgent: navigator.userAgent,
            date: new Date().toISOString(),
        };
    }, [element, marcherCount]);

    const run = useCallback(
        async (kinds: readonly BenchmarkKind[] = BENCHMARK_KINDS) => {
            if (busy.current) throw new Error("The benchmark is running");
            busy.current = true;
            // Measured from paused, and playing again afterwards if it was
            const wasPlaying = playing.current;
            try {
                if (wasPlaying) await pausePlayback(() => playing.current);
                const scenarios = fieldBenchmarkScenarios({
                    isPlaying: () => playing.current,
                    view,
                });
                const results: BenchmarkResult[] = [];
                for (const kind of kinds) {
                    setRunning(kind);
                    results.push(
                        await measureScenario(scenarios[kind], frames),
                    );
                }
                const done = { environment: environment(), results };
                return done;
            } finally {
                if (wasPlaying && !playing.current) runAction("playPause");
                busy.current = false;
                setRunning(null);
            }
        },
        [frames, view, environment],
    );

    useEffect(() => {
        window.fieldBenchmark = { run };
        return () => {
            delete window.fieldBenchmark;
        };
    }, [run]);

    // Plain and small: anything over the field costs frames
    return running ? (
        <div
            className="bg-fg-1 text-sub text-text rounded-6 border-stroke absolute top-8 right-8 z-10 border px-8 py-4"
            data-testid="fieldBenchmarkRunning"
        >
            {t("field.benchmark.running", { kind: running })}
        </div>
    ) : null;
}

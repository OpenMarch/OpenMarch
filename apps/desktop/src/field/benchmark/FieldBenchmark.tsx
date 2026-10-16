import { useCallback, useEffect, useRef, useState } from "react";
import { T, useTranslate } from "@tolgee/react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@openmarch/ui";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { runAction } from "@/shortcuts/registry";
import { canvasPixelRatio, useFieldQualityStore } from "@/field/fieldQuality";
import { currentFieldQuality } from "@/field/three/useFieldQuality";
import {
    BENCHMARK_KINDS,
    benchmarkMarkdown,
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
         * hardware), as its dialog does, and resolves with the report.
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
 * each and reports frame times, with what drew them. "Run field benchmark" in
 * the command palette opens it.
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

    const [open, setOpen] = useState(false);
    const [running, setRunning] = useState<BenchmarkKind | null>(null);
    const [report, setReport] = useState<BenchmarkReport | null>(null);
    const [copied, setCopied] = useState(false);
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
            // Nothing over the field while it's measured
            setOpen(false);
            setCopied(false);
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
                setReport(done);
                return done;
            } finally {
                if (wasPlaying && !playing.current) runAction("playPause");
                busy.current = false;
                setRunning(null);
                setOpen(true);
            }
        },
        [frames, view, environment],
    );

    useActionHandler("runFieldBenchmark", () => setOpen(true), {
        enabled: running === null,
    });

    useEffect(() => {
        window.fieldBenchmark = { run };
        return () => {
            delete window.fieldBenchmark;
        };
    }, [run]);

    const gl = useFieldQualityStore((s) => s.gl?.kind);

    return (
        <>
            {running && (
                // Plain and small: anything over the field costs frames
                <div
                    className="bg-fg-1 text-sub text-text rounded-6 border-stroke absolute top-8 right-8 z-10 border px-8 py-4"
                    data-testid="fieldBenchmarkRunning"
                >
                    {t("field.benchmark.running", { kind: running })}
                </div>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="w-[min(52rem,90vw)]"
                    data-testid="fieldBenchmark"
                >
                    <DialogTitle>
                        <T keyName="field.benchmark.title" />
                    </DialogTitle>
                    <DialogDescription>
                        <T keyName="field.benchmark.intro" />
                    </DialogDescription>
                    {!isProduction && (
                        <p className="text-sub text-yellow">
                            <T keyName="field.benchmark.devBuild" />
                        </p>
                    )}
                    {gl === "software" && (
                        <p className="text-sub text-text-subtitle">
                            <T keyName="field.benchmark.softwareGl" />
                        </p>
                    )}
                    {report && <BenchmarkTable report={report} />}
                    <div className="flex justify-end gap-8">
                        {report && (
                            <Button
                                variant="secondary"
                                size="compact"
                                onClick={() => {
                                    void navigator.clipboard
                                        .writeText(benchmarkMarkdown(report))
                                        .then(() => setCopied(true));
                                }}
                            >
                                {copied ? (
                                    <T keyName="field.benchmark.copied" />
                                ) : (
                                    <T keyName="field.benchmark.copy" />
                                )}
                            </Button>
                        )}
                        <Button size="compact" onClick={() => void run()}>
                            <T keyName="field.benchmark.run" />
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function BenchmarkTable({ report }: { report: BenchmarkReport }) {
    const { environment: env, results } = report;
    return (
        <div className="flex flex-col gap-8 overflow-x-auto">
            <p className="text-sub text-text-subtitle font-mono">
                three.js field · {env.renderer ?? "no WebGL"} · {env.gl} ·{" "}
                {env.quality} · {env.width}×{env.height} @{" "}
                {env.pixelRatio ?? "?"}× · {env.marchers} marchers · {env.build}
            </p>
            <table
                className="text-sub font-mono"
                data-testid="fieldBenchmarkTable"
            >
                <thead>
                    <tr className="text-text-subtitle text-left">
                        {[
                            "scenario",
                            "fps",
                            "p50 ms",
                            "p95 ms",
                            "max ms",
                            "janky",
                            "CPU avg",
                            "CPU p95",
                            "draws",
                        ].map((heading) => (
                            <th key={heading} className="pr-12 font-normal">
                                {heading}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {results.map((result) => (
                        <tr key={result.kind}>
                            <td className="pr-12">{result.kind}</td>
                            {"skipped" in result ? (
                                <td colSpan={8} className="text-text-subtitle">
                                    {result.skipped}
                                </td>
                            ) : (
                                <>
                                    <td className="pr-12">
                                        {result.stats.fps.toFixed(1)}
                                    </td>
                                    <td className="pr-12">
                                        {result.stats.intervalP50.toFixed(1)}
                                    </td>
                                    <td className="pr-12">
                                        {result.stats.intervalP95.toFixed(1)}
                                    </td>
                                    <td className="pr-12">
                                        {result.stats.intervalMax.toFixed(1)}
                                    </td>
                                    <td className="pr-12">
                                        {result.stats.jank}/
                                        {result.stats.frames}
                                    </td>
                                    <td className="pr-12">
                                        {result.stats.cpuAvg.toFixed(2)}
                                    </td>
                                    <td className="pr-12">
                                        {result.stats.cpuP95.toFixed(2)}
                                    </td>
                                    <td className="pr-12">
                                        {result.stats.drawCalls ?? "n/a"}
                                    </td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

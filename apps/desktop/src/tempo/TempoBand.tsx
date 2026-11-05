// cspell:ignore priya
/**
 * Tempo mode: the lanes the timeline shows in place of its
 * clip rows while tempo mode is on (docs/tempo/daw-research.md). The axis stays counts, so drill
 * doesn't move while you edit tempo; the music slides and stretches under the counts. The audio is
 * never changed: every edit only re-times counts (the grid follows the audio).
 *
 * - **Marks**: rehearsal marks. Double-click to add (next letter) or rename; M while playing drops
 *   one on the nearest measure.
 * - **Measures**: numbers (double-click to set a number from there on) and time signatures (click
 *   a chip to regroup from that measure to the next change). Drag along it to select counts.
 * - **Tempo**: each count's tempo as a line, Logic-style (docs/tempo/logic-analysis.md). Only the
 *   line, a change's dot and a stretch's curve handle drag; elsewhere a drag selects counts. Drag
 *   the line up or down; drag a dot sideways to move the change; drag the handle for a gradual
 *   change (tempoShape.ts). A stretch's end dot sets the tempo it ends on, so a rit. can jump back
 *   (a tempo). Double-click the lane or the line to add a change, a dot to remove it;
 *   right-click > Set tempo… types "120" or "120-90". Holds (fermatas) leave a gap marked 𝄐.
 *   Every tempo edit re-times the counts it changes, and the counts after move with them.
 * - **Music**: the waveform under the count lines. A drag along it selects counts, a click moves
 *   the playhead. "Music offset…" in the music file's menu says where the music starts against
 *   count 1. Nothing is detected in the music: lining up is by ear and eye, with tempo edits,
 *   tap tempo and the metronome.
 * - **T** taps tempo: a panel shows how fast you tap, and Use puts that tempo on the selected
 *   counts or the tempo stretch under the playhead (TapTempo.tsx).
 */
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
    GaugeIcon,
    MinusIcon,
    PlusIcon,
    TrashIcon,
    TrendDownIcon,
    CheckIcon,
    TrendUpIcon,
    XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useTranslate } from "@tolgee/react";
import { formatBinding } from "@/shortcuts/bindings";
import Shortcut from "@/components/ui/Shortcut";
import { isMacPlatform } from "@/shortcuts/platform";
import { queryClient } from "@/App";
import { allMarchersQueryOptions } from "@/hooks/queries/useMarchers";
import { historyKeys } from "@/hooks/queries/useHistory";
import { subscribeHistoryChanges } from "@/db-functions/history";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { workspaceSettingsKeys } from "@/hooks/queries/useWorkspaceSettings";
import { useAudioEnvelopeStore } from "@/timeline/timelineWaveform";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import {
    audioContextRef,
    getLivePlaybackPosition,
    getLivePlaybackRate,
    LIVE_LEAD,
} from "@/components/timeline/audio/AudioPlayer";
import type {
    TimelineBand,
    TimelineBandGeometry,
} from "@/components/timeline/TimelineBand";
import {
    rampLengths,
    keepInPlaceLengths,
    newCountLength,
    retime,
    startsOf,
    type TempoEditResult,
    type TempoSegment,
} from "./tempoMath";
import {
    changesFrom,
    curveAt,
    curveThrough,
    endTempo,
    laneTempos,
    rampMiddle,
    rampTempos,
    shapeOf,
    stretchesOf,
    temposOf,
    typedChanges,
} from "./tempoShape";
import {
    deleteCounts,
    endMovesEarly,
    insertCounts,
    moveRehearsalMark,
    readHiddenSets,
    readMoves,
    type MoveSpan,
    setMeasureNumber as writeMeasureNumber,
    setRehearsalMark,
    type CountEditResult,
} from "./tempoWrites";
import {
    METER_CHOICES,
    meterLabel,
    parseMeter,
    quarterBpmOf,
    readMeters,
    type MeasureMeter,
} from "./meters";
import { planMeter, writeMeter } from "./meterWrites";
import { createLabelPlacer, textWidth, type LabelBox } from "./bandLayout";
import { useTempoModeStore } from "./tempoModeStore";
import { dialogHasKeys } from "./tempoShortcuts";
import { afterCountEdit } from "./countEditEffects";
import {
    ContextMenu,
    CountAskPopover,
    FermataGlyph,
    InlineEditor,
    MarkGlyph,
    MeterGlyph,
    NumberGlyph,
    StepGlyph,
} from "./TempoPopovers";
import { TempoToolbar } from "./TempoToolbar";
import {
    CountAsk,
    CountRange,
    Editor,
    Gesture,
    Menu,
    TempoHover,
} from "./tempoBandTypes";
import {
    LANES,
    LANE_GUTTER,
    MARKS,
    MEASURES,
    MUSIC,
    TEMPO,
    TEMPO_BAND_HEIGHT,
    TEMPO_LINE_GRAB_PX,
    TempoHeaderSlot,
    beatAtX,
    cssColor,
    fontOf,
    useScrollWindow,
    xOf,
} from "./tempoLanesLayout";
import { CountChoice, useHeaderSlot, useTempoUi } from "./tempoUi";
import {
    NOTE_TOAST,
    TempoMeasure,
    commitEdit,
    saveHolds,
    useTempoData,
} from "./useTempoData";

export { useTempoModeStore };

/** The band the timeline draws in tempo mode */
export const TEMPO_BAND: TimelineBand = {
    height: TEMPO_BAND_HEIGHT,
    focus: true,
    header: <TempoHeaderSlot />,
    render: (geometry) => <TempoLanes geometry={geometry} />,
};

// ---------------------------------------------------------------------------------------------
// The lanes. Their state (tempoUi.ts), layout (tempoLanesLayout.tsx), data (useTempoData.ts),
// types (tempoBandTypes.ts), toolbar, help and popovers live beside this file.

// eslint-disable-next-line max-lines-per-function
function TempoLanes({ geometry }: { geometry: TimelineBandGeometry }) {
    const { top, width, pixelsPerBeat: ppb, beatCount } = geometry;
    const { t } = useTranslate();
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const win = useScrollWindow(rootRef);
    const headerSlot = useHeaderSlot((s) => s.element);
    const data = useTempoData(beatCount);
    const { fetchTimingObjects, pages } = useTimingObjects();
    const refetch = useCallback(async () => {
        await fetchTimingObjects();
        await queryClient.invalidateQueries({
            queryKey: workspaceSettingsKeys.all(),
        });
    }, [fetchTimingObjects]);
    const envelope = useAudioEnvelopeStore((s) => s.envelope);
    const ui = useTempoUi();
    const playing = useIsPlaying();
    const isPlaying = playing?.isPlaying ?? false;
    const playheadBeat = useTimelineSelectionStore((s) => s.playheadBeat);
    const [preview, setPreview] = useState<
        (TempoEditResult & { changes?: ReadonlySet<number> }) | null
    >(null);
    const [gesture, setGesture] = useState<Gesture | null>(null);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [ask, setAsk] = useState<CountAsk | null>(null);
    const [busy, setBusy] = useState(false);
    /** The counts the menu item under the pointer would change */
    const [menuRange, setMenuRange] = useState<CountRange | null>(null);
    useEffect(() => {
        if (!menu) setMenuRange(null);
    }, [menu]);
    /**
     * The show's timing as the lanes read it, as text: it changes when an edit, an undo or a redo
     * lands (not when the view only scrolls or zooms)
     */
    const dataKey = useMemo(
        () =>
            [
                data.storedCount,
                data.durations.slice(0, data.storedCount + 1).join(),
                [...data.holds].join(),
                data.measures
                    .map((m) => `${m.id}:${m.start}:${m.mark}:${m.meter}`)
                    .join(),
            ].join("|"),
        [data],
    );
    // The add/remove box's choices were worked out from the counts as they were: a change
    // closes it rather than leave them to undo it
    useEffect(() => setAsk(null), [dataKey]);
    /** What a menu item, an open editor or the add/remove box is about to change */
    const highlight = menuRange ?? editor?.range ?? ask?.range ?? null;
    /** A hover explanation (a red dot) */
    const [tip, setTip] = useState<{
        x: number;
        y: number;
        text: string;
    } | null>(null);
    /** What's under the pointer in the tempo lane: a line highlights, a stretch shows its handle */
    const [hover, setHover] = useState<TempoHover | null>(null);
    // It explains what was under the pointer: scrolling or zooming moves that away
    useEffect(() => setTip(null), [win.left, ppb]);

    /** Counts every change to the show's history (an edit, an undo, a redo) */
    const historyVersion = useRef(0);
    // Tempo edits aren't mutations, so the title bar's undo and redo don't hear of them otherwise
    useEffect(
        () =>
            subscribeHistoryChanges(() => {
                historyVersion.current++;
                void queryClient.invalidateQueries({
                    queryKey: historyKeys.all(),
                });
            }),
        [],
    );
    // leaving tempo mode clears the selection, tap tempo and the last note
    useEffect(
        () => () => {
            const state = useTempoUi.getState();
            state.setRange(null);
            state.setTapOpen(false);
            state.resetTaps();
            toast.dismiss(NOTE_TOAST);
        },
        [],
    );

    const durations = preview?.durations ?? data.durations;
    const starts = useMemo(() => startsOf(durations), [durations]);
    // Eighths per count, from each measure's grouping (2 = a quarter): the tempo lane reads in
    // quarter notes, so 7/8 as 2+2+3 at ♩=176 reads 176, not a sawtooth
    // Each measure's time signature: written on it, or carried on from the last one written
    const meters = useMemo(() => readMeters(data.measures), [data.measures]);
    const meterOf = useCallback(
        (m: (typeof data.measures)[number]): MeasureMeter =>
            meters[data.measures.indexOf(m)]!,
        [data.measures, meters],
    );
    const units = useMemo(() => {
        const out: number[] = [];
        data.measures.forEach((m, i) =>
            meters[i]!.units.forEach((u, j) => (out[m.start + j] = u)),
        );
        return out;
    }, [data.measures, meters]);
    /** Count `b`'s tempo, in quarter notes per minute */
    const qBpm = useCallback(
        (b: number, d: readonly number[] = durations) =>
            quarterBpmOf(d[b]!, units[b] ?? 2),
        [durations, units],
    );
    /** Each stored count's tempo as the lane reads it (see laneTempos). Index 0 is unused. */
    const laneBpms = useCallback(
        (lengths: readonly number[]) =>
            laneTempos(lengths, units, data.holds, data.durations.length),
        [data.durations.length, data.holds, units],
    );
    /**
     * Where tempo changes start: the lane's points. A show with none stored yet gets them read
     * from its counts; the first edit stores them, so they stay put from then on.
     */
    const changes = useMemo(
        () =>
            data.changes.size
                ? data.changes
                : changesFrom(laneBpms(data.durations)),
        [data.changes, data.durations, laneBpms],
    );
    // The stretches between the points, each with the shape its counts make. Read against the
    // points as stored, so a stretch keeps its ends while it's dragged.
    const segmentsOf = useCallback(
        (
            lengths: readonly number[],
            at: ReadonlySet<number> = changes,
        ): TempoSegment[] => {
            const bpms = laneBpms(lengths);
            return stretchesOf(bpms, at, bpms.length).map(
                ({ from, to, shape }) => ({
                    from,
                    to,
                    bpmFrom:
                        shape.kind === "steady"
                            ? shape.bpm
                            : shape.kind === "ramp"
                              ? shape.from
                              : bpms[from]!,
                    bpmTo:
                        shape.kind === "steady"
                            ? shape.bpm
                            : shape.kind === "ramp"
                              ? shape.to
                              : bpms[to - 1]!,
                    ramp: shape.kind === "ramp",
                    uneven: shape.kind === "uneven",
                    curve: shape.kind === "ramp" ? shape.curve : undefined,
                }),
            );
        },
        [laneBpms, changes],
    );
    const segments = useMemo(
        () => segmentsOf(durations, preview?.changes),
        [segmentsOf, durations, preview?.changes],
    );
    /** The stretches as stored: what an edit in progress starts from */
    const storedSegments = useMemo(
        () => segmentsOf(data.durations),
        [segmentsOf, data.durations],
    );

    // Visible spec beats
    const firstBeat = Math.max(1, Math.floor(beatAtX(win.left, ppb)) - 1);
    const lastBeat = Math.min(
        durations.length - 1,
        Math.ceil(beatAtX(win.left + win.width, ppb)) + 1,
    );

    // The tempo lane's scale: the show's range (holds left out), with room
    const bpmScale = useMemo(() => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let b = 1; b < durations.length; b++) {
            if (data.holds.has(b)) continue;
            const bpm = qBpm(b);
            if (bpm < lo) lo = bpm;
            if (bpm > hi) hi = bpm;
        }
        if (!Number.isFinite(lo)) return { lo: 60, hi: 180 };
        const pad = Math.max(12, (hi - lo) * 0.2);
        return { lo: Math.max(10, lo - pad), hi: hi + pad };
    }, [durations, data.holds, qBpm]);
    const yOfBpm = useCallback(
        (bpm: number) =>
            TEMPO.top +
            4 +
            Math.min(
                1,
                Math.max(
                    0,
                    1 - (bpm - bpmScale.lo) / (bpmScale.hi - bpmScale.lo),
                ),
            ) *
                (TEMPO.height - 8),
        [bpmScale],
    );

    /**
     * A stretch's curve handle (band px), or null if it has none: a ramp's at its middle; a
     * steady stretch's at the end of its line, before the jump to the next tempo (Logic's corner).
     * An uneven stretch, or one with no jump after it, can't bend.
     */
    /**
     * The tempo line's height at `beat` (fractional). A ramp is drawn smooth through the middle
     * of each count, the way Logic draws its curves, though each count plays at one tempo; an
     * uneven stretch keeps its steps, which say where the counts are.
     */
    const tempoYAt = useCallback(
        (beat: number) => {
            const b = Math.floor(beat);
            const s = segments.find((x) => b >= x.from && b < x.to);
            if (!s?.ramp) return yOfBpm(qBpm(b));
            const n = s.to - s.from;
            const t =
                n <= 1
                    ? 0
                    : Math.min(1, Math.max(0, (beat - s.from - 0.5) / (n - 1)));
            return yOfBpm(
                s.bpmFrom + (s.bpmTo - s.bpmFrom) * curveAt(t, s.curve ?? 0),
            );
        },
        [segments, yOfBpm, qBpm],
    );
    /** Draws the tempo line over count `b` onto `ctx`'s path, from wherever the pen is */
    const traceCount = useCallback(
        (
            ctx: CanvasRenderingContext2D,
            b: number,
            X: (beat: number) => number,
            pen: boolean,
        ) => {
            const ramp = segments.some(
                (x) => x.ramp && b >= x.from && b < x.to,
            );
            if (!ramp) {
                const y = tempoYAt(b);
                if (!pen) ctx.moveTo(X(b), y);
                else ctx.lineTo(X(b), y);
                ctx.lineTo(X(b + 1), y);
                return;
            }
            const steps = Math.max(2, Math.ceil(ppb / 3));
            for (let i = 0; i <= steps; i++) {
                const beat = b + i / steps;
                const y = tempoYAt(Math.min(beat, b + 0.999999));
                if (i === 0 && !pen) ctx.moveTo(X(beat), y);
                else ctx.lineTo(X(beat), y);
            }
        },
        [segments, tempoYAt, ppb],
    );
    const curveHandleOf = useCallback(
        (s: TempoSegment) => {
            const counts = s.to - s.from;
            if (!s.ramp) return null;
            return {
                x: xOf(s.from + (counts - 1) / 2, ppb) + ppb / 2,
                y: yOfBpm(rampMiddle(s.bpmFrom, s.bpmTo, s.curve ?? 0)),
                target: s.bpmTo,
            };
        },
        [ppb, yOfBpm],
    );
    /**
     * A stretch's end dot, on its last count: dragging it sets the tempo the stretch ends on (a
     * ramp from its start), so it can stop short of the next tempo and jump back (a tempo)
     */
    const endHandleOf = useCallback(
        (s: TempoSegment) => {
            // not where it can't change anything (a hold keeps its length), nor zoomed out so far
            // it would sit on the next change's point
            if (s.uneven || s.to - s.from < 3 || ppb < 12) return null;
            if (data.holds.has(s.to - 1)) return null;
            return {
                x: xOf(s.to - 1, ppb) + ppb / 2,
                y: yOfBpm(s.bpmTo),
            };
        },
        [ppb, yOfBpm, data.holds],
    );

    // A count whose tempo jumps one way and back is probably one misplaced count line
    const outliers = useMemo(() => {
        const out: {
            beat: number;
            bpm: number;
            before: number;
            after: number;
        }[] = [];
        for (
            let b = Math.max(2, firstBeat);
            b <= lastBeat && b + 1 < data.storedCount;
            b++
        ) {
            if (
                data.holds.has(b) ||
                data.holds.has(b - 1) ||
                data.holds.has(b + 1)
            )
                continue;
            const a = qBpm(b - 1);
            const m = qBpm(b);
            const c = qBpm(b + 1);
            const up = (m - a) / a;
            const down = (c - m) / m;
            if (
                Math.abs(up) > 0.08 &&
                Math.abs(down) > 0.08 &&
                Math.sign(up) !== Math.sign(down)
            )
                out.push({ beat: b, bpm: m, before: a, after: c });
        }
        return out;
    }, [data.holds, data.storedCount, firstBeat, lastBeat, qBpm]);

    /** Edits waiting for, or being, written: one at a time, in order */
    const queue = useRef<Promise<void>>(Promise.resolve());
    const pending = useRef(0);
    /**
     * Write an edit after any still being written. Each edit was worked out from the show as it
     * was when it was made, so one made before the show changed (an edit still saving, an undo)
     * isn't written: it would undo that change. It says so instead.
     */
    const run = useCallback(
        (label: string, work: () => Promise<unknown>): Promise<void> => {
            const madeAt = historyVersion.current;
            pending.current++;
            setBusy(true);
            const job = queue.current.then(async () => {
                try {
                    if (historyVersion.current !== madeAt) {
                        toast.error(
                            t("tempoMode.band.toast.changedFirst", {
                                action: label,
                            }),
                        );
                        return;
                    }
                    await work();
                } catch (e) {
                    toast.error(
                        t("tempoMode.band.toast.failed", {
                            action: label,
                            error: e instanceof Error ? e.message : String(e),
                        }),
                    );
                } finally {
                    if (--pending.current === 0) {
                        setBusy(false);
                        setPreview(null);
                    }
                }
            });
            queue.current = job;
            return job;
        },
        [t],
    );
    const commit = useCallback(
        (
            label: string,
            result:
                | (TempoEditResult & { changes?: ReadonlySet<number> })
                | null,
        ) => {
            if (!result) {
                toast.error(
                    t("tempoMode.band.toast.tooFastOrSlow", { action: label }),
                );
                setPreview(null);
                return;
            }
            setPreview(result);
            void run(label, () => commitEdit(data, result, refetch, changes));
        },
        [data, refetch, run, changes, t],
    );

    // ---- drawing -------------------------------------------------------------------------
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.min(win.width, width));
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(TEMPO_BAND_HEIGHT * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${TEMPO_BAND_HEIGHT}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, TEMPO_BAND_HEIGHT);
        const root = rootRef.current;
        const text = cssColor(root, "--color-text", "#222");
        const accent = cssColor(root, "--color-accent", "#6442ff");
        const subtle = cssColor(
            root,
            "--color-text-subtitle",
            "rgba(0,0,0,.5)",
        );
        const stroke = cssColor(root, "--color-stroke", "rgba(0,0,0,.1)");
        const red = cssColor(root, "--color-red", "#b03333");
        const ox = -win.left;
        const X = (b: number) => xOf(b, ppb) + ox;

        ctx.fillStyle = stroke;
        ctx.fillRect(0, TEMPO.top, w, 1);
        ctx.fillRect(0, MUSIC.top, w, 1);
        ctx.fillRect(0, MEASURES.top, w, 1);

        // the selection, or the one being dragged out (shown as it grows, not only on release)
        const shownRange =
            gesture?.kind === "range" && gesture.to !== gesture.anchor
                ? {
                      from: Math.min(gesture.anchor, gesture.to),
                      to: Math.max(gesture.anchor, gesture.to),
                  }
                : ui.range;
        if (shownRange) {
            ctx.fillStyle = accent;
            ctx.globalAlpha = 0.1;
            ctx.fillRect(
                X(shownRange.from),
                MARKS.top,
                (shownRange.to - shownRange.from) * ppb,
                TEMPO_BAND_HEIGHT - MARKS.top,
            );
            ctx.globalAlpha = 1;
        }
        // what the menu item, editor or add/remove box at hand would change: outlined
        if (highlight) {
            ctx.save();
            ctx.fillStyle = accent;
            ctx.strokeStyle = accent;
            if (highlight.to > highlight.from) {
                const x0 = X(highlight.from);
                const w = (highlight.to - highlight.from) * ppb;
                ctx.globalAlpha = 0.2;
                ctx.fillRect(
                    x0,
                    MEASURES.top,
                    w,
                    TEMPO_BAND_HEIGHT - MEASURES.top,
                );
                ctx.globalAlpha = 1;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(
                    x0 + 0.75,
                    MEASURES.top + 0.75,
                    w - 1.5,
                    TEMPO_BAND_HEIGHT - MEASURES.top - 1.5,
                );
            } else {
                // a spot between two counts (adding a count there)
                ctx.fillRect(
                    X(highlight.from) - 1.5,
                    MEASURES.top,
                    3,
                    TEMPO_BAND_HEIGHT - MEASURES.top,
                );
            }
            ctx.restore();
        }

        // the waveform, count by count: each count's slice of the music fills its width
        if (envelope) {
            const mid = MUSIC.top + MUSIC.height / 2;
            const half = MUSIC.height / 2 - 8;
            const { peaks, rate } = envelope;
            // scale to the loudest bit of the show, so quiet recordings still read
            let loud = 0;
            for (let i = 0; i < peaks.length; i += 7)
                if (peaks[i]! > loud) loud = peaks[i]!;
            const gain = loud > 0 ? 0.95 / loud : 1;
            ctx.fillStyle = subtle;
            ctx.globalAlpha = 0.55;
            for (
                let b = firstBeat;
                b <= lastBeat && b < durations.length;
                b++
            ) {
                const x0 = X(b);
                const t0 = starts[b]!;
                const t1 = starts[b + 1] ?? t0 + durations[b]!;
                const cols = Math.max(1, Math.round(ppb));
                for (let c = 0; c < cols; c++) {
                    const ta = t0 + ((t1 - t0) * c) / cols;
                    const tb = t0 + ((t1 - t0) * (c + 1)) / cols;
                    let peak = 0;
                    const ia = Math.max(0, Math.floor(ta * rate));
                    const ib = Math.min(peaks.length, Math.ceil(tb * rate));
                    for (let i = ia; i < ib; i++)
                        if (peaks[i]! > peak) peak = peaks[i]!;
                    const h = Math.max(0.5, Math.min(1, peak * gain) * half);
                    ctx.fillRect(x0 + c, mid - h, 1, h * 2);
                }
            }
            ctx.globalAlpha = 1;
        }

        // count lines: faint, downbeats stronger
        const downbeats = new Set(data.measures.map((m) => m.start));
        for (let b = firstBeat; b <= lastBeat; b++) {
            const x = Math.round(X(b)) + 0.5;
            const down = downbeats.has(b);
            if (ppb < 6 && !down) continue;
            ctx.save();
            ctx.strokeStyle = text;
            ctx.globalAlpha = down ? 0.5 : 0.16;
            ctx.beginPath();
            ctx.moveTo(x, TEMPO.top);
            ctx.lineTo(x, MUSIC.top + MUSIC.height);
            ctx.stroke();
            ctx.restore();
        }

        // Unevenly grouped measures (7/8 as 2+2+3): the axis draws every count the same width, so each count
        // gets a bracket along the foot of the measures lane with its eighths in it ("2 2 3"), and
        // the long counts are in the accent (sam: "I can't see the long third count")
        for (const m of data.measures) {
            if (m.start > lastBeat || m.start + m.counts < firstBeat) continue;
            const g = Array.from(
                { length: m.counts },
                (_, i) => units[m.start + i],
            );
            if (g.some((u) => u === undefined)) continue;
            // Only uneven counts get brackets: in 6/8 (3+3) or plain quarters every count is the
            // same, and "3 3" under each bar read as triplets (owner, 2026-11-04)
            if (g.every((u) => u === g[0])) continue;
            const shortest = Math.min(...g);
            g.forEach((u, i) => {
                const x0 = X(m.start + i);
                const inset = Math.min(3, ppb * 0.15);
                const span = ppb - 2 * inset;
                if (span < 3) return;
                const long = u > shortest;
                const y = MEASURES.top + MEASURES.height - 2;
                ctx.save();
                ctx.fillStyle = long ? accent : subtle;
                ctx.globalAlpha = long ? 1 : 0.75;
                // a bracket under the count, as a tuplet's, with its eighths in the middle
                const digit = String(u);
                const roomy = span >= 14;
                ctx.font = `bold 9px ${fontOf(root)}`;
                const tw = roomy ? ctx.measureText(digit).width + 4 : 0;
                const mid = x0 + ppb / 2;
                ctx.fillRect(x0 + inset, y, span / 2 - tw / 2, 1.5);
                ctx.fillRect(mid + tw / 2, y, span / 2 - tw / 2, 1.5);
                ctx.fillRect(x0 + inset, y - 3, 1, 3);
                ctx.fillRect(x0 + inset + span - 1, y - 3, 1, 3);
                if (roomy) {
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(digit, mid, y);
                }
                ctx.restore();
            });
        }

        // holds: the count shaded, with a fermata (an arc over a dot)
        ctx.fillStyle = accent;
        ctx.strokeStyle = accent;
        for (const b of data.holds) {
            if (b < firstBeat || b > lastBeat) continue;
            ctx.globalAlpha = 0.08;
            ctx.fillRect(
                X(b),
                TEMPO.top,
                ppb,
                MUSIC.top + MUSIC.height - TEMPO.top,
            );
            ctx.globalAlpha = 1;
            // centred on the count, as its "hold" label is
            const cx = X(b) + ppb / 2;
            const cy = TEMPO.top + 22;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, 6, Math.PI, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy - 1.5, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // the stretch the pointer is on, or being dragged: a soft band under its line
        const lit =
            gesture?.kind === "tempo"
                ? gesture.segment
                : gesture
                  ? null
                  : hover?.kind === "line"
                    ? hover.stretch
                    : null;
        if (lit) {
            ctx.save();
            ctx.strokeStyle = accent;
            ctx.globalAlpha = 0.25;
            ctx.lineWidth = 8;
            ctx.lineCap = "round";
            ctx.beginPath();
            for (
                let b = Math.max(lit.from, firstBeat);
                b < lit.to && b <= lastBeat && b < durations.length;
                b++
            ) {
                if (data.holds.has(b)) continue;
                traceCount(ctx, b, X, false);
            }
            ctx.stroke();
            ctx.restore();
        }

        // the tempo line: steps, ramps drawn smooth, gaps at holds
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        let pen = false;
        for (let b = firstBeat; b <= lastBeat && b < durations.length; b++) {
            if (data.holds.has(b)) {
                pen = false;
                continue;
            }
            traceCount(ctx, b, X, pen);
            pen = true;
        }
        ctx.stroke();

        // the tempo changes' points; the stretch under the pointer shows its curve handle
        ctx.fillStyle = accent;
        for (const s of segments) {
            if (s.from <= 1 || s.from < firstBeat || s.from > lastBeat)
                continue;
            const big =
                hover?.kind === "point" && hover.stretch.from === s.from;
            ctx.beginPath();
            ctx.arc(
                X(s.from),
                yOfBpm(s.bpmFrom),
                big ? 5 : 3.5,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
        const handleFor =
            gesture?.kind === "curve" || gesture?.kind === "end"
                ? gesture.stretch.from
                : !gesture && hover
                  ? hover.stretch.from
                  : null;
        if (handleFor !== null) {
            const i = segments.findIndex((s) => s.from === handleFor);
            const h = i >= 0 ? curveHandleOf(segments[i]!) : null;
            if (h) {
                ctx.save();
                ctx.strokeStyle = accent;
                ctx.fillStyle = cssColor(root, "--color-modal", "#fff");
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(
                    h.x + ox,
                    h.y,
                    hover?.kind === "curve" || gesture?.kind === "curve"
                        ? 5.5
                        : 4,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
            // the end dot: a small square, so it isn't taken for the curve handle or a point
            const end = i >= 0 ? endHandleOf(segments[i]!) : null;
            if (end) {
                const big = hover?.kind === "end" || gesture?.kind === "end";
                const r = big ? 5 : 3.5;
                ctx.save();
                ctx.strokeStyle = accent;
                ctx.fillStyle = cssColor(root, "--color-modal", "#fff");
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.rect(end.x + ox - r, end.y - r, r * 2, r * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
        }

        // a count whose tempo jumps one way and back (hover one for why)
        ctx.fillStyle = red;
        for (const o of outliers) {
            ctx.beginPath();
            ctx.arc(X(o.beat) + ppb / 2, yOfBpm(o.bpm), 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }, [
        qBpm,
        units,
        win,
        width,
        ppb,
        envelope,
        durations,
        starts,
        data.measures,
        data.holds,
        firstBeat,
        lastBeat,
        yOfBpm,
        gesture,
        hover,
        segments,
        curveHandleOf,
        endHandleOf,
        traceCount,
        outliers,
        highlight,
        ui.range,
    ]);

    // ---- helpers -------------------------------------------------------------------------
    const localX = (e: { clientX: number }) =>
        e.clientX - rootRef.current!.getBoundingClientRect().left;
    const localY = (e: { clientY: number }) =>
        e.clientY - rootRef.current!.getBoundingClientRect().top;
    const segmentAt = (beat: number) =>
        segments.find((s) => beat >= s.from && beat < s.to) ?? null;
    const measureAt = (beat: number) => {
        let found = data.measures[0];
        for (const m of data.measures) if (m.start <= beat) found = m;
        return found ?? null;
    };
    const measureLabel = (beat: number) => {
        const m = measureAt(beat);
        return m
            ? t("tempoMode.band.label.measureCount", {
                  measure: String(m.number),
                  count: String(beat - m.start + 1),
              })
            : t("tempoMode.band.label.count", { count: String(beat) });
    };
    /** The measure holding `beat`, "m. 11" (or its count, before the first measure) */
    const measureOnlyLabel = (beat: number) => {
        const m = measureAt(beat);
        return m
            ? t("tempoMode.band.label.measure", {
                  measure: String(m.number),
              })
            : measureLabel(beat);
    };
    /** Counts `from`..`to - 1` in measure words: "m. 11 count 1 to m. 12 count 4" */
    const rangeLabel = (from: number, to: number) =>
        to - from <= 1
            ? measureLabel(from)
            : t("tempoMode.band.label.range", {
                  from: measureLabel(from),
                  to: measureLabel(to - 1),
              });
    /** Counts `from`..`to - 1` in measures: "m. 11–12" */
    const measuresLabel = (from: number, to: number) => {
        const a = measureAt(from)?.number;
        const b = measureAt(Math.max(from, to - 1))?.number;
        if (a === undefined || b === undefined) return rangeLabel(from, to);
        return a === b
            ? t("tempoMode.band.label.measure", { measure: String(a) })
            : t("tempoMode.band.label.measures", {
                  from: String(a),
                  to: String(b),
              });
    };
    // Play loops the selected measures (owner, 2026-10-30): the transport reads them, and the
    // Play button's tooltip names them
    const loopLabel = ui.range
        ? measuresLabel(ui.range.from, ui.range.to)
        : null;
    useEffect(() => {
        const range = useTempoUi.getState().range;
        useTempoModeStore
            .getState()
            .setLoop(
                range && loopLabel !== null
                    ? { ...range, label: loopLabel }
                    : null,
            );
    }, [ui.range, loopLabel]);
    useEffect(() => () => useTempoModeStore.getState().setLoop(null), []);
    /**
     * Where a tempo change from `beat` stops: the end of its tempo segment, or the next hold if
     * that comes first (holds past it are never touched)
     */
    const tempoStretchEnd = (beat: number) => {
        let end = segmentAt(beat)?.to ?? beat + 1;
        for (const h of data.holds) if (h > beat && h < end) end = h;
        return Math.max(beat + 1, end);
    };
    /** The tempo the music goes on at after `end` (past any holds), or null past the counts */
    const tempoAfter = (end: number) => {
        let b = end;
        while (data.holds.has(b)) b++;
        return b < data.durations.length ? qBpm(b, data.durations) : null;
    };
    const bpmText = (bpm: number) => `♩${Math.round(bpm * 10) / 10}`;
    /** The music heard now */
    const audible = () =>
        getLivePlaybackPosition() -
        (LIVE_LEAD + (audioContextRef?.outputLatency ?? 0)) *
            getLivePlaybackRate();

    // ---- tempo edits ---------------------------------------------------------------------
    // Holds keep their length through every tempo edit
    const setTempo = (
        from: number,
        to: number,
        bpmFrom: number,
        bpmTo: number,
    ) => {
        const result = retime(
            data.durations,
            from,
            to,
            // quarter-note tempos; a count of a grouping is as long as its eighths
            rampLengths(to - from, bpmFrom, bpmTo).map(
                (l, i) => (l * (units[from + i] ?? 2)) / 2,
            ),
            { fixed: data.holds },
        );
        // the counts typed for are a stretch of their own: the points inside go, one at each end
        const typed = typedChanges(changes, from, to, data.durations.length);
        commit(t("tempoMode.band.action.tempo"), {
            ...result,
            changes: typed,
        });
    };
    /** "120" or "120-90" as tempos, or why it isn't one (priya: say the range) */
    const parseTempo = (
        value: string,
    ): { tempo: [number, number] } | { error: string } => {
        const m = value
            .trim()
            .match(/^(\d+(?:\.\d+)?)\s*(?:(?:-|>|→|to)\s*(\d+(?:\.\d+)?))?$/);
        if (!m)
            return {
                error: t("tempoMode.band.editor.notATempo", { value }),
            };
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        return a >= 20 && a <= 400 && b >= 20 && b <= 400
            ? { tempo: [a, b] }
            : {
                  error: t("tempoMode.band.editor.tempoOutOfRange", { value }),
              };
    };
    /** A tempo segment's tempo as the editor shows it: "120", or "120-90" for a gradual one */
    const segmentText = (s: TempoSegment) =>
        s.ramp
            ? `${Math.round(s.bpmFrom)}-${Math.round(s.bpmTo)}`
            : `${Math.round(s.bpmFrom * 10) / 10}`;
    /**
     * Type a tempo for counts `from`..`to - 1`; `whole`, when it's longer, is the whole tempo stretch
     * around them, offered as a link to edit instead
     */
    const editTempo = (
        e: { clientX: number; clientY: number },
        from: number,
        to: number,
        current: string,
        whole?: TempoSegment | null,
    ) =>
        setEditor({
            x: e.clientX,
            y: e.clientY,
            value: current,
            hint:
                to - from <= 1
                    ? t("tempoMode.band.editor.tempoOfHint", {
                          where: measureLabel(from),
                      })
                    : t("tempoMode.band.editor.tempoFromToHint", {
                          from: measureLabel(from),
                          to: measureLabel(to - 1),
                      }),
            range: { from, to },
            onCommit: (value) => {
                const parsed = parseTempo(value);
                if ("tempo" in parsed)
                    setTempo(from, to, parsed.tempo[0], parsed.tempo[1]);
                else toast.error(parsed.error);
            },
            extra:
                whole && (whole.from !== from || whole.to !== to)
                    ? {
                          label: t("tempoMode.band.editor.wholeStretch", {
                              range: rangeLabel(whole.from, whole.to),
                              tempo: segmentText(whole),
                          }),
                          onSelect: () =>
                              editTempo(
                                  e,
                                  whole.from,
                                  whole.to,
                                  segmentText(whole),
                              ),
                      }
                    : undefined,
        });

    // ---- adding and removing counts ------------------------------------------------------
    // For when the music has an extra or a missing beat: the recording never changes. A breath in
    // the drill with the music as it is ("hold the drill here") ends a move early instead.
    const countEdit = (
        label: string,
        work: () => Promise<CountEditResult>,
        keptText?: (kept: number) => string,
    ) =>
        void run(label, async () => {
            const result = await work();
            await refetch();
            afterCountEdit(result, queryClient);
            const parts = [label];
            if (result.kept)
                parts.push(
                    keptText?.(result.kept) ??
                        t("tempoMode.band.toast.movesKept", {
                            count: result.kept,
                        }),
                );
            if (result.couldNotKeep)
                parts.push(
                    t("tempoMode.band.toast.movesCouldNotKeep", {
                        count: result.couldNotKeep,
                    }),
                );
            toast.success(parts.join(". "));
        });
    /** The stretch "keep everything else in place" re-divides: the measure holding `beat` */
    const keepSpan = (beat: number) => {
        const m = measureAt(beat);
        return { a: m?.start ?? 1, e: (m?.start ?? beat) + (m?.counts ?? 1) };
    };
    /** The page holding count `beat` (spec beat) */
    const pageAt = (beat: number) =>
        pages.find((p) => {
            const start = p.beats[0]?.index;
            return (
                start !== undefined &&
                p.counts > 0 &&
                start <= beat &&
                beat < start + p.counts
            );
        }) ?? null;
    const isPageStart = (beat: number) =>
        pages.some((p) => p.counts > 0 && p.beats[0]?.index === beat);
    /** A move by the page it starts on: "Page 11" */
    const moveName = (m: MoveSpan) => {
        const p = pageAt(m.start);
        return p
            ? t("tempoMode.band.move.page", { page: p.name })
            : t("tempoMode.band.move.from", { where: measureLabel(m.start) });
    };
    /** A move as the subject of a sentence: "Its move" when it is the page's own */
    const whoseMove = (m: MoveSpan, own: boolean) => {
        if (own) return t("tempoMode.band.move.its");
        const p = pageAt(m.start);
        return p
            ? t("tempoMode.band.move.pagesMove", { page: p.name })
            : t("tempoMode.band.move.from", { where: measureLabel(m.start) });
    };
    /** "m. 103 count 4, before C" when a rehearsal mark starts right after */
    const holdSpot = (end: number) => {
        const next = data.measures.find((m) => m.start === end);
        return next?.mark
            ? t("tempoMode.band.label.beforeMark", {
                  where: measureLabel(end - 1),
                  mark: next.mark,
              })
            : measureLabel(end - 1);
    };
    /** A page's counts before and after an edit: "Page 11: 8 → 9 counts" */
    const pageCountsText = (name: string, from: number, to: number) =>
        t("tempoMode.band.ask.pageCounts", {
            page: name,
            from: String(from),
            to,
        });
    const readMovesSafely = () => readMoves().catch(() => [] as MoveSpan[]);

    const askAdd = async (
        e: { clientX: number; clientY: number },
        at: number,
        count: number,
        /** The box's title ("Add a count before …") and the toast once done ("Added …") */
        what: { title: string; done: string },
        /** The counts are a new measure before the measure starting at `at` */
        asMeasure = false,
    ) => {
        // a whole measure has no stretch of music to fit into: it can only shift what's after
        const span = count > 1 ? null : keepSpan(at === 1 ? 1 : at - 1);
        const len = newCountLength(data.durations, data.holds, at);
        const moves = await readMovesSafely();
        const page = pageAt(Math.max(1, at - 1));
        const pageText = t("tempoMode.band.ask.pagesSentence", {
            pages: page
                ? pageCountsText(page.name, page.counts, page.counts + count)
                : t("tempoMode.band.ask.countsMore", { count }),
        });
        const whose = (m: MoveSpan) =>
            whoseMove(m, !!page && pageAt(m.start)?.name === page.name);
        // The moves the new counts lengthen: one running over the spot, or a page's own move
        // ending at a page boundary (the page before takes the count)
        const grows = moves.filter(
            (m) =>
                m.start < at &&
                (m.end > at || (m.end === at && isPageStart(at))),
        );
        const drill = (choice: CountChoice) => {
            if (grows.length === 0) return t("tempoMode.band.ask.add.noMove");
            if (grows.length === 1) {
                const m = grows[0]!;
                const n = m.end - m.start;
                return choice === "keep"
                    ? t("tempoMode.band.ask.add.oneKeep", {
                          move: whose(m),
                          moveCounts: n,
                          count,
                      })
                    : t("tempoMode.band.ask.add.oneShift", {
                          move: whose(m),
                          from: String(n),
                          to: n + count,
                      });
            }
            return choice === "keep"
                ? t("tempoMode.band.ask.add.manyKeep", {
                      moves: grows.length,
                      count,
                  })
                : t("tempoMode.band.ask.add.manyShift", {
                      moves: grows.length,
                      count,
                  });
        };
        const laterStay = t("tempoMode.band.ask.laterCountsStay");
        const starts = startsOf(data.durations);
        // The breath instead: the move over the spot ends a count early, no count added
        const breath =
            count === 1
                ? moves.filter(
                      (m) =>
                          m.start < at && m.end >= at && m.end - m.start >= 2,
                  )
                : [];
        /** What the breath does (the toast once it's done says just this) */
        const breathDone = () => {
            if (breath.length === 1) {
                const m = breath[0]!;
                const n = m.end - m.start;
                return t("tempoMode.band.ask.breath.one", {
                    move: moveName(m),
                    from: String(n),
                    to: n - 1,
                    where: holdSpot(m.end),
                });
            }
            return t("tempoMode.band.ask.breath.many", {
                moves: breath.length,
            });
        };
        const breathText = () =>
            [t("tempoMode.band.ask.breath.noCountAdded"), breathDone()].join(
                " ",
            );
        setAsk({
            x: e.clientX,
            y: e.clientY,
            boundary:
                count === 1 &&
                (isPageStart(at) || moves.some((m) => m.end === at)),
            title: what.title,
            intro: t("tempoMode.band.ask.add.intro"),
            range: { from: at, to: at },
            keep: span
                ? (() => {
                      const total = starts[span.e]! - starts[span.a]!;
                      const n = span.e - span.a;
                      const tempo = `${bpmText((n * 60) / total)} → ${bpmText(((n + count) * 60) / total)}`;
                      return {
                          text: [
                              t("tempoMode.band.ask.add.keepMeasure", {
                                  measure: measureOnlyLabel(span.a),
                                  count: n + count,
                                  tempo,
                              }),
                              laterStay,
                              pageText,
                              drill("keep"),
                          ].join(" "),
                          run: () => {
                              countEdit(
                                  what.done,
                                  () =>
                                      insertCounts({
                                          at,
                                          count,
                                          duration: len,
                                          drill: "keep",
                                          respaced: keepInPlaceLengths(
                                              data.durations,
                                              data.holds,
                                              span,
                                              {
                                                  kind: "insert",
                                                  at,
                                                  count,
                                                  len,
                                              },
                                          ),
                                          measure: asMeasure,
                                      }),
                                  (kept) =>
                                      t("tempoMode.band.toast.movesKeptHold", {
                                          kept,
                                          count,
                                      }),
                              );
                          },
                      };
                  })()
                : undefined,
            shift: {
                text: [
                    t("tempoMode.band.ask.add.shift", {
                        count,
                        seconds: (len * count).toFixed(2),
                    }),
                    pageText,
                    drill("shift"),
                ].join(" "),
                run: () =>
                    countEdit(what.done, () =>
                        insertCounts({
                            at,
                            count,
                            duration: len,
                            drill: "adjust",
                            measure: asMeasure,
                        }),
                    ),
            },
            hold:
                count !== 1 || asMeasure
                    ? undefined
                    : breath.length
                      ? {
                            text: breathText(),
                            run: () =>
                                void run(
                                    t("tempoMode.band.action.holdDrill"),
                                    async () => {
                                        await endMovesEarly({
                                            timelineIds: breath.map(
                                                (m) => m.id,
                                            ),
                                        });
                                        await refetch();
                                        toast.success(breathDone());
                                    },
                                ),
                        }
                      : {
                            text: t("tempoMode.band.ask.breath.none"),
                            disabled: t("tempoMode.band.ask.noMoveHere"),
                        },
        });
    };
    const askRemove = async (
        e: { clientX: number; clientY: number },
        from: number,
        to: number,
    ) => {
        const whole = to - from > 1;
        const what = whole ? rangeLabel(from, to) : measureLabel(from);
        const removed = to - from;
        const span = whole ? null : keepSpan(from);
        const moves = await readMovesSafely();
        const done = t("tempoMode.band.ask.removed", { where: what });
        // Refused up front, with the ways out: a keyframe would end on the flag where the move
        // under it ends, and win there over that move's set
        const hidden = await readHiddenSets({ from, to }).catch(() => []);
        if (hidden.length) {
            const marchers = await queryClient
                .fetchQuery(allMarchersQueryOptions())
                .catch(() => []);
            const nameOf = new Map(marchers.map((m) => [m.id, m.drill_number]));
            const names = [...new Set(hidden.flatMap((h) => h.marchers))].map(
                (id) => nameOf.get(id) ?? `#${id}`,
            );
            const shown = names.slice(0, 4).join(", ");
            const who =
                names.length > 4
                    ? t("tempoMode.band.ask.hidden.marchersMore", {
                          names: shown,
                          count: names.length - 4,
                      })
                    : shown;
            const under = moves.find((m) => m.id === hidden[0]!.underId);
            const move = under
                ? moveName(under)
                : t("tempoMode.band.ask.hidden.theMove");
            // Fewer: the most counts from `from` that hide nothing (one left after the keyframe)
            let fewerTo: number | null = null;
            for (let k = to - 1; k > from; k--) {
                const still = await readHiddenSets({ from, to: k }).catch(
                    () => hidden,
                );
                if (!still.length) {
                    fewerTo = k;
                    break;
                }
            }
            const tooShort = hidden.some((h) => h.counts < 2);
            setAsk({
                x: e.clientX,
                y: e.clientY,
                title: t("tempoMode.band.ask.remove.title", { where: what }),
                intro: "",
                range: { from, to },
                shift: { text: "", run: () => {} },
                blocked: {
                    title: t("tempoMode.band.ask.hidden.title", {
                        marchers: who,
                        move,
                    }),
                    text: t("tempoMode.band.ask.hidden.text", { move }),
                    fix: tooShort
                        ? {
                              text: "",
                              disabled: t(
                                  "tempoMode.band.ask.hidden.fixTooShort",
                              ),
                          }
                        : {
                              text: t("tempoMode.band.ask.hidden.fixHint", {
                                  move,
                              }),
                              run: () =>
                                  countEdit(done, () =>
                                      deleteCounts({
                                          from,
                                          to,
                                          drill: "adjust",
                                          endEarly: true,
                                      }),
                                  ),
                          },
                    fewer:
                        fewerTo === null
                            ? undefined
                            : {
                                  label: t("tempoMode.band.ask.hidden.fewer", {
                                      where: rangeLabel(from, fewerTo),
                                  }),
                                  text: t(
                                      "tempoMode.band.ask.hidden.fewerHint",
                                  ),
                                  run: () => {
                                      const k = fewerTo!;
                                      useTempoUi
                                          .getState()
                                          .setRange(
                                              k - from > 1
                                                  ? { from, to: k }
                                                  : null,
                                          );
                                      void askRemove(e, from, k);
                                  },
                              },
                },
            });
            return;
        }
        // A rehearsal mark that goes (as `carriedFacts` does): the measure left on the next count
        // keeps its own mark and takes the first one of the measures that go only when it has none
        const onSurvivor = data.measures.find((m) => m.start === to);
        const moving = data.measures.filter(
            (m) => m.start >= from && m.start < to,
        );
        const holder = onSurvivor ?? moving[0];
        const goneMarked = moving.filter((m) => m !== holder && m.mark);
        const lostMarks = holder?.mark ? goneMarked : goneMarked.slice(1);
        const warning = lostMarks.length
            ? t("tempoMode.band.ask.remove.marksGo", {
                  count: lostMarks.length,
                  marks: lostMarks.map((m) => m.mark).join(", "),
              })
            : undefined;
        const pagesHit = pages.filter((p) => {
            const start = p.beats[0]?.index;
            return (
                start !== undefined &&
                p.counts > 0 &&
                start < to &&
                start + p.counts > from
            );
        });
        const pageText = t("tempoMode.band.ask.pagesSentence", {
            pages: pagesHit.length
                ? pagesHit
                      .map((p) => {
                          const start = p.beats[0]!.index;
                          const lost =
                              Math.min(to, start + p.counts) -
                              Math.max(from, start);
                          return pageCountsText(
                              p.name,
                              p.counts,
                              p.counts - lost,
                          );
                      })
                      .join(", ")
                : t("tempoMode.band.ask.countsFewer", { count: removed }),
        });
        const whose = (m: MoveSpan) =>
            whoseMove(
                m,
                pagesHit.length === 1 &&
                    pageAt(m.start)?.name === pagesHit[0]!.name,
            );
        // The moves that lose counts: the ones running over a removed count
        const losing = moves.filter((m) => m.start < to && m.end > from);
        const drill = (choice: CountChoice) => {
            if (losing.length === 0)
                return t("tempoMode.band.ask.remove.noMove");
            if (losing.length === 1) {
                const m = losing[0]!;
                const n = m.end - m.start;
                return choice === "keep"
                    ? t("tempoMode.band.ask.remove.oneKeep", {
                          move: whose(m),
                          moveCounts: n,
                          count: removed,
                      })
                    : t("tempoMode.band.ask.remove.oneShift", {
                          move: whose(m),
                          count: removed,
                      });
            }
            return choice === "keep"
                ? t("tempoMode.band.ask.remove.manyKeep", {
                      moves: losing.length,
                  })
                : t("tempoMode.band.ask.remove.manyShift", {
                      moves: losing.length,
                  });
        };
        const starts = startsOf(data.durations);
        setAsk({
            x: e.clientX,
            y: e.clientY,
            title: t("tempoMode.band.ask.remove.title", { where: what }),
            intro: t("tempoMode.band.ask.remove.intro"),
            warning,
            range: { from, to },
            keep:
                span && span.e - span.a > removed
                    ? (() => {
                          const total = starts[span.e]! - starts[span.a]!;
                          const n = span.e - span.a;
                          const tempo = `${bpmText((n * 60) / total)} → ${bpmText(((n - removed) * 60) / total)}`;
                          return {
                              text: [
                                  t("tempoMode.band.ask.remove.keep", {
                                      where: measureOnlyLabel(span.a),
                                      from: String(n),
                                      to: n - removed,
                                      tempo,
                                  }),
                                  t("tempoMode.band.ask.laterCountsStay"),
                                  pageText,
                                  drill("keep"),
                              ].join(" "),
                              run: () => {
                                  countEdit(done, () =>
                                      deleteCounts({
                                          from,
                                          to,
                                          drill: "keep",
                                          respaced: keepInPlaceLengths(
                                              data.durations,
                                              data.holds,
                                              span,
                                              { kind: "delete", from, to },
                                          ),
                                      }),
                                  );
                              },
                          };
                      })()
                    : undefined,
            shift: {
                text: [
                    t("tempoMode.band.ask.remove.shift"),
                    pageText,
                    drill("shift"),
                ].join(" "),
                run: () =>
                    countEdit(done, () =>
                        deleteCounts({ from, to, drill: "adjust" }),
                    ),
            },
        });
    };

    // ---- measures and marks --------------------------------------------------------------
    const setMeasureNumber = (measure: TempoMeasure, value: string) => {
        const n = value.trim() === "" ? null : Number(value);
        if (n !== null && !Number.isInteger(n)) {
            toast.error(t("tempoMode.band.toast.notMeasureNumber", { value }));
            return;
        }
        void run(t("tempoMode.band.action.measureNumber"), async () => {
            await writeMeasureNumber({ measure, number: n });
            await refetch();
        });
    };
    const nextMarkName = () => {
        const used = new Set(data.measures.map((m) => m.mark).filter(Boolean));
        for (let c = 65; c < 91; c++) {
            const s = String.fromCharCode(c);
            if (!used.has(s)) return s;
        }
        return "";
    };
    const editMark = (
        e: { clientX: number; clientY: number },
        measure: TempoMeasure,
    ) => {
        setEditor({
            x: e.clientX,
            y: e.clientY,
            value: measure.mark ?? nextMarkName(),
            hint: t("tempoMode.band.editor.markHint", {
                measure: String(measure.number),
            }),
            range: { from: measure.start, to: measure.start + measure.counts },
            onCommit: (value) => {
                const mark = value.trim() || null;
                const write = () =>
                    void run(
                        t("tempoMode.band.action.rehearsalMark"),
                        async () => {
                            await setRehearsalMark({
                                measure,
                                mark,
                            });
                            await refetch();
                        },
                    );
                // The same letter twice is allowed, but not by accident
                const other =
                    mark === null
                        ? undefined
                        : data.measures.find(
                              (o) =>
                                  o.mark === mark &&
                                  o.id !== null &&
                                  o.start !== measure.start,
                          );
                if (!other || mark === null) return write();
                setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    title: t("tempoMode.band.menu.markTaken", {
                        mark,
                        measure: String(other.number),
                    }),
                    items: [
                        {
                            label: t("tempoMode.band.menu.markUseAgain", {
                                mark,
                                measure: String(measure.number),
                            }),
                            onSelect: write,
                        },
                        {
                            label: t("tempoMode.band.menu.markMoveHere", {
                                mark,
                                measure: String(other.number),
                            }),
                            onSelect: () =>
                                void run(
                                    t("tempoMode.band.action.rehearsalMark"),
                                    async () => {
                                        await moveRehearsalMark({
                                            fromId: other.id!,
                                            to: measure,
                                            mark,
                                        });
                                        await refetch();
                                    },
                                ),
                        },
                        {
                            label: t("tempoMode.band.menu.cancel"),
                            onSelect: () => {},
                        },
                    ],
                });
            },
        });
    };
    /** Number measures by hand from `measure` on */
    const renumber = (
        e: { clientX: number; clientY: number },
        measure: TempoMeasure,
    ) => {
        setEditor({
            x: e.clientX,
            y: e.clientY,
            value: String(measure.number),
            hint: t("tempoMode.band.editor.renumberHint", {
                measure: String(measure.number),
            }),
            range: { from: measure.start, to: measure.start + measure.counts },
            onCommit: (v) => setMeasureNumber(measure, v),
        });
    };
    /**
     * The measure a press at (`x`, `y`) in the marks or measures lane is about: the one whose
     * rehearsal mark, time signature or number is drawn there (zoomed out, a label runs over the
     * counts after its measure's first, and past its measure), else the measure under the pointer.
     * Right-click and double-click there act on that measure's count 1 (marcus).
     */
    const laneMeasureAt = (x: number, y: number) => {
        const under = measureAt(Math.max(1, Math.floor(beatAtX(x, ppb))));
        if (!under) return null;
        const font = rootRef.current
            ? getComputedStyle(rootRef.current).fontFamily
            : "sans-serif";
        const i = data.measures.indexOf(under);
        for (let j = i; j >= 0 && j >= i - 8; j--) {
            const m = data.measures[j]!;
            const left = xOf(m.start, ppb);
            const prev = data.measures[j - 1];
            const right =
                y < MEASURES.top
                    ? m.mark
                        ? left + textWidth(m.mark, `bold 11px ${font}`) + 12
                        : -Infinity
                    : left +
                      (meterOf(m).written
                          ? textWidth(
                                meterLabel(meterOf(m).meter),
                                `10px ${font}`,
                            ) + 16
                          : 0) +
                      textWidth(`${m.number}*`, `bold 10px ${font}`) +
                      6;
            if (x >= left - 2 && x <= right) return m;
            if (left < x - 160) break;
        }
        return under;
    };
    /** The measure whose rehearsal mark is drawn under `x` (local px), for dragging it */
    const markAtX = (x: number) => {
        const m = laneMeasureAt(x, MARKS.top + 1);
        if (!m?.mark || m.id === null) return null;
        const left = xOf(m.start, ppb);
        return x >= left - 2 && x <= left + 14 + 8 * m.mark.length ? m : null;
    };
    const toggleHold = (beat: number) => {
        const next = new Set(data.holds);
        const making = !next.has(beat);
        if (making) next.add(beat);
        else next.delete(beat);
        void run(t("tempoMode.band.action.hold"), async () => {
            await saveHolds(next);
            if (making)
                toast.info(
                    t("tempoMode.band.toast.holdMade", {
                        where: measureLabel(beat),
                    }),
                );
        });
    };

    /** Type how long a hold lasts, in seconds (it's a length, not a tempo) */
    const editHold = (e: { clientX: number; clientY: number }, b: number) =>
        setEditor({
            x: e.clientX,
            y: e.clientY,
            value: `${Math.round(data.durations[b]! * 100) / 100}`,
            hint: t("tempoMode.band.editor.holdHint", {
                where: measureLabel(b),
            }),
            range: { from: b, to: b + 1 },
            onCommit: (value) => {
                const seconds = Number(value.replace(/s$/i, "").trim());
                if (!(seconds >= 0.05 && seconds <= 600)) {
                    toast.error(t("tempoMode.band.toast.holdInvalid"));
                    return;
                }
                commit(
                    t("tempoMode.band.action.held", {
                        where: measureLabel(b),
                        seconds: String(seconds),
                    }),
                    retime(data.durations, b, b + 1, [seconds], {
                        hold: true,
                    }),
                );
            },
        });

    // Tap tempo's Use: a steady tempo on the selected counts, or on the stretch under the playhead
    const tapCounts = (() => {
        if (ui.range) return ui.range;
        const s = segmentAt(Math.max(1, Math.floor(playheadBeat)));
        return s ? { from: s.from, to: s.to } : null;
    })();
    const tapTarget = tapCounts
        ? measuresLabel(tapCounts.from, tapCounts.to)
        : null;
    // The taps are counts, not quarter notes: in 6/8 counted in 2 a count is three eighths. The
    // quarter-note tempo written makes the counts average the tapped length (2+2+3 included)
    const applyTapTempo = (bpm: number) => {
        if (!tapCounts) return;
        const { from, to } = tapCounts;
        let eighths = 0;
        for (let b = from; b < to; b++) eighths += units[b] ?? 2;
        const quarter = (bpm * eighths) / (2 * (to - from));
        setTempo(from, to, quarter, quarter);
    };

    // ---- keys: T taps tempo, M drops a rehearsal mark while playing ----------------------
    const gestureRef = useRef<Gesture | null>(null);
    gestureRef.current = gesture;
    /** Set by Escape: the release that ends the cancelled drag does nothing */
    const cancelGesture = useRef(false);
    /**
     * Drop the drag in progress, as if it never happened: Escape, a cancelled pointer, lost
     * pointer capture, the window losing focus. The release that ends it (if any) does nothing.
     */
    const cancelDrag = useCallback(() => {
        if (!gestureRef.current) return false;
        gestureRef.current = null;
        cancelGesture.current = true;
        setGesture(null);
        setPreview(null);
        return true;
    }, []);
    useEffect(() => {
        const onBlur = () => cancelDrag();
        window.addEventListener("blur", onBlur);
        return () => window.removeEventListener("blur", onBlur);
    }, [cancelDrag]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
            const target = e.target as HTMLElement | null;
            if (
                target?.closest(
                    "input, textarea, select, [contenteditable=true]",
                )
            )
                return;
            const key = e.key.toLowerCase();
            if (e.key === "Escape" && cancelDrag()) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            // T and M are letters a dialog may want (or that would act behind it)
            if ((key === "t" || key === "m") && dialogHasKeys(target)) return;
            if (key === "t") {
                e.preventDefault();
                e.stopPropagation();
                if (e.repeat) return;
                // when the key went down (same clock as performance.now), not when this runs
                useTempoUi.getState().tap(e.timeStamp);
            } else if (key === "m" && isPlaying) {
                e.preventDefault();
                e.stopPropagation();
                if (e.repeat) return;
                const heard = audible();
                let best: TempoMeasure | null = null;
                for (const m of data.measures)
                    if (
                        !best ||
                        Math.abs(starts[m.start]! - heard) <
                            Math.abs(starts[best.start]! - heard)
                    )
                        best = m;
                if (!best) return;
                const name = nextMarkName();
                // every letter A to Z is taken: no name to give it
                if (!name) return;
                const measure = best;
                void run(t("tempoMode.band.action.rehearsalMark"), async () => {
                    await setRehearsalMark({
                        measure,
                        mark: name,
                    });
                    await refetch();
                    toast.success(
                        t("tempoMode.band.toast.markDropped", {
                            mark: name,
                            measure: String(measure.number),
                        }),
                    );
                });
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });
    // Esc leaves tempo mode once nothing else takes it: a drag, a popover of the
    // band's, a dialog or menu, a text field, or selected counts (cleared first)
    const popoverOpen = !!(editor || menu || ask || ui.tapOpen);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented || e.repeat) return;
            if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
            if (popoverOpen || gestureRef.current) return;
            const state = useTempoUi.getState();
            const target = e.target as HTMLElement | null;
            if (
                target?.closest(
                    "input, textarea, select, [contenteditable=true]",
                ) ||
                document.querySelector(
                    '[role="dialog"], [role="alertdialog"], [role="menu"]',
                )
            )
                return;
            e.preventDefault();
            // A selection goes first; Esc with nothing left to clear leaves the mode
            if (state.range) {
                e.stopPropagation();
                state.setRange(null);
                return;
            }
            useTempoModeStore.getState().setOn(false);
        };
        // Before the app's shortcuts, which give Esc to the canvas; the checks above leave a
        // drag and popovers their own Esc
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [popoverOpen]);

    // ---- pointer -------------------------------------------------------------------------
    /**
     * The count whose tempo line is under the point (band px), or null. Only the line drags tempo:
     * a press elsewhere in the lane selects counts, so a stray press never edits (owner,
     * 2026-10-31; Logic drags only its points and lines)
     */
    const tempoLineAt = (x: number, y: number) => {
        if (y < TEMPO.top || y >= TEMPO.top + TEMPO.height) return null;
        const b = Math.floor(beatAtX(x, ppb));
        if (b < 1 || b >= durations.length || data.holds.has(b)) return null;
        return Math.abs(tempoYAt(beatAtX(x, ppb)) - y) <= TEMPO_LINE_GRAB_PX
            ? b
            : null;
    };
    /** What's under the point (band px) in the tempo lane: a handle, a point, the line, or none */
    const tempoTargetAt = (x: number, y: number): TempoHover | null => {
        if (y < TEMPO.top || y >= TEMPO.top + TEMPO.height) return null;
        const i = segments.findIndex(
            (s) => beatAtX(x, ppb) >= s.from && beatAtX(x, ppb) < s.to,
        );
        // a handle or point can sit just past its stretch's end: look at the neighbours too
        // a change's point first: an end dot or handle beside it never takes its press
        for (const j of [i, i + 1]) {
            const s = segments[j];
            if (!s || s.from <= 1) continue;
            if (Math.hypot(xOf(s.from, ppb) - x, yOfBpm(s.bpmFrom) - y) <= 7)
                return { kind: "point", stretch: s };
        }
        for (const j of [i, i - 1, i + 1]) {
            const s = segments[j];
            if (!s) continue;
            const end = endHandleOf(s);
            if (end && Math.hypot(end.x - x, end.y - y) <= 6)
                return { kind: "end", stretch: s };
            const h = curveHandleOf(s);
            if (h && Math.hypot(h.x - x, h.y - y) <= 7)
                return { kind: "curve", stretch: s };
        }
        const line = tempoLineAt(x, y);
        const at = line === null ? null : segmentAt(line);
        if (at) return { kind: "line", stretch: at };
        const s = segments[i];
        return s ? { kind: "lane", stretch: s } : null;
    };
    /** The tempo lane's scale: BPM per px */
    const bpmPerPx = () => (bpmScale.hi - bpmScale.lo) / (TEMPO.height - 8);
    /** The stored lane tempos (before any drag) */
    const storedBpms = () => laneBpms(data.durations);
    /** New lengths for counts `from`..`to - 1` from quarter-note tempos; holds keep theirs */
    const withTempos = (from: number, to: number, bpms: readonly number[]) =>
        retime(
            data.durations,
            from,
            to,
            bpms.map((q, i) =>
                data.holds.has(from + i)
                    ? data.durations[from + i]!
                    : (60 / q) * ((units[from + i] ?? 2) / 2),
            ),
            { fixed: data.holds },
        );
    /** The stretches either side of the change at `at`, as stored */
    const aroundChange = (at: number) => {
        const i = storedSegments.findIndex((s) => s.from === at);
        const before = storedSegments[i - 1];
        const after = storedSegments[i];
        return before && after ? { before, after } : null;
    };
    /**
     * Move the change at `at` to count `to`: the counts between join the stretch they now belong
     * to, in its shape (Logic: moving a point moves where the tempo changes)
     */
    const movedChange = (at: number, to: number) => {
        const around = aroundChange(at);
        if (!around) return null;
        const { before, after } = around;
        const bpms = storedBpms();
        const ownBefore = bpms.slice(before.from, at);
        const ownAfter = bpms.slice(at, after.to);
        const tempos = [
            ...temposOf(shapeOf(ownBefore), to - before.from, ownBefore, "end"),
            ...temposOf(shapeOf(ownAfter), after.to - to, ownAfter, "start"),
        ];
        const result = withTempos(before.from, after.to, tempos);
        if (!result) return null;
        const moved = new Set(changes);
        moved.delete(at);
        moved.add(to);
        return { ...result, changes: moved };
    };
    /** Add a tempo change at count `b`: nothing is re-timed, the stretch just splits */
    const addChange = (b: number) => {
        if (b <= 1 || b >= data.durations.length || changes.has(b)) return;
        const added = new Set(changes);
        added.add(b);
        commit(
            t("tempoMode.band.action.addedChange", { where: measureLabel(b) }),
            {
                durations: [...data.durations],
                changes: added,
            },
        );
    };
    /** Remove the change at `at`: the tempo before it carries on (Logic) */
    const removeChange = (at: number) => {
        const around = aroundChange(at);
        if (!around) return;
        const { before, after } = around;
        const bpms = storedBpms();
        const own = bpms.slice(before.from, at);
        const ended = endTempo(shapeOf(own), own);
        // a stretch of nothing but holds has no tempo to carry: the tempo after goes on
        const carry = Number.isFinite(ended) && ended > 0 ? ended : bpms[at]!;
        if (!Number.isFinite(carry) || carry <= 0) return;
        const result = withTempos(
            at,
            after.to,
            Array<number>(after.to - at).fill(carry),
        );
        const removed = new Set(changes);
        removed.delete(at);
        commit(
            t("tempoMode.band.action.removedChange", {
                where: measureLabel(at),
            }),
            result && { ...result, changes: removed },
        );
    };
    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        // the band owns its lanes: the timeline's own scrub mustn't take the press
        e.stopPropagation();
        cancelGesture.current = false;
        if (e.button !== 0 || busy) return;
        // nothing left over from a drag that ended without a release
        setPreview(null);
        setMenu(null);
        setTip(null);
        const x = localX(e);
        const y = localY(e);
        const beat = beatAtX(x, ppb);
        if (y >= MUSIC.top) {
            // the music: a drag selects counts, a click moves the playhead there
            const b = Math.round(beat);
            setGesture({ kind: "range", anchor: b, to: b, music: true });
        } else if (
            y >= TEMPO.top &&
            ["end", "curve", "point", "line"].includes(
                tempoTargetAt(x, y)?.kind ?? "",
            )
        ) {
            const target = tempoTargetAt(x, y)!;
            const i = segments.findIndex((s) => s.from === target.stretch.from);
            const segment = segments[i];
            if (!segment) return;
            if (target.kind === "end")
                setGesture({
                    kind: "end",
                    stretch: segment,
                    startY: y,
                    bpmPerPx: bpmPerPx(),
                    bpm: segment.bpmTo,
                });
            else if (target.kind === "curve") {
                const h = curveHandleOf(segment);
                if (!h) return;
                setGesture({
                    kind: "curve",
                    stretch: segment,
                    target: h.target,
                    curve: segment.curve ?? 0,
                });
            } else if (target.kind === "point")
                setGesture({
                    kind: "point",
                    at: segment.from,
                    startX: x,
                    startY: y,
                    to: segment.from,
                    axis: null,
                });
            else
                setGesture({
                    kind: "tempo",
                    segment,
                    startY: y,
                    factor: 1,
                    bpmPerPx: bpmPerPx(),
                });
        } else if (y >= TEMPO.top) {
            // off the line: a drag selects counts, a click clears the selection
            const b = Math.round(beat);
            setGesture({ kind: "range", anchor: b, to: b });
        } else if (y >= MEASURES.top) {
            const chip = (e.target as HTMLElement).closest<HTMLElement>(
                "[data-meter-start]",
            );
            const meterStart = chip
                ? Number(chip.dataset.meterStart)
                : undefined;
            // from a chip, the selection starts on its measure's count 1 (the chip sits after
            // the number, a little into the measure)
            const b = meterStart ?? Math.round(beat);
            setGesture({
                kind: "range",
                anchor: b,
                to: b,
                meterStart,
                pressX: chip ? x : undefined,
            });
        } else {
            const m = markAtX(x);
            if (!m) {
                // a click on empty lane space clears the selection
                useTempoUi.getState().setRange(null);
                return;
            }
            setGesture({ kind: "mark", measure: m, to: m.start, moved: false });
        }
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    /** The explanation for what's under the pointer: a red dot */
    const tipAt = (x: number, y: number) => {
        for (const o of outliers) {
            const cx = xOf(o.beat, ppb) + ppb / 2;
            if (
                Math.abs(cx - x) <= Math.max(8, ppb / 2) &&
                Math.abs(yOfBpm(o.bpm) - y) <= 9
            )
                return {
                    x: cx,
                    y: yOfBpm(o.bpm),
                    text: t("tempoMode.band.tip.outlier", {
                        where: measureLabel(o.beat),
                        direction: o.bpm > o.before ? "faster" : "slower",
                        tempo: bpmText(o.bpm),
                        before: bpmText(o.before),
                        after: bpmText(o.after),
                    }),
                };
        }
        return null;
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!gesture) {
            const next = tipAt(localX(e), localY(e));
            if (next?.text !== tip?.text) setTip(next);
            const over = tempoTargetAt(localX(e), localY(e));
            if (
                over?.kind !== hover?.kind ||
                over?.stretch.from !== hover?.stretch.from ||
                over?.stretch.to !== hover?.stretch.to
            )
                setHover(over);
            return;
        }
        if (cancelGesture.current) return;
        const x = localX(e);
        if (gesture.kind === "mark") {
            // the nearest measure's start
            let to = gesture.measure.start;
            for (const m of data.measures)
                if (
                    Math.abs(xOf(m.start, ppb) - x) < Math.abs(xOf(to, ppb) - x)
                )
                    to = m.start;
            if (to !== gesture.to || !gesture.moved)
                setGesture({
                    ...gesture,
                    to,
                    moved:
                        gesture.moved ||
                        Math.abs(x - xOf(gesture.measure.start, ppb)) > 6,
                });
            return;
        }
        if (gesture.kind === "point") {
            const y = localY(e);
            let axis: "x" | "y" | null = gesture.axis;
            if (axis === null) {
                const dx = Math.abs(x - gesture.startX);
                const dy = Math.abs(y - gesture.startY);
                if (Math.max(dx, dy) < 4) return;
                axis = dx > dy ? "x" : "y";
            }
            if (axis === "y") {
                // up or down: the stretch's tempo, as its line drags
                const segment = segmentAt(gesture.at);
                if (segment)
                    setGesture({
                        kind: "tempo",
                        segment,
                        startY: gesture.startY,
                        factor: 1,
                        bpmPerPx: bpmPerPx(),
                    });
                return;
            }
            const around = aroundChange(gesture.at);
            if (!around) return;
            const to = Math.max(
                around.before.from + 1,
                Math.min(around.after.to - 1, Math.round(beatAtX(x, ppb))),
            );
            setGesture({ ...gesture, axis: "x", to });
            setPreview(to === gesture.at ? null : movedChange(gesture.at, to));
        } else if (gesture.kind === "end") {
            const { stretch } = gesture;
            const step = e.shiftKey ? 0.1 : 1;
            let bpm =
                Math.round(
                    (stretch.bpmTo -
                        (localY(e) - gesture.startY) * gesture.bpmPerPx) /
                        step,
                ) * step;
            // catches at the next stretch's tempo (a ramp into it) and at its own start (steady)
            const next = segments.find((s) => s.from === stretch.to);
            for (const at of [next?.bpmFrom, stretch.bpmFrom])
                if (
                    at !== undefined &&
                    Math.abs(bpm - at) / gesture.bpmPerPx <= 5
                )
                    bpm = at;
            bpm = Math.max(20, Math.min(400, bpm));
            setGesture({ ...gesture, bpm });
            setPreview(
                withTempos(
                    stretch.from,
                    stretch.to,
                    rampTempos(
                        stretch.to - stretch.from,
                        stretch.bpmFrom,
                        bpm,
                        stretch.ramp ? (stretch.curve ?? 0) : 0,
                    ),
                ),
            );
        } else if (gesture.kind === "curve") {
            const { stretch, target } = gesture;
            const yFrom = yOfBpm(stretch.bpmFrom);
            const yTo = yOfBpm(target);
            if (Math.abs(yTo - yFrom) < 2) return;
            const curve = curveThrough((localY(e) - yFrom) / (yTo - yFrom));
            setGesture({ ...gesture, curve });
            setPreview(
                withTempos(
                    stretch.from,
                    stretch.to,
                    rampTempos(
                        stretch.to - stretch.from,
                        stretch.bpmFrom,
                        target,
                        curve,
                    ),
                ),
            );
        } else if (gesture.kind === "tempo") {
            const dy = localY(e) - gesture.startY;
            const perPx = gesture.bpmPerPx;
            const bpm0 = (gesture.segment.bpmFrom + gesture.segment.bpmTo) / 2;
            const step = e.shiftKey ? 0.1 : 1;
            const bpm = Math.round((bpm0 - dy * perPx) / step) * step;
            const factor = bpm0 / Math.max(20, bpm);
            setGesture({ ...gesture, factor });
            const { from, to, ramp, uneven } = gesture.segment;
            // A steady stretch is written fresh at the tempo dragged to, so it lands on that tempo
            // exactly; scaling the old lengths would leave it a hair off (143.99…). A ramp or an
            // uneven stretch keeps its shape and scales.
            const steady = !ramp && !uneven;
            const bpmTo = Math.max(20, bpm);
            setPreview(
                retime(
                    data.durations,
                    from,
                    to,
                    data.durations
                        .slice(from, to)
                        .map((d, i) =>
                            steady && !data.holds.has(from + i)
                                ? (60 / bpmTo) * ((units[from + i] ?? 2) / 2)
                                : d * factor,
                        ),
                    { fixed: data.holds },
                ),
            );
        } else {
            // a press on a chip that hasn't moved yet is still a click
            if (
                gesture.pressX !== undefined &&
                Math.abs(x - gesture.pressX) < 4
            )
                return;
            setGesture({
                ...gesture,
                to: Math.round(beatAtX(x, ppb)),
                pressX: undefined,
            });
        }
    };
    const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        const g = gesture;
        // ended: the lost capture that follows a release isn't a cancel
        gestureRef.current = null;
        setGesture(null);
        if (cancelGesture.current) {
            cancelGesture.current = false;
            setPreview(null);
            return;
        }
        if (!g) return;
        if (g.kind === "mark") {
            const target = data.measures.find((m) => m.start === g.to);
            const mark = g.measure.mark;
            if (
                !g.moved ||
                !target ||
                target.start === g.measure.start ||
                !mark
            )
                return;
            if (target.mark) {
                toast.error(
                    t("tempoMode.band.toast.markAlreadyThere", {
                        measure: String(target.number),
                        mark: target.mark,
                    }),
                );
                return;
            }
            void run(t("tempoMode.band.action.rehearsalMark"), async () => {
                await moveRehearsalMark({
                    fromId: g.measure.id!,
                    to: target,
                    mark,
                });
                await refetch();
                toast.success(
                    t("tempoMode.band.toast.markMoved", {
                        mark,
                        from: String(g.measure.number),
                        to: String(target.number),
                    }),
                );
            });
            return;
        }
        if (g.kind === "point") {
            if (g.axis === "x" && g.to !== g.at)
                commit(
                    t("tempoMode.band.action.movedChange", {
                        where: measureLabel(g.to),
                    }),
                    movedChange(g.at, g.to),
                );
            else setPreview(null);
        } else if (g.kind === "end") {
            if (!preview || Math.abs(g.bpm - g.stretch.bpmTo) < 1e-6)
                setPreview(null);
            else {
                const next = segments.find((s) => s.from === g.stretch.to);
                commit(
                    next && Math.abs(g.bpm - next.bpmFrom) > 0.5
                        ? t("tempoMode.band.action.endsOnThen", {
                              tempo: bpmText(g.bpm),
                              next: bpmText(next.bpmFrom),
                          })
                        : t("tempoMode.band.action.endsOn", {
                              tempo: bpmText(g.bpm),
                          }),
                    preview,
                );
            }
        } else if (g.kind === "curve") {
            if (preview)
                commit(
                    g.curve === 0
                        ? t("tempoMode.band.action.gradual")
                        : t("tempoMode.band.action.curve"),
                    preview,
                );
        } else if (g.kind === "tempo") {
            if (Math.abs(g.factor - 1) < 1e-6) {
                // a click on the tempo lane clears the selection
                useTempoUi.getState().setRange(null);
                setPreview(null);
                return;
            }
            commit(t("tempoMode.band.action.tempo"), preview);
        } else {
            const from = Math.min(g.anchor, g.to);
            const to = Math.max(g.anchor, g.to);
            if (to - from >= 1) useTempoUi.getState().setRange({ from, to });
            else if (g.meterStart !== undefined)
                setMenu(signatureMenu(e.clientX, e.clientY, g.meterStart));
            else {
                if (g.music)
                    useTimelineSelectionStore.getState().seek(g.anchor);
                useTempoUi.getState().setRange(null);
            }
        }
    };
    const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const x = localX(e);
        const y = localY(e);
        const beat = beatAtX(x, ppb);
        if (y >= MUSIC.top) return;
        if (y >= TEMPO.top) {
            // Logic: double-click the lane or the line adds a point, double-click a point removes
            // it; a handle goes back to a jump
            const target = tempoTargetAt(x, y);
            if (!target) return;
            // a hold isn't tempo: double-clicking it is about its length
            const held = Math.floor(beat);
            if (target.kind !== "point" && data.holds.has(held)) {
                editHold(e, held);
                return;
            }
            if (target.kind === "lane") {
                addChange(Math.round(beat));
                return;
            }
            if (target.kind === "point") {
                removeChange(target.stretch.from);
                return;
            }
            if (target.kind === "curve" || target.kind === "end") {
                const st = segmentAt(target.stretch.from);
                // a steady stretch's end dot sits on the line: as on the line, add a change
                if (target.kind === "end" && !st?.ramp) {
                    addChange(Math.round(beat));
                    return;
                }
                if (st?.ramp)
                    commit(
                        t("tempoMode.band.action.jump"),
                        withTempos(
                            st.from,
                            st.to,
                            Array<number>(st.to - st.from).fill(st.bpmFrom),
                        ),
                    );
                return;
            }
            // The line too adds a change (owner, 2026-11-01: double-clicking the line never did
            // what was expected); typing a tempo is right-click > Set tempo…
            const b = tempoLineAt(x, y);
            if (b === null) return;
            addChange(Math.round(beat));
        } else if (y >= MEASURES.top) {
            const m = laneMeasureAt(x, y);
            if (m) renumber(e, m);
        } else if (y >= MARKS.top) {
            const m = laneMeasureAt(x, y);
            if (m) editMark(e, m);
        }
    };
    const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setTip(null);
        const x = localX(e);
        const y = localY(e);
        // The count under the pointer: every item names the same one. Over the marks and measures
        // lanes, count 1 of the measure whose mark or number is there, wherever in it (marcus)
        const laneMeasure = y < TEMPO.top ? laneMeasureAt(x, y) : null;
        const beat = laneMeasure
            ? laneMeasure.start
            : Math.max(1, Math.floor(beatAtX(x, ppb)));
        const m = laneMeasure ?? measureAt(beat);
        const range = ui.range;
        const one = { from: beat, to: beat + 1 };
        const items: Menu["items"] = [];
        const where = { clientX: e.clientX, clientY: e.clientY };
        const I = 14;
        const countTitle = m
            ? t("tempoMode.band.menu.countTitle", {
                  measure: String(m.number),
                  count: String(beat - m.start + 1),
              })
            : t("tempoMode.band.menu.countTitleNoMeasure", {
                  count: String(beat),
              });
        let title: string;
        let subtitle: string | undefined;

        // D: a right-click inside the selection is about the selection
        if (range && beat >= range.from && beat < range.to) {
            title = measuresLabel(range.from, range.to);
            subtitle = t("tempoMode.band.menu.selectionCounts", {
                count: range.to - range.from,
            });
            items.push(
                {
                    label: t("tempoMode.band.menu.setTempo"),
                    icon: <GaugeIcon size={I} aria-hidden />,
                    onSelect: () =>
                        editTempo(
                            where,
                            range.from,
                            range.to,
                            `${Math.round(qBpm(range.from, data.durations))}`,
                        ),
                    range,
                },
                {
                    label: t("tempoMode.band.menu.removeCounts"),
                    icon: <TrashIcon size={I} aria-hidden />,
                    onSelect: () => void askRemove(e, range.from, range.to),
                    range,
                    separatorBefore: true,
                },
                {
                    label: t("tempoMode.band.menu.clearSelection"),
                    icon: <XIcon size={I} aria-hidden />,
                    aside: <Shortcut binding="Escape" />,
                    onSelect: () => useTempoUi.getState().setRange(null),
                },
            );
        } else if (y < TEMPO.top && m) {
            // B: the marks and measures lanes: the measure
            const measure = { from: m.start, to: m.start + m.counts };
            const meter = meterLabel(meterOf(m).meter, true);
            const [top, bottom] = meter.split(" ")[0]!.split("/");
            title = t("tempoMode.band.menu.measureTitle", {
                measure: String(m.number),
            });
            subtitle = m.mark
                ? t("tempoMode.band.menu.measureSubtitleMark", {
                      meter,
                      mark: m.mark,
                  })
                : meter;
            items.push(
                {
                    label: t("tempoMode.band.menu.timeSignature"),
                    icon: <MeterGlyph top={top ?? ""} bottom={bottom ?? ""} />,
                    onSelect: () =>
                        setMenu(signatureMenu(e.clientX, e.clientY, m.start)),
                    range: measure,
                },
                {
                    label: t("tempoMode.band.menu.renumber"),
                    icon: <NumberGlyph n={m.number} />,
                    onSelect: () => renumber(e, m),
                    range: measure,
                },
                {
                    label: m.mark
                        ? t("tempoMode.band.menu.editMark")
                        : t("tempoMode.band.menu.addMark"),
                    icon: <MarkGlyph letter={m.mark ?? "A"} />,
                    onSelect: () => editMark(e, m),
                    range: measure,
                },
                {
                    label: t("tempoMode.band.menu.addMeasureBefore"),
                    icon: <PlusIcon size={I} aria-hidden />,
                    onSelect: () => {
                        const params = {
                            count: m.counts,
                            measure: String(m.number),
                        };
                        void askAdd(
                            e,
                            m.start,
                            m.counts,
                            {
                                title: t(
                                    "tempoMode.band.ask.addMeasureBefore",
                                    params,
                                ),
                                done: t(
                                    "tempoMode.band.ask.addedMeasureBefore",
                                    params,
                                ),
                            },
                            true,
                        );
                    },
                    range: { from: m.start, to: m.start },
                    separatorBefore: true,
                },
                {
                    label: t("tempoMode.band.menu.removeMeasure"),
                    icon: <MinusIcon size={I} aria-hidden />,
                    onSelect: () =>
                        void askRemove(e, m.start, m.start + m.counts),
                    range: measure,
                },
            );
        } else {
            // B: the tempo and music lanes: the count, and (on the tempo lane) its tempo
            const hold = data.holds.has(beat);
            title = countTitle;
            subtitle = hold
                ? t("tempoMode.band.menu.holdSubtitle", {
                      seconds: data.durations[beat]!.toFixed(1),
                  })
                : bpmText(qBpm(beat, data.durations));
            const onTempo = y < MUSIC.top;
            if (hold)
                items.push(
                    {
                        separatorBefore: items.length > 0,
                        label: t("tempoMode.band.menu.holdLength"),
                        icon: <FermataGlyph />,
                        aside: t("tempoMode.band.menu.seconds", {
                            seconds: data.durations[beat]!.toFixed(1),
                        }),
                        onSelect: () => editHold(where, beat),
                        range: one,
                    },
                    {
                        label: t("tempoMode.band.menu.notAHold"),
                        icon: <FermataGlyph />,
                        onSelect: () => toggleHold(beat),
                        range: one,
                    },
                );
            if (onTempo && !hold && beat < data.durations.length) {
                if (beat > 1)
                    items.push(
                        changes.has(beat)
                            ? {
                                  label: t("tempoMode.band.menu.removeChange"),
                                  icon: <StepGlyph />,
                                  onSelect: () => removeChange(beat),
                                  range: { from: beat, to: beat },
                              }
                            : {
                                  label: t("tempoMode.band.menu.addChange"),
                                  icon: <StepGlyph />,
                                  onSelect: () => addChange(beat),
                                  range: { from: beat, to: beat },
                              },
                    );
                // From this count to the end of its tempo, or the next hold first
                const end = tempoStretchEnd(beat);
                const stretch = { from: beat, to: end };
                const current = qBpm(beat, data.durations);
                const last = measureAt(end - 1);
                items.push({
                    label: t("tempoMode.band.menu.setTempo"),
                    icon: <GaugeIcon size={I} aria-hidden />,
                    aside:
                        end - beat > 1 && last
                            ? t("tempoMode.band.menu.toMeasure", {
                                  measure: String(last.number),
                              })
                            : undefined,
                    onSelect: () =>
                        editTempo(
                            where,
                            beat,
                            end,
                            `${Math.round(current * 10) / 10}`,
                            segmentAt(beat),
                        ),
                    range: stretch,
                });
                const target = tempoAfter(end);
                const same =
                    target === null ||
                    end - beat < 2 ||
                    Math.abs(target - current) < 0.5;
                items.push({
                    label: same
                        ? t("tempoMode.band.menu.gradual")
                        : t("tempoMode.band.menu.gradualTo", {
                              tempo: bpmText(target!),
                          }),
                    icon:
                        !same && target! < current ? (
                            <TrendDownIcon size={I} aria-hidden />
                        ) : (
                            <TrendUpIcon size={I} aria-hidden />
                        ),
                    onSelect: () =>
                        target !== null && setTempo(beat, end, current, target),
                    disabled: same,
                    hint: same
                        ? t("tempoMode.band.menu.gradualNothingHint")
                        : t("tempoMode.band.menu.gradualHint", {
                              tempo: bpmText(target!),
                          }),
                    range: stretch,
                });
            }
            // the count itself: a hold, adding and removing counts
            const countItems = items.length;
            if (!hold)
                items.push({
                    label: t("tempoMode.band.menu.makeHold"),
                    icon: <FermataGlyph />,
                    onSelect: () => toggleHold(beat),
                    range: one,
                });
            items.push(
                {
                    label: t("tempoMode.band.menu.addCountBefore"),
                    icon: <PlusIcon size={I} aria-hidden />,
                    onSelect: () =>
                        void askAdd(e, beat, 1, {
                            title: t("tempoMode.band.ask.addCountBefore", {
                                where: measureLabel(beat),
                            }),
                            done: t("tempoMode.band.ask.addedCountBefore", {
                                where: measureLabel(beat),
                            }),
                        }),
                    range: { from: beat, to: beat },
                },
                {
                    label: t("tempoMode.band.menu.addCountAfter"),
                    icon: <PlusIcon size={I} aria-hidden />,
                    onSelect: () =>
                        void askAdd(e, beat + 1, 1, {
                            title: t("tempoMode.band.ask.addCountAfter", {
                                where: measureLabel(beat),
                            }),
                            done: t("tempoMode.band.ask.addedCountAfter", {
                                where: measureLabel(beat),
                            }),
                        }),
                    range: { from: beat + 1, to: beat + 1 },
                },
                {
                    label: t("tempoMode.band.menu.removeCount"),
                    icon: <MinusIcon size={I} aria-hidden />,
                    onSelect: () => void askRemove(e, beat, beat + 1),
                    range: one,
                },
            );
            if (countItems > 0)
                items[countItems] = {
                    ...items[countItems]!,
                    separatorBefore: true,
                };
        }
        setMenu({
            x: e.clientX,
            y: e.clientY,
            title,
            subtitle,
            items,
        });
    };
    /**
     * Set a meter with its grouping from the measure at `start` to the next change, at the
     * quarter-note tempo just before it (owner, 2026-10-21: "7/8 2+2+3")
     */
    const setMeter = (start: number, text: string, only = false) => {
        const meter = parseMeter(text);
        if (!meter) {
            toast.error(t("tempoMode.band.toast.notATimeSignature", { text }));
            return;
        }
        const label = meterLabel(meter, true);
        const was = measureAt(start);
        // just this measure: the measures after keep their time signatures and move to follow
        // it (a 2/4 bar in 4/4 brings the downbeats after it 2 counts earlier, as in the score)
        // past the stored counts, the plan takes in the endless measures too, and they're stored
        const past = was?.id === null;
        // ...up to the last one the timeline ends inside, unless that's the one set
        const cut = data.measures.at(-1);
        const upTo =
            cut && cut.id === null && cut.start > start
                ? cut.start
                : data.durations.length;
        const plan = planMeter({
            durations: data.durations,
            holds: data.holds,
            measures: past
                ? data.measures.filter((m) => m.start < upTo)
                : data.measures.filter((m) => m.id !== null),
            beatCount: past ? upTo : data.storedCount,
            start,
            meter,
            only,
        });
        const by = plan.shift;
        // Each note is a sentence of its own, after what was set
        const notes = [
            only && was
                ? t("tempoMode.band.toast.meterSetOnly", {
                      meter: label,
                      measure: String(was.number),
                  })
                : t("tempoMode.band.toast.meterSetFrom", {
                      meter: label,
                      where: measureLabel(plan.from),
                      count: meter.grouping.length,
                  }),
            plan.short &&
                t("tempoMode.band.toast.meterShortNote", {
                    count: plan.short.counts,
                }),
            by &&
                t("tempoMode.band.toast.meterShiftNote", {
                    count: Math.abs(by),
                    direction: by < 0 ? "earlier" : "later",
                }),
        ].filter((note): note is string => typeof note === "string");
        setPreview(plan.result);
        void run(t("tempoMode.band.action.timeSignature"), async () => {
            await writeMeter({
                plan,
                before: data.durations,
                storeThrough: past ? upTo : undefined,
            });
            await refetch();
            toast.success(notes.join(". "), { id: NOTE_TOAST });
        });
    };
    /**
     * The time signatures to pick from the measure at `start`: until the next change (as in a
     * score), or for that measure only, the measures after keeping theirs
     */
    const signatureMenu = (
        x: number,
        y: number,
        start: number,
        only = false,
    ): Menu => {
        const m = measureAt(start);
        return {
            x,
            y,
            title: m
                ? only
                    ? t("tempoMode.band.meterMenu.onlyTitle", {
                          measure: String(m.number),
                      })
                    : t("tempoMode.band.meterMenu.fromTitle", {
                          measure: String(m.number),
                      })
                : undefined,
            subtitle: only
                ? t("tempoMode.band.meterMenu.onlySubtitle")
                : t("tempoMode.band.meterMenu.fromSubtitle"),
            items: [
                {
                    label: t("tempoMode.band.meterMenu.justThisMeasure"),
                    icon: only ? (
                        <CheckIcon size={14} aria-hidden />
                    ) : undefined,
                    hint: t("tempoMode.band.meterMenu.justThisMeasureHint"),
                    onSelect: () => setMenu(signatureMenu(x, y, start, !only)),
                },
                ...METER_CHOICES.map((choice, i) => ({
                    label: choice.includes(" ")
                        ? t("tempoMode.band.meterMenu.counted", {
                              meter: choice.split(" ")[0],
                              grouping: choice.split(" ")[1],
                          })
                        : choice,
                    onSelect: () => setMeter(start, choice, only),
                    separatorBefore: i === 0,
                })),
                {
                    label: t("tempoMode.band.meterMenu.other"),
                    onSelect: () =>
                        setEditor({
                            x,
                            y,
                            value: "",
                            hint: t("tempoMode.band.meterMenu.otherHint"),
                            onCommit: (value) => setMeter(start, value, only),
                        }),
                },
            ],
        };
    };

    // ---- labels --------------------------------------------------------------------------
    // Placed in order of importance; one that would overlap another (or hide under the lane
    // names) is shortened or left out, so zooming out thins the text instead of piling it up
    const fontFamily = rootRef.current
        ? getComputedStyle(rootRef.current).fontFamily
        : "sans-serif";
    const viewLeft = win.left - geometry.leadingInset;
    const viewRight = viewLeft + win.width;
    const gutterRight = viewLeft + LANE_GUTTER;
    const labelGap = 4;
    const placer = createLabelPlacer(
        [
            // the lane names' column: a label may start right at its edge
            {
                x: viewLeft,
                y: 0,
                w: LANE_GUTTER - labelGap,
                h: TEMPO_BAND_HEIGHT,
            },
        ],
        labelGap,
    );
    const candidates: {
        priority: number;
        boxes: LabelBox[];
        render: (index: number, box: LabelBox) => ReactNode;
    }[] = [];
    // Zoomed out, every 2nd, 4th, 8th... measure is numbered, so the numbers stay evenly spaced
    const visibleMeasures = data.measures.filter(
        (m) => m.start + m.counts >= firstBeat && m.start <= lastBeat,
    );
    const typicalCounts =
        [...visibleMeasures].sort((a, b) => a.counts - b.counts)[
            Math.floor(visibleMeasures.length / 2)
        ]?.counts ?? 4;
    const widestNumber = textWidth(
        String(visibleMeasures[visibleMeasures.length - 1]?.number ?? 99),
        `10px ${fontFamily}`,
    );
    let numberStride = 1;
    while (
        numberStride < 64 &&
        ppb * typicalCounts * numberStride < widestNumber + 3 + labelGap + 2
    )
        numberStride *= 2;
    data.measures.forEach((m, i) => {
        const prev = data.measures[i - 1];
        const next = data.measures[i + 1];
        const visible = m.start + m.counts >= firstBeat && m.start <= lastBeat;
        // A chip where a time signature is written; a measure with fewer counts than its time
        // signature is short (marked *). The show's last measure runs on, so it never is
        const { meter: mMeter, written: changed, short } = meters[i]!;
        const partial = short && !!next;
        if (!visible) return;
        const left = xOf(m.start, ppb);
        const chip = changed && !partial;
        const chipWidth = chip
            ? textWidth(meterLabel(mMeter), `10px ${fontFamily}`) + 10
            : 0;
        const measureWidth = ppb * m.counts;
        const numberText = `${m.number}${partial ? "*" : ""}`;
        const marked = partial || m.overridden;
        // (a true modulo: a renumbered pickup can be negative)
        const onStride =
            (((m.number - 1) % numberStride) + numberStride) % numberStride ===
            0;
        const numbered = marked || onStride;
        const numberWidth = textWidth(
            numberText,
            `${m.overridden ? "bold " : ""}10px ${fontFamily}`,
        );
        // The number sits on its bar line and the time signature chip after it, so a chip never
        // hides the number or pushes it off the line (jo, priya: "the 4/4 chip pushes the 1 off
        // its barline"; "the 5/4 chip covers 12")
        const chipX =
            numbered && left + 3 < left + measureWidth - 2
                ? left + 3 + numberWidth + labelGap
                : left + 2;
        candidates.push({
            // a measure with a chip: its number goes first, the chip after it
            priority: chip && numbered ? 0 : marked ? 1 : 2,
            // at the measure's start, never starting past the measure's end
            boxes: [left + 3]
                .filter((x) => numbered && x < left + measureWidth - 2)
                .map((x) => ({
                    x,
                    y: MEASURES.top + 4,
                    w: numberWidth,
                    h: 14,
                })),
            render: (_, box) => (
                <span
                    key={`n-${m.start}`}
                    title={
                        partial
                            ? t("tempoMode.band.lane.shortMeasureTitle", {
                                  measure: String(m.number),
                                  count: m.counts,
                              })
                            : m.overridden
                              ? t("tempoMode.band.lane.renumberedTitle", {
                                    measure: String(m.number),
                                })
                              : undefined
                    }
                    className={`absolute text-[10px] leading-[14px] whitespace-nowrap ${m.overridden ? "text-accent font-bold" : "text-text-subtitle"} ${partial ? "text-red" : ""}`}
                    style={{
                        left: box.x,
                        top: box.y,
                        pointerEvents:
                            partial || m.overridden ? "auto" : "none",
                    }}
                >
                    {numberText}
                </span>
            ),
        });
        if (chip)
            candidates.push({
                // a chip wider than its measure (a pickup) gives way to the next measure's
                priority: measureWidth >= chipWidth + 4 ? 0 : 1,
                // after the number, or on the bar line when the number isn't drawn
                boxes: [...new Set([chipX, left + 2])].map((x) => ({
                    x,
                    y: MEASURES.top + 3,
                    w: chipWidth,
                    h: 16,
                })),
                render: (_, box) => (
                    <button
                        key={`sig-${m.start}`}
                        type="button"
                        data-meter-start={m.start}
                        className="bg-fg-1 border-stroke text-text hover:border-accent absolute rounded-full border px-4 text-[10px] leading-[14px] whitespace-nowrap"
                        style={{ left: box.x, top: box.y }}
                        title={t("tempoMode.band.lane.timeSignatureTitle", {
                            meter: meterLabel(mMeter, true),
                        })}
                        // A press goes on to the lane, so a drag from the chip selects measures
                        // and a click without a drag opens the menu there (priya, jo); this is
                        // for Enter and Space on the focused chip
                        onClick={(e) => {
                            if (e.detail !== 0) return;
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenu(signatureMenu(r.left, r.bottom, m.start));
                        }}
                    >
                        {meterLabel(mMeter)}
                    </button>
                ),
            });
        if (m.mark) {
            const mark = m.mark;
            candidates.push({
                priority: 0,
                boxes: [
                    {
                        x: left + 1,
                        y: MARKS.top + 2,
                        w: textWidth(mark, `bold 11px ${fontFamily}`) + 8,
                        h: 16,
                    },
                ],
                render: (_, box) => (
                    <span
                        key={`mk-${m.start}`}
                        className={clsx(
                            "bg-accent text-text-invert absolute cursor-grab rounded-[3px] px-4 text-[11px] leading-[16px] font-bold whitespace-nowrap",
                            gesture?.kind === "mark" &&
                                gesture.moved &&
                                gesture.measure.start === m.start &&
                                "opacity-40",
                        )}
                        style={{ left: box.x, top: box.y }}
                        title={t("tempoMode.band.lane.markTitle", {
                            mark,
                            measure: String(m.number),
                        })}
                    >
                        {mark}
                    </span>
                ),
            });
        }
    });
    for (const s of segments) {
        if (s.to < firstBeat || s.from > lastBeat) continue;
        // a hold has no tempo: the label starts after any holds the stretch begins with (so it
        // never sits on a fermata), and a stretch of nothing but holds gets none
        let start = s.from;
        while (start < s.to && data.holds.has(start)) start++;
        if (start >= s.to) continue;
        // the label stays in view along its segment, right of the lane names
        const left = Math.max(xOf(start, ppb), gutterRight) + 3;
        const right = Math.min(xOf(s.to, ppb), viewRight) - 3;
        const from = Math.round(s.bpmFrom);
        // An uneven stretch is labelled with its range, over its highest step, so the label never
        // sits at the height of a step it doesn't name
        let lo = Infinity;
        let hi = -Infinity;
        if (s.uneven)
            for (let b = s.from; b < s.to && b < durations.length; b++) {
                if (data.holds.has(b)) continue;
                const bpm = qBpm(b);
                lo = Math.min(lo, bpm);
                hi = Math.max(hi, bpm);
            }
        const uneven = s.uneven && Number.isFinite(hi);
        const texts = uneven
            ? Math.round(lo) === Math.round(hi)
                ? [`♩${Math.round(hi)}`]
                : [`♩${Math.round(lo)}–${Math.round(hi)}`, `♩${Math.round(hi)}`]
            : s.ramp
              ? [`♩${from}→${Math.round(s.bpmTo)}`, `♩${from}`]
              : [`♩${Math.round(s.bpmFrom * 10) / 10}`, `♩${from}`];
        const y = yOfBpm(uneven ? hi : s.bpmFrom);
        const below = y < TEMPO.top + 16;
        const top = below ? y + 3 : y - 14;
        const boxes = texts
            .map((text) => ({
                x: left,
                y: top,
                w: textWidth(text, `500 10px ${fontFamily}`),
                h: 12,
            }))
            // only in its own segment, where the line is at its height
            .filter((box) => box.x + box.w <= right);
        candidates.push({
            priority: 1,
            boxes,
            // click the number to type a tempo for this stretch
            render: (index, box) => (
                <button
                    key={`t-${s.from}`}
                    type="button"
                    data-testid="tempo-label"
                    // the text is tiny, so the button reaches past it: to the right, and away
                    // from the line, leaving the line and the point's dot their own grab
                    // (owner, 2026-11-03: clicking the number didn't seem to work)
                    className={clsx(
                        "text-accent hover:bg-accent/15 focus-visible:bg-accent/15 absolute cursor-text rounded-[3px] pr-6 text-[10px] leading-[12px] font-medium whitespace-nowrap",
                        below ? "pb-4" : "pt-4",
                    )}
                    style={{ left: box.x, top: below ? box.y : box.y - 4 }}
                    title={t("tempoMode.band.lane.tempoLabelTitle", {
                        range: rangeLabel(s.from, s.to),
                    })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        editTempo(e, s.from, s.to, segmentText(s));
                    }}
                >
                    {texts[index]}
                </button>
            ),
        });
    }
    for (const b of data.holds) {
        if (b < firstBeat || b > lastBeat) continue;
        const seconds = durations[b]!.toFixed(1);
        const texts = [
            t("tempoMode.band.lane.holdLabel", { seconds }),
            t("tempoMode.band.lane.holdLabelShort", { seconds }),
        ];
        const center = xOf(b, ppb) + ppb / 2;
        candidates.push({
            priority: 0,
            boxes: texts.map((text) => {
                const w = textWidth(text, `11px ${fontFamily}`);
                return { x: center - w / 2, y: TEMPO.top + 26, w, h: 12 };
            }),
            render: (index, box) => (
                <span
                    key={`h-${b}`}
                    className="text-accent pointer-events-none absolute text-[11px] leading-[12px] whitespace-nowrap"
                    style={{ left: box.x, top: box.y }}
                >
                    {texts[index]}
                </span>
            ),
        });
    }
    const labels: ReactNode[] = [];
    // stable: within a priority, left to right
    candidates
        .map((c, order) => ({ c, order }))
        .sort((a, b) => a.c.priority - b.c.priority || a.order - b.order)
        .forEach(({ c }) => {
            const index = placer.place(c.boxes);
            if (index >= 0) labels.push(c.render(index, c.boxes[index]!));
        });
    // A rehearsal mark being dragged: where it lands
    if (gesture?.kind === "mark" && gesture.moved && gesture.measure.mark) {
        const target = data.measures.find((m) => m.start === gesture.to);
        labels.push(
            <span
                key="mark-drag"
                className={clsx(
                    "text-text-invert pointer-events-none absolute z-[5] rounded-[3px] px-4 text-[11px] leading-[16px] font-bold whitespace-nowrap",
                    target?.mark && target.start !== gesture.measure.start
                        ? "bg-red"
                        : "bg-accent",
                )}
                style={{ left: xOf(gesture.to, ppb) + 1, top: MARKS.top + 2 }}
            >
                {t("tempoMode.band.lane.markDrag", {
                    mark: gesture.measure.mark,
                    measure: target ? String(target.number) : "?",
                })}
            </span>,
        );
    }
    // The selection, with a way to clear it besides Esc
    if (ui.range && ui.range.to >= firstBeat && ui.range.from <= lastBeat) {
        const right = xOf(ui.range.to, ppb);
        labels.push(
            <button
                key="clear-range"
                type="button"
                data-testid="tempo-clear-selection"
                aria-label={t("tempoMode.band.lane.clearSelection")}
                title={t("tempoMode.band.lane.clearSelectionTitle", {
                    key: formatBinding("Escape", isMacPlatform()),
                })}
                className="bg-accent text-text-invert absolute z-[6] flex size-16 items-center justify-center rounded-full hover:opacity-90"
                style={{
                    left: Math.max(
                        Math.max(gutterRight + 2, xOf(ui.range.from, ppb) + 2),
                        Math.min(right - 18, viewRight - 20),
                    ),
                    top: MARKS.top + 2,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    useTempoUi.getState().setRange(null);
                }}
            >
                <XIcon size={9} weight="bold" aria-hidden />
            </button>,
        );
    }
    // While the tempo line is dragged: the tempo it's at, over the stretch (Logic's help tag)
    if (gesture?.kind === "tempo") {
        const { from, to, bpmFrom, bpmTo } = gesture.segment;
        const bpm0 = (bpmFrom + bpmTo) / 2;
        const now = bpm0 / gesture.factor;
        const text =
            gesture.segment.ramp || gesture.segment.uneven
                ? `${Math.round((1 / gesture.factor) * 1000) / 10}% · ${bpmText(now)}`
                : bpmText(now);
        const left = Math.max(xOf(from, ppb), gutterRight + 2);
        const right = Math.min(xOf(to, ppb), viewRight);
        const w = textWidth(text, `600 11px ${fontFamily}`) + 10;
        const y = yOfBpm(now);
        labels.push(
            <span
                key="tempo-drag-tag"
                data-testid="tempo-drag-tag"
                className="bg-accent text-text-invert pointer-events-none absolute z-[6] rounded-[3px] px-5 text-[11px] leading-[16px] font-semibold whitespace-nowrap"
                style={{
                    left: Math.max(left, (left + right) / 2 - w / 2),
                    top: y < TEMPO.top + 22 ? y + 6 : y - 22,
                }}
            >
                {text}
            </span>,
        );
    }
    // While an end dot is dragged: the tempo the stretch will end on
    if (gesture?.kind === "end") {
        const text = bpmText(gesture.bpm);
        const x = xOf(gesture.stretch.to - 1, ppb) + ppb / 2;
        const y = yOfBpm(gesture.bpm);
        labels.push(
            <span
                key="tempo-drag-tag"
                data-testid="tempo-drag-tag"
                className="bg-accent text-text-invert pointer-events-none absolute z-[6] rounded-[3px] px-5 text-[11px] leading-[16px] font-semibold whitespace-nowrap"
                style={{
                    left: Math.min(
                        x + 10,
                        viewRight -
                            textWidth(text, `600 11px ${fontFamily}`) -
                            14,
                    ),
                    top: y < TEMPO.top + 22 ? y + 6 : y - 22,
                }}
            >
                {text}
            </span>,
        );
    }
    if (tip && !gesture) {
        const w = Math.min(300, textWidth(tip.text, `11px ${fontFamily}`) + 16);
        labels.push(
            <div
                key="tip"
                role="tooltip"
                data-testid="tempo-tip"
                className="bg-modal border-stroke text-text shadow-modal pointer-events-none absolute z-[7] rounded-[4px] border px-8 py-4 text-[11px] leading-[14px]"
                style={{
                    left: Math.max(
                        gutterRight + 2,
                        Math.min(tip.x - w / 2, viewRight - w - 4),
                    ),
                    width: w,
                    top: tip.y + 10,
                }}
            >
                {tip.text}
            </div>,
        );
    }
    return (
        <div
            ref={rootRef}
            data-testid="tempo-band"
            data-ppb={ppb}
            data-offset={data.audioOffset}
            // for scenario checks: the selection, red dots (beat:x:y), page starts
            data-range={ui.range ? `${ui.range.from}-${ui.range.to}` : ""}
            data-outliers={outliers
                .map(
                    (o) =>
                        `${o.beat}:${Math.round(xOf(o.beat, ppb) + ppb / 2)}:${Math.round(yOfBpm(o.bpm))}`,
                )
                .join(",")}
            data-page-starts={pages
                .flatMap((p) =>
                    p.counts > 0 && p.beats[0] ? [p.beats[0].index] : [],
                )
                .join(",")}
            data-marks={data.measures
                .flatMap((m) => (m.mark ? [`${m.start}:${m.mark}`] : []))
                .join(",")}
            data-measures={data.measures
                .map((m) => `${m.start}:${m.counts}:${m.number}`)
                .join(",")}
            data-holds={[...data.holds].join(",")}
            data-changes={[...changes].sort((x, y) => x - y).join(",")}
            data-counts={durations
                .slice(1, 400)
                .map((d) => d.toFixed(3))
                .join(",")}
            className="absolute left-0 select-none"
            style={{
                top,
                width,
                height: TEMPO_BAND_HEIGHT,
                cursor: gesture
                    ? gesture.kind === "tempo" || gesture.kind === "end"
                        ? "ns-resize"
                        : gesture.kind === "point"
                          ? gesture.axis === "x"
                              ? "ew-resize"
                              : "grabbing"
                          : gesture.kind === "curve"
                            ? "grabbing"
                            : undefined
                    : hover?.kind === "line" || hover?.kind === "end"
                      ? "ns-resize"
                      : hover?.kind === "point" || hover?.kind === "curve"
                        ? "grab"
                        : undefined,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => {
                e.stopPropagation();
                onPointerMove(e);
            }}
            onPointerUp={(e) => {
                e.stopPropagation();
                onPointerUp(e);
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
            onPointerLeave={() => {
                setTip(null);
                setHover(null);
            }}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
        >
            <canvas
                ref={canvasRef}
                className="pointer-events-none absolute top-0"
                style={{ left: win.left }}
            />
            {labels}
            {/* The lane names, fixed to the view's left edge while it scrolls */}
            <div
                className="border-stroke bg-bg-1 bg-fg-1 absolute top-0 border-r"
                style={{
                    left: viewLeft,
                    width: LANE_GUTTER,
                    height: TEMPO_BAND_HEIGHT,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                {LANES.map((lane) => (
                    <div
                        key={lane.name}
                        className="border-stroke text-text-subtitle absolute inset-x-0 border-b px-4 pt-3 text-[9px] leading-[12px] tracking-wide uppercase"
                        style={{ top: lane.top, height: lane.height }}
                        title={lane.title}
                    >
                        {lane.name}
                    </div>
                ))}
            </div>
            {/* The mode's header, over the transport (in a portal: it is outside the viewport) */}
            {headerSlot &&
                createPortal(
                    <TempoToolbar
                        tapTarget={tapTarget}
                        onUseTap={applyTapTempo}
                    />,
                    headerSlot,
                )}
            {/* in a portal: the timeline's viewport clips anything fixed inside it */}
            {editor &&
                createPortal(
                    <InlineEditor
                        // a new box (the whole stretch from its link) starts from its own value
                        key={editor.hint}
                        editor={editor}
                        onClose={() => setEditor(null)}
                    />,
                    document.body,
                )}
            {menu &&
                createPortal(
                    <ContextMenu
                        menu={menu}
                        onClose={() => setMenu(null)}
                        onHover={setMenuRange}
                    />,
                    document.body,
                )}
            {ask &&
                createPortal(
                    <CountAskPopover ask={ask} onClose={() => setAsk(null)} />,
                    document.body,
                )}
        </div>
    );
}

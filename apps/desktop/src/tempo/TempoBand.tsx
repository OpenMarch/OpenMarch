// cspell:ignore priya
/**
 * PROTOTYPE (tempo mode, branch tempo/track-proto): the lanes the timeline shows in place of its
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
 *   (a tempo); right-click a count in a ramp for A tempo. Double-click the lane or the line to
 *   add a change, a dot to remove it; right-click > Set tempo… types "120" or "120-90". Holds (fermatas) leave a gap marked 𝄐.
 * - **Music**: the waveform under the count lines. Drag a spot in the music onto the count it
 *   belongs to, or a count line onto its spot (Logic's Beat Mapping). The count pins; the
 *   counts back to the pin before re-space, and the counts up to the pin after (if any) too,
 *   otherwise the rest slides. Shift moves only that count line. A drag stops at a pin and says
 *   why. Dropping a spot on count 1 moves the music instead. Nothing is detected in the music:
 *   lining up is by ear and eye (detection is a later spike).
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
    PushPinIcon,
    TrashIcon,
    TrendDownIcon,
    ArrowUUpLeftIcon,
    CheckIcon,
    TrendUpIcon,
    PushPinSlashIcon,
    XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { queryClient } from "@/App";
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
    lockAfter,
    lockBefore,
    moveBeatTo,
    moveLimits,
    moveOneCount,
    movePinsWithMusic,
    rampLengths,
    respace,
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
    rampMiddle,
    rampTempos,
    shapeOf,
    stretchesOf,
    temposOf,
} from "./tempoShape";
import {
    deleteCounts,
    endMovesEarly,
    insertCounts,
    moveRehearsalMark,
    readMoves,
    type MoveSpan,
    setMeasureNumber as writeMeasureNumber,
    setRehearsalMark,
    writeDurations,
    type CountEditResult,
} from "./tempoWrites";
import { tempoSettingsKey, writeAudioOffset } from "./audioOffset";
import {
    METER_CHOICES,
    meterLabel,
    meterOfMeasure,
    parseMeter,
    quarterBpmOf,
} from "./meters";
import { planMeter, writeMeter } from "./meterWrites";
import { createLabelPlacer, textWidth, type LabelBox } from "./bandLayout";
import { useTempoModeStore } from "./tempoModeStore";
import {
    ContextMenu,
    CountAskPopover,
    FermataGlyph,
    InlineEditor,
    MarkGlyph,
    MeterGlyph,
    NumberGlyph,
    StepGlyph,
    TextGlyph,
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
    HANDLE_STRIP,
    LANES,
    LANE_GUTTER,
    LINE_GRAB_PX,
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
    upperFirst,
    useScrollWindow,
    xOf,
} from "./tempoLanesLayout";
import { CountChoice, useHeaderSlot, useTempoUi } from "./tempoUi";
import {
    NOTE_TOAST,
    TempoMeasure,
    commitEdit,
    saveMarks,
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
    const [blocked, setBlocked] = useState<{ x: number; text: string } | null>(
        null,
    );
    const [editor, setEditor] = useState<Editor | null>(null);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [ask, setAsk] = useState<CountAsk | null>(null);
    const [busy, setBusy] = useState(false);
    /** The counts the menu item under the pointer would change */
    const [menuRange, setMenuRange] = useState<CountRange | null>(null);
    useEffect(() => {
        if (!menu) setMenuRange(null);
    }, [menu]);
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

    // Tempo edits aren't mutations, so the title bar's undo and redo don't hear of them otherwise
    useEffect(
        () =>
            subscribeHistoryChanges(() => {
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
    const locks = preview?.locks ?? data.locks;
    const starts = useMemo(() => startsOf(durations), [durations]);
    // Eighths per count, from each measure's grouping (2 = a quarter): the tempo lane reads in
    // quarter notes, so 7/8 as 2+2+3 at ♩=176 reads 176, not a sawtooth
    const units = useMemo(() => {
        const out: number[] = [];
        for (const m of data.measures) {
            if (!m.meter) continue;
            const g = meterOfMeasure(m).grouping;
            if (g.length !== m.counts) continue;
            g.forEach((u, i) => (out[m.start + i] = u));
        }
        return out;
    }, [data.measures]);
    /** Count `b`'s tempo, in quarter notes per minute */
    const qBpm = useCallback(
        (b: number, d: readonly number[] = durations) =>
            quarterBpmOf(d[b]!, units[b] ?? 2),
        [durations, units],
    );
    /**
     * Each stored count's tempo as the lane reads it, in quarter notes (so groupings read as one
     * tempo); a hold isn't tempo, so it reads as the count before it. Index 0 is unused.
     */
    const laneBpms = useCallback(
        (lengths: readonly number[]) => {
            const q = (b: number) =>
                quarterBpmOf(lengths[b] ?? 0, units[b] ?? 2);
            return lengths.slice(0, data.storedCount).map((_, b) => {
                if (b === 0) return 0;
                if (!data.holds.has(b)) return q(b);
                let n = b - 1;
                while (n > 0 && data.holds.has(n)) n--;
                return q(n);
            });
        },
        [data.storedCount, data.holds, units],
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

    const run = useCallback(
        async (label: string, work: () => Promise<unknown>) => {
            if (busy) return;
            setBusy(true);
            try {
                await work();
            } catch (e) {
                toast.error(
                    `${label}: ${e instanceof Error ? e.message : String(e)}`,
                );
            } finally {
                setBusy(false);
                setPreview(null);
            }
        },
        [busy],
    );
    const commit = useCallback(
        (
            label: string,
            result:
                | (TempoEditResult & { changes?: ReadonlySet<number> })
                | null,
            audioOffset?: number,
        ) => {
            if (!result) {
                toast.error(
                    `${label}: that would make a count too fast or too slow`,
                );
                setPreview(null);
                return;
            }
            setPreview(result);
            void run(label, () =>
                commitEdit(data, result, refetch, audioOffset, changes),
            );
        },
        [data, refetch, run, changes],
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
        const xAtSeconds = (t: number) => {
            let b = 1;
            let lo = 1;
            let hi = starts.length - 2;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (starts[mid]! <= t) {
                    b = mid;
                    lo = mid + 1;
                } else hi = mid - 1;
            }
            return X(b) + ((t - starts[b]!) / (durations[b] || 1)) * ppb;
        };

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

        // count lines: faint, downbeats stronger, pins in the accent with a dot
        const downbeats = new Set(data.measures.map((m) => m.start));
        for (let b = firstBeat; b <= lastBeat; b++) {
            const x = Math.round(X(b)) + 0.5;
            const pinned = locks.has(b);
            const down = downbeats.has(b);
            if (!pinned && ppb < 6 && !down) continue;
            ctx.save();
            ctx.strokeStyle = pinned ? accent : text;
            ctx.globalAlpha = pinned ? 1 : down ? 0.5 : 0.16;
            ctx.lineWidth = pinned ? 1.5 : 1;
            ctx.beginPath();
            ctx.moveTo(x, TEMPO.top);
            ctx.lineTo(x, MUSIC.top + MUSIC.height);
            ctx.stroke();
            ctx.restore();
            // the handle a count line drags by
            ctx.fillStyle = pinned ? accent : text;
            ctx.globalAlpha = pinned ? 1 : down ? 0.55 : 0.3;
            ctx.beginPath();
            ctx.moveTo(x - 4, MUSIC.top + 1);
            ctx.lineTo(x + 4, MUSIC.top + 1);
            ctx.lineTo(x, MUSIC.top + (pinned ? 10 : 8));
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Grouped measures (7/8 as 2+2+3): the axis draws every count the same width, so each count
        // gets a bracket along the foot of the measures lane with its eighths in it ("2 2 3"), and
        // the long counts are in the accent (sam: "I can't see the long third count")
        for (const m of data.measures) {
            if (
                !m.meter ||
                m.start > lastBeat ||
                m.start + m.counts < firstBeat
            )
                continue;
            const g = Array.from(
                { length: m.counts },
                (_, i) => units[m.start + i],
            );
            if (g.some((u) => u === undefined)) continue;
            if (g.every((u) => u === 2)) continue; // plain quarters
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

        // a count line being dragged onto the music: a connector from the line to where it lands
        if (gesture?.kind === "line" && gesture.moved) {
            const x0 = X(gesture.beat);
            const x1 = xAtSeconds(gesture.seconds);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x0, MUSIC.top + 4);
            ctx.lineTo(x1, MUSIC.top + MUSIC.height - 4);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x1, MUSIC.top + MUSIC.height - 4, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        if (gesture?.kind === "grab" && gesture.beat !== null) {
            const x = Math.round(X(gesture.beat)) + 0.5;
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, MUSIC.top);
            ctx.lineTo(x, MUSIC.top + MUSIC.height);
            ctx.stroke();
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
        locks,
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
    const secondsAtX = (x: number) => {
        const beat = beatAtX(x, ppb);
        const b = Math.max(1, Math.min(durations.length - 1, Math.floor(beat)));
        return starts[b]! + (beat - b) * durations[b]!;
    };
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
            ? `m. ${m.number} count ${beat - m.start + 1}`
            : `count ${beat}`;
    };
    /** Counts `from`..`to - 1` in measure words: "m. 11 count 1 to m. 12 count 4" */
    const rangeLabel = (from: number, to: number) =>
        to - from <= 1
            ? measureLabel(from)
            : `${measureLabel(from)} to ${measureLabel(to - 1)}`;
    /** The same, shorter, in measures: "m. 11–12" */
    const measuresLabel = (from: number, to: number) => {
        const a = measureAt(from)?.number;
        const b = measureAt(Math.max(from, to - 1))?.number;
        if (a === undefined || b === undefined) return rangeLabel(from, to);
        return a === b ? `m. ${a}` : `m. ${a}–${b}`;
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
     * Where a tempo change from `beat` stops: the end of its tempo segment, or the next pin or
     * hold if that comes first (holds and pins past it are never touched)
     */
    const tempoStretchEnd = (beat: number) => {
        let end = segmentAt(beat)?.to ?? beat + 1;
        const pin = lockAfter(data.locks, beat);
        if (pin !== null && pin < end) end = pin;
        for (const h of data.holds) if (h > beat && h < end) end = h;
        return Math.max(beat + 1, end);
    };
    /** The tempo the music goes on at after `end` (past any holds), or null past the counts */
    const tempoAfter = (end: number) => {
        let b = end;
        while (data.holds.has(b)) b++;
        return b < data.storedCount ? qBpm(b, data.durations) : null;
    };
    const bpmText = (bpm: number) => `♩${Math.round(bpm * 10) / 10}`;
    /**
     * Counts `from`..`to - 1`'s tempo as the tempo lane labels it: "♩72", "♩70→60" for a gradual
     * change, "♩68–74" for an uneven stretch (jo: the label and the toast named one ramp two ways)
     */
    const stretchTempo = (
        lengths: readonly number[],
        from: number,
        to: number,
    ) => {
        const v: number[] = [];
        for (let b = from; b < to && b < lengths.length; b++)
            if (!data.holds.has(b)) v.push(qBpm(b, lengths));
        if (v.length === 0) return "a hold";
        const lo = Math.min(...v);
        const hi = Math.max(...v);
        if (hi - lo <= 1.2)
            return bpmText(v.reduce((s, x) => s + x, 0) / v.length);
        const up = v.every((x, i) => i === 0 || x >= v[i - 1]! - 0.6);
        const down = v.every((x, i) => i === 0 || x <= v[i - 1]! + 0.6);
        return up || down
            ? `♩${Math.round(v[0]!)}→${Math.round(v[v.length - 1]!)}`
            : `♩${Math.round(lo)}–${Math.round(hi)}`;
    };
    /** The stretches of counts whose lengths differ, split at `split`, with their tempo before and after */
    const changedStretches = (
        before: readonly number[],
        after: readonly number[],
        split: number,
    ) => {
        const out: (CountRange & { before: number; after: number })[] = [];
        const n = Math.min(before.length, after.length);
        const differs = (b: number) => Math.abs(before[b]! - after[b]!) > 1e-9;
        const bpm = (d: readonly number[], a: number, e: number) => {
            let sum = 0;
            for (let b = a; b < e; b++) sum += d[b]!;
            return ((e - a) * 60) / sum;
        };
        let b = 1;
        while (b < n) {
            if (!differs(b)) {
                b++;
                continue;
            }
            let e = b + 1;
            while (e < n && differs(e) && e !== split) e++;
            out.push({
                from: b,
                to: e,
                before: bpm(before, b, e),
                after: bpm(after, b, e),
            });
            b = e;
        }
        return out;
    };
    /** The music heard now */
    const audible = () =>
        getLivePlaybackPosition() -
        (LIVE_LEAD + (audioContextRef?.outputLatency ?? 0)) *
            getLivePlaybackRate();

    /**
     * Put the start of `beat` at `seconds` of music. Count 1 can't move (the show starts there),
     * so the music moves instead; after a hold, only the hold's length changes; with `one`, only
     * that count line moves; otherwise the counts back to the pin before re-space (scale left,
     * move right).
     */
    const placement = (
        beat: number,
        seconds: number,
        one: boolean,
        base = data,
    ): TempoEditResult | null => {
        if (data.holds.has(beat - 1)) {
            const r = retime(
                base.durations,
                base.locks,
                beat - 1,
                beat,
                [seconds - startsOf(base.durations)[beat - 1]!],
                { hold: true },
            );
            r.locks.add(beat);
            return r;
        }
        return one
            ? moveOneCount(base.durations, base.locks, beat, seconds)
            : moveBeatTo(base.durations, base.locks, beat, seconds);
    };
    /**
     * Move the music so `seconds` of it is on count 1. Pinned counts are on their hits, so they
     * move with the music (jo: a pin left behind crammed three hits into the pickup): the counts
     * before the first pin take up the difference, in the same undo step as the music.
     */
    const moveMusicToCountOne = (seconds: number) => {
        const offset = data.audioOffset - seconds;
        const firstPin = lockAfter(data.locks, 1);
        const moved =
            firstPin === null
                ? null
                : movePinsWithMusic(data.durations, data.locks, seconds);
        if (firstPin !== null && !moved) {
            toast.error(
                `Can't move the music that far: ${measureLabel(firstPin)} is pinned to its hit, and the counts before it would get too fast. Unpin it first, or drag a hit closer to count 1.`,
                { id: NOTE_TOAST },
            );
            return;
        }
        const said = `Moved the music ${Math.abs(seconds).toFixed(2)} s ${seconds > 0 ? "earlier" : "later"}, so that hit is on count 1`;
        void run("Music start", async () => {
            // in the show's history: it undoes like any tempo edit
            if (moved)
                await writeDurations({
                    before: data.durations,
                    after: moved,
                    pins: data.locks,
                    audioOffset: offset,
                });
            else await writeAudioOffset(offset);
            await queryClient.invalidateQueries({ queryKey: tempoSettingsKey });
            await refetch();
            toast.success(
                moved
                    ? `${said}. The pinned counts moved with the music, so they're still on their hits.`
                    : said,
            );
        });
    };

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
            data.locks,
            from,
            to,
            // quarter-note tempos; a count of a grouping is as long as its eighths
            rampLengths(to - from, bpmFrom, bpmTo).map(
                (l, i) => (l * (units[from + i] ?? 2)) / 2,
            ),
            { fixed: data.holds },
        );
        // the counts typed for are a stretch of their own: points at both ends
        const typed = new Set(changes);
        if (from > 1) typed.add(from);
        if (to < data.storedCount) typed.add(to);
        commit("Tempo", result && { ...result, changes: typed });
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
                error: `"${value}" isn't a tempo: type a number like 120, or 120-90 to change gradually`,
            };
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        return a >= 20 && a <= 400 && b >= 20 && b <= 400
            ? { tempo: [a, b] }
            : {
                  error: `"${value}" is out of range: a tempo goes from 20 to 400 beats a minute`,
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
            hint: `${
                to - from <= 1
                    ? `Tempo of ${measureLabel(from)}`
                    : `Tempo from ${measureLabel(from)} to ${measureLabel(to - 1)}`
            }: "120", or "120-90" to change gradually`,
            range: { from, to },
            onCommit: (value) => {
                const t = parseTempo(value);
                if ("tempo" in t) setTempo(from, to, t.tempo[0], t.tempo[1]);
                else toast.error(t.error);
            },
            extra:
                whole && (whole.from !== from || whole.to !== to)
                    ? {
                          label: `Whole stretch ${rangeLabel(whole.from, whole.to)} (now ♩${segmentText(whole)}) instead`,
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

    const scaleSelection = (factor: number) => {
        const r = ui.range;
        if (!r) return;
        if ([...data.locks].some((l) => l > r.from && l < r.to)) {
            toast.error(
                "There are pinned counts in the selection; unpin them first",
            );
            return;
        }
        commit(
            factor < 1 ? "Counts twice as fast" : "Counts half as fast",
            retime(
                data.durations,
                data.locks,
                r.from,
                r.to,
                data.durations.slice(r.from, r.to).map((d) => d * factor),
                { fixed: data.holds },
            ),
        );
    };

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
            const parts = [label];
            if (result.kept)
                parts.push(
                    keptText?.(result.kept) ??
                        `${result.kept} move(s) kept their counts`,
                );
            if (result.couldNotKeep)
                parts.push(
                    `${result.couldNotKeep} move(s) couldn't keep their counts and changed length`,
                );
            toast.success(parts.join(". "));
        });
    /** The stretch "keep everything else in place" re-divides: the measure, inside the pins */
    const keepSpan = (beat: number, whole: boolean) => {
        const m = measureAt(beat);
        const prevPin = lockBefore(data.locks, beat + 1);
        const nextPin = lockAfter(data.locks, beat);
        if (whole) {
            // a whole measure needs pins either side to take its time from
            return nextPin === null ? null : { a: prevPin, e: nextPin };
        }
        const a = Math.max(m?.start ?? 1, prevPin);
        const e = Math.min(
            (m?.start ?? beat) + (m?.counts ?? 1),
            nextPin ?? Infinity,
        );
        return { a, e };
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
        return p ? `Page ${p.name}` : `The move from ${measureLabel(m.start)}`;
    };
    const countsText = (n: number) => (n === 1 ? "1 count" : `${n} counts`);
    /** "m. 103 count 4, before C" when a rehearsal mark starts right after */
    const holdSpot = (end: number) => {
        const next = data.measures.find((m) => m.start === end);
        return `${measureLabel(end - 1)}${next?.mark ? `, before ${next.mark}` : ""}`;
    };
    const readMovesSafely = () => readMoves().catch(() => [] as MoveSpan[]);

    const askAdd = async (
        e: { clientX: number; clientY: number },
        at: number,
        count: number,
        what: string,
    ) => {
        const whole = count > 1;
        const span = keepSpan(at === 1 ? 1 : at - 1, whole);
        const len = data.durations[Math.max(1, at - 1)] ?? 0.5;
        const moves = await readMovesSafely();
        const page = pageAt(Math.max(1, at - 1));
        const pageText = page
            ? `Page ${page.name}: ${page.counts} → ${page.counts + count} counts`
            : `${countsText(count)} more`;
        const whose = (m: MoveSpan) =>
            page && moveName(m) === `Page ${page.name}`
                ? "its move"
                : `${moveName(m)}'s move`;
        // The moves the new counts lengthen: one running over the spot, or a page's own move
        // ending at a page boundary (the page before takes the count)
        const grows = moves.filter(
            (m) =>
                m.start < at &&
                (m.end > at || (m.end === at && isPageStart(at))),
        );
        const drill = (choice: CountChoice) => {
            if (grows.length === 0)
                return "No move runs over it, so the marchers hold through it.";
            if (grows.length === 1) {
                const m = grows[0]!;
                const n = m.end - m.start;
                return choice === "keep"
                    ? `${whose(m)} stays ${n} counts and its marchers hold ${countsText(count)} at its end.`
                    : `${whose(m)} stretches from ${n} to ${n + count} counts.`;
            }
            return choice === "keep"
                ? `The ${grows.length} moves over it keep their counts; their marchers hold ${countsText(count)} at each one's end.`
                : `The ${grows.length} moves over it each get ${countsText(count)} longer.`;
        };
        const starts = startsOf(data.durations);
        // The breath instead: the move over the spot ends a count early, no count added
        const breath =
            count === 1
                ? moves.filter(
                      (m) =>
                          m.start < at && m.end >= at && m.end - m.start >= 2,
                  )
                : [];
        const breathText = () => {
            if (breath.length === 1) {
                const m = breath[0]!;
                const n = m.end - m.start;
                return `No count is added and the music stays. ${moveName(m)}: move ${n} → ${n - 1} counts; the marchers hold on ${holdSpot(m.end)}.`;
            }
            return `No count is added and the music stays. The ${breath.length} moves over it end 1 count early; their marchers hold for that count.`;
        };
        setAsk({
            x: e.clientX,
            y: e.clientY,
            boundary:
                count === 1 &&
                (isPageStart(at) || moves.some((m) => m.end === at)),
            title: `Add ${what}`,
            intro: "For when the music has an extra beat here that the counts miss. The recording doesn't change: only the counts do.",
            range: { from: at, to: at },
            keep: span
                ? (() => {
                      const total = starts[span.e]! - starts[span.a]!;
                      const n = span.e - span.a;
                      const tempo = `${bpmText((n * 60) / total)} → ${bpmText(((n + count) * 60) / total)}`;
                      return {
                          text: `${
                              whole
                                  ? `${rangeLabel(span.a, span.e)} make room for it in the same time (${tempo})`
                                  : `${measureLabel(span.a).split(" count")[0]} gets ${n + count} counts in the same time (${tempo})`
                          }. Later counts stay on the music: for when they already are. ${pageText}. ${upperFirst(drill("keep"))}`,
                          run: () => {
                              const before = data.durations.slice(
                                  span.a,
                                  span.e,
                              );
                              const withNew = [
                                  ...before.slice(0, at - span.a),
                                  ...Array<number>(count).fill(len),
                                  ...before.slice(at - span.a),
                              ];
                              countEdit(
                                  `Added ${what}`,
                                  () =>
                                      insertCounts({
                                          at,
                                          count,
                                          duration: len,
                                          drill: "keep",
                                          respaced: {
                                              from: span.a,
                                              lengths: respace(
                                                  withNew,
                                                  withNew.length,
                                                  total,
                                              ),
                                          },
                                      }),
                                  (kept) =>
                                      `${kept === 1 ? "The move over it kept its counts: its marchers hold" : `${kept} moves kept their counts: their marchers hold`} ${countsText(count)} at the end`,
                              );
                          },
                      };
                  })()
                : {
                      text: "Pin a count after it first, so there's a stretch of music to fit it into",
                      disabled: "no pin after",
                  },
            shift: {
                text: `${countsText(count)} more time here (${(len * count).toFixed(2)} s): later counts and drill move that much later against the music, for when they were early. ${pageText}. ${upperFirst(drill("shift"))}`,
                run: () =>
                    countEdit(`Added ${what}`, () =>
                        insertCounts({
                            at,
                            count,
                            duration: len,
                            drill: "adjust",
                        }),
                    ),
            },
            hold:
                count !== 1
                    ? undefined
                    : breath.length
                      ? {
                            text: breathText(),
                            run: () =>
                                void run("Hold the drill", async () => {
                                    await endMovesEarly({
                                        timelineIds: breath.map((m) => m.id),
                                    });
                                    await refetch();
                                    toast.success(
                                        breathText().replace(
                                            "No count is added and the music stays. ",
                                            "",
                                        ),
                                    );
                                }),
                        }
                      : {
                            text: "For a breath in the drill with the music as it is: no move runs over this spot to end early.",
                            disabled: "no move here",
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
        const span = keepSpan(from, whole);
        const moves = await readMovesSafely();
        const pagesHit = pages.filter((p) => {
            const start = p.beats[0]?.index;
            return (
                start !== undefined &&
                p.counts > 0 &&
                start < to &&
                start + p.counts > from
            );
        });
        const pageText = pagesHit.length
            ? pagesHit
                  .map((p) => {
                      const start = p.beats[0]!.index;
                      const lost =
                          Math.min(to, start + p.counts) -
                          Math.max(from, start);
                      return `Page ${p.name}: ${p.counts} → ${p.counts - lost} counts`;
                  })
                  .join(", ")
            : `${countsText(removed)} fewer`;
        const whose = (m: MoveSpan) =>
            pagesHit.length === 1 && moveName(m) === `Page ${pagesHit[0]!.name}`
                ? "its move"
                : `${moveName(m)}'s move`;
        // The moves that lose counts: the ones running over a removed count
        const losing = moves.filter((m) => m.start < to && m.end > from);
        const drill = (choice: CountChoice) => {
            if (losing.length === 0) return "No move runs over it.";
            if (losing.length === 1) {
                const m = losing[0]!;
                const n = m.end - m.start;
                return choice === "keep"
                    ? `${whose(m)} keeps its ${n} counts by ending ${countsText(removed)} later, if nothing is in the way there.`
                    : `${whose(m)} gets ${countsText(removed)} shorter.`;
            }
            return choice === "keep"
                ? `The ${losing.length} moves over it keep their counts by ending later, if nothing is in the way there.`
                : `The ${losing.length} moves over it get shorter.`;
        };
        const starts = startsOf(data.durations);
        setAsk({
            x: e.clientX,
            y: e.clientY,
            title: `Remove ${what}`,
            intro: "For when the music has fewer beats here than counts. The recording doesn't change: only the counts do.",
            range: { from, to },
            keep:
                span && span.e - span.a > removed
                    ? (() => {
                          const total = starts[span.e]! - starts[span.a]!;
                          const n = span.e - span.a;
                          const tempo = `${bpmText((n * 60) / total)} → ${bpmText(((n - removed) * 60) / total)}`;
                          return {
                              text: `The counts around it fill the same time (${whole ? rangeLabel(span.a, span.e) : measureLabel(span.a).split(" count")[0]}: ${n} → ${n - removed} counts, ${tempo}). Later counts stay on the music: for when they already are. ${pageText}. ${upperFirst(drill("keep"))}`,
                              run: () => {
                                  const before = data.durations.slice(
                                      span.a,
                                      span.e,
                                  );
                                  const left = [
                                      ...before.slice(0, from - span.a),
                                      ...before.slice(to - span.a),
                                  ];
                                  countEdit(`Removed ${what}`, () =>
                                      deleteCounts({
                                          from,
                                          to,
                                          drill: "keep",
                                          respaced: {
                                              from: span.a,
                                              lengths: respace(
                                                  left,
                                                  left.length,
                                                  total,
                                              ),
                                          },
                                      }),
                                  );
                              },
                          };
                      })()
                    : {
                          text: "Pin a count after it first, so the counts around it have a stretch of music to fill",
                          disabled: "no pin after",
                      },
            shift: {
                text: `Its time goes too: later counts and drill move earlier against the music, for when they were late. ${pageText}. ${upperFirst(drill("shift"))}`,
                run: () =>
                    countEdit(`Removed ${what}`, () =>
                        deleteCounts({ from, to, drill: "adjust" }),
                    ),
            },
        });
    };

    // ---- measures and marks --------------------------------------------------------------
    const setMeasureNumber = (measure: TempoMeasure, value: string) => {
        if (measure.id === null) return;
        const n = value.trim() === "" ? null : Number(value);
        if (n !== null && !Number.isInteger(n)) {
            toast.error(`"${value}" isn't a measure number`);
            return;
        }
        void run("Measure number", async () => {
            await writeMeasureNumber({ measureId: measure.id!, number: n });
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
        if (measure.id === null) {
            toast.info("Add pages or counts out here first");
            return;
        }
        setEditor({
            x: e.clientX,
            y: e.clientY,
            value: measure.mark ?? nextMarkName(),
            hint: `Rehearsal mark at measure ${measure.number} (empty removes it)`,
            range: { from: measure.start, to: measure.start + measure.counts },
            onCommit: (value) => {
                const mark = value.trim() || null;
                const write = () =>
                    void run("Rehearsal mark", async () => {
                        await setRehearsalMark({
                            measureId: measure.id!,
                            mark,
                        });
                        await refetch();
                    });
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
                    title: `${mark} is already at m. ${other.number}. Use it again?`,
                    items: [
                        {
                            label: `Use ${mark} again at m. ${measure.number}`,
                            onSelect: write,
                        },
                        {
                            label: `Move ${mark} here from m. ${other.number}`,
                            onSelect: () =>
                                void run("Rehearsal mark", async () => {
                                    await moveRehearsalMark({
                                        fromId: other.id!,
                                        toId: measure.id!,
                                        mark,
                                    });
                                    await refetch();
                                }),
                        },
                        { label: "Cancel", onSelect: () => {} },
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
        if (measure.id === null) {
            toast.info("Add pages or counts out here first");
            return;
        }
        setEditor({
            x: e.clientX,
            y: e.clientY,
            value: String(measure.number),
            hint: `Renumber from m. ${measure.number}: the measures after count on from the number you give it. Empty goes back to counting on.`,
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
                      (!prev || prev.counts !== m.counts
                          ? textWidth(
                                meterLabel(meterOfMeasure(m)),
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
    const togglePin = (beat: number) => {
        const next = new Set(data.locks);
        if (next.has(beat)) next.delete(beat);
        else next.add(beat);
        void run("Pin", () => saveMarks({ locks: next }));
    };
    const toggleHold = (beat: number) => {
        const next = new Set(data.holds);
        const making = !next.has(beat);
        if (making) next.add(beat);
        else next.delete(beat);
        void run("Hold", async () => {
            await saveMarks({ holds: next });
            if (making)
                toast.info(
                    `${measureLabel(beat)} is a hold. Drag the next count line (or its hit) to where the music goes on.`,
                );
        });
    };

    /** Type how long a hold lasts, in seconds (it's a length, not a tempo) */
    const editHold = (e: { clientX: number; clientY: number }, b: number) =>
        setEditor({
            x: e.clientX,
            y: e.clientY,
            value: `${Math.round(data.durations[b]! * 100) / 100}`,
            hint: `How long ${measureLabel(b)} is held, in seconds`,
            range: { from: b, to: b + 1 },
            onCommit: (value) => {
                const seconds = Number(value.replace(/s$/i, "").trim());
                if (!(seconds >= 0.05 && seconds <= 600)) {
                    toast.error("A hold is a length in seconds, such as 2.5");
                    return;
                }
                commit(
                    `Held ${measureLabel(b)} for ${seconds} s`,
                    retime(data.durations, data.locks, b, b + 1, [seconds], {
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
            if (e.key === "Escape" && gestureRef.current) {
                e.preventDefault();
                e.stopPropagation();
                cancelGesture.current = true;
                setGesture(null);
                setPreview(null);
                setBlocked(null);
                return;
            }
            if (key === "t") {
                e.preventDefault();
                e.stopPropagation();
                if (e.repeat) return;
                // when the key went down (same clock as performance.now), not when this runs
                useTempoUi.getState().tap(e.timeStamp);
            } else if (key === "m" && isPlaying) {
                e.preventDefault();
                e.stopPropagation();
                const t = audible();
                let best: TempoMeasure | null = null;
                for (const m of data.measures)
                    if (
                        m.id !== null &&
                        (!best ||
                            Math.abs(starts[m.start]! - t) <
                                Math.abs(starts[best.start]! - t))
                    )
                        best = m;
                if (!best) return;
                const name = nextMarkName();
                const measure = best;
                void setRehearsalMark({ measureId: measure.id!, mark: name })
                    .then(refetch)
                    .then(() =>
                        toast.success(
                            `Rehearsal mark ${name} at measure ${measure.number}`,
                        ),
                    );
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
    const nearLine = (x: number) => {
        const b = Math.round(beatAtX(x, ppb));
        return Math.abs(xOf(b, ppb) - x) <= LINE_GRAB_PX && b >= 1 ? b : null;
    };
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
            data.locks,
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
        if (b <= 1 || b >= data.storedCount || changes.has(b)) return;
        const added = new Set(changes);
        added.add(b);
        commit(`Added a tempo change at ${measureLabel(b)}`, {
            durations: [...data.durations],
            locks: data.locks,
            changes: added,
        });
    };
    /** Remove the change at `at`: the tempo before it carries on (Logic) */
    const removeChange = (at: number) => {
        const around = aroundChange(at);
        if (!around) return;
        const { before, after } = around;
        const bpms = storedBpms();
        const carry = endTempo(
            shapeOf(bpms.slice(before.from, at)),
            bpms.slice(before.from, at),
        );
        const result = withTempos(
            at,
            after.to,
            Array<number>(after.to - at).fill(carry),
        );
        const removed = new Set(changes);
        removed.delete(at);
        commit(
            `Removed the tempo change at ${measureLabel(at)}`,
            result && { ...result, changes: removed },
        );
    };
    /**
     * Where A tempo would go back at count `b`: inside a ramp (a rit. or accel.), the rest of it
     * returns to the tempo the ramp started from; on the first count of a steady stretch right
     * after a ramp, that stretch does. Null where there's no ramp to come back from.
     */
    const aTempoAt = (b: number) => {
        const inside = storedSegments.find((s) => b >= s.from && b < s.to);
        if (!inside || inside.uneven) return null;
        if (inside.ramp && b > inside.from)
            return { from: b, to: inside.to, bpm: inside.bpmFrom };
        const before = storedSegments.find((s) => s.to === b);
        if (
            inside.from === b &&
            !inside.ramp &&
            before?.ramp &&
            Math.abs(inside.bpmFrom - before.bpmFrom) > 0.5
        )
            return { from: b, to: inside.to, bpm: before.bpmFrom };
        return null;
    };
    /** A tempo at count `b`: a steady stretch from there, back at the tempo before the ramp */
    const aTempo = (b: number) => {
        const at = aTempoAt(b);
        if (!at) return;
        const result = withTempos(
            at.from,
            at.to,
            Array<number>(at.to - at.from).fill(at.bpm),
        );
        const marked = new Set(changes);
        marked.add(at.from);
        commit(
            `A tempo at ${measureLabel(at.from)}`,
            result && { ...result, changes: marked },
        );
    };
    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        // the band owns its lanes: the timeline's own scrub mustn't take the press
        e.stopPropagation();
        cancelGesture.current = false;
        if (e.button !== 0 || busy) return;
        setMenu(null);
        setTip(null);
        const x = localX(e);
        const y = localY(e);
        const beat = beatAtX(x, ppb);
        if (y >= MUSIC.top) {
            const line = y < MUSIC.top + HANDLE_STRIP ? nearLine(x) : null;
            if (line !== null)
                setGesture({
                    kind: "line",
                    beat: line,
                    seconds: starts[line]!,
                    pointerX: x,
                    moved: false,
                    one: e.shiftKey,
                });
            else
                setGesture({
                    kind: "grab",
                    seconds: secondsAtX(x),
                    pointerX: x,
                    beat: null,
                    one: e.shiftKey,
                });
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
                    text: `${measureLabel(o.beat)} is much ${o.bpm > o.before ? "faster" : "slower"} (${bpmText(o.bpm)}) than its neighbours (${bpmText(o.before)}, ${bpmText(o.after)}): a count line may be on the wrong hit. Drag its handle onto the right hit, or leave it if the music really does that.`,
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
            // the nearest stored measure's start
            let to = gesture.measure.start;
            for (const m of data.measures)
                if (
                    m.id !== null &&
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
        if (gesture.kind === "grab") {
            if (Math.abs(x - gesture.pointerX) < 3 && gesture.beat === null)
                return;
            const beat = Math.max(1, Math.round(beatAtX(x, ppb)));
            if (beat === 1) {
                setGesture({ ...gesture, beat });
                setBlocked({
                    x: xOf(1, ppb),
                    text: "Drop to move the music so this hit is on count 1",
                });
                return;
            }
            const result = placement(beat, gesture.seconds, gesture.one);
            if (result) {
                setGesture({ ...gesture, beat });
                setPreview(result);
                setBlocked(null);
            } else {
                const lim = moveLimits(
                    data.durations,
                    data.locks,
                    beat,
                    data.holds,
                );
                setBlocked({
                    x: xOf(beat, ppb),
                    text: `Can't put it on count ${beat}: ${gesture.seconds < lim.min ? lim.minReason : lim.maxReason}`,
                });
            }
        } else if (gesture.kind === "line") {
            if (Math.abs(x - gesture.pointerX) < 3 && !gesture.moved) return;
            let seconds = secondsAtX(x);
            if (gesture.beat === 1) {
                setGesture({ ...gesture, seconds, moved: true });
                setBlocked({
                    x,
                    text: "Drop to move the music so this spot is on count 1",
                });
                return;
            }
            const lim = moveLimits(
                data.durations,
                data.locks,
                gesture.beat,
                data.holds,
            );
            let reason: string | null = null;
            if (seconds < lim.min) {
                seconds = lim.min;
                reason = lim.minReason;
            } else if (seconds > lim.max) {
                seconds = lim.max;
                reason = lim.maxReason;
            }
            setGesture({ ...gesture, seconds, moved: true });
            setBlocked(reason ? { x, text: `Stops here: ${reason}` } : null);
        } else if (gesture.kind === "point") {
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
                    data.locks,
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
        setGesture(null);
        setBlocked(null);
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
                    `m. ${target.number} already has rehearsal mark ${target.mark}`,
                );
                return;
            }
            void run("Rehearsal mark", async () => {
                await moveRehearsalMark({
                    fromId: g.measure.id!,
                    toId: target.id!,
                    mark,
                });
                await refetch();
                toast.success(
                    `Moved ${mark} from m. ${g.measure.number} to m. ${target.number}`,
                );
            });
            return;
        }
        if (g.kind === "grab" || (g.kind === "line" && !g.moved)) {
            const beat = g.kind === "grab" ? g.beat : null;
            if (beat === null) {
                useTimelineSelectionStore
                    .getState()
                    .seek(Math.round(beatAtX(localX(e), ppb)));
                // a click on the music clears the selection too
                useTempoUi.getState().setRange(null);
                setPreview(null);
                return;
            }
            if (beat === 1) {
                setPreview(null);
                moveMusicToCountOne((g as { seconds: number }).seconds);
                return;
            }
            if (!preview) return;
            sayRespaced(beat, preview);
            commit(`Pinned ${measureLabel(beat)} to the music`, preview);
        } else if (g.kind === "line") {
            if (g.beat === 1) {
                moveMusicToCountOne(g.seconds);
                return;
            }
            const result = placement(g.beat, g.seconds, g.one);
            if (result) sayRespaced(g.beat, result);
            commit(`Pinned ${measureLabel(g.beat)} to the music`, result);
        } else if (g.kind === "point") {
            if (g.axis === "x" && g.to !== g.at)
                commit(
                    `Moved the tempo change to ${measureLabel(g.to)}`,
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
                        ? `Ends on ${bpmText(g.bpm)}, then ${bpmText(next.bpmFrom)}`
                        : `Ends on ${bpmText(g.bpm)}`,
                    preview,
                );
            }
        } else if (g.kind === "curve") {
            if (preview)
                commit(
                    g.curve === 0 ? "Gradual tempo change" : "Tempo curve",
                    preview,
                );
        } else if (g.kind === "tempo") {
            if (Math.abs(g.factor - 1) < 1e-6) {
                // a click on the tempo lane clears the selection
                useTempoUi.getState().setRange(null);
                setPreview(null);
                return;
            }
            commit("Tempo", preview);
        } else {
            const from = Math.min(g.anchor, g.to);
            const to = Math.max(g.anchor, g.to);
            if (to - from >= 1) useTempoUi.getState().setRange({ from, to });
            else if (g.meterStart !== undefined)
                setMenu(signatureMenu(e.clientX, e.clientY, g.meterStart));
            else useTempoUi.getState().setRange(null);
        }
    };
    const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const x = localX(e);
        const y = localY(e);
        const beat = beatAtX(x, ppb);
        if (y >= MUSIC.top) {
            const b = nearLine(x);
            if (b !== null && data.locks.has(b)) togglePin(b);
        } else if (y >= TEMPO.top) {
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
                        "Tempo jump",
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
            if (m && m.id !== null) renumber(e, m);
        } else if (y >= MARKS.top) {
            const m = laneMeasureAt(x, y);
            if (m) editMark(e, m);
        }
    };
    /** After a drag: which counts it re-spaced, when that reaches past the counts beside it */
    const sayRespaced = (beat: number, result: TempoEditResult) => {
        const stretches = changedStretches(
            data.durations,
            result.durations,
            beat,
        );
        if (stretches.every((s) => s.from >= beat - 4 && s.to <= beat + 4))
            return;
        toast.info(
            `Pinned ${measureLabel(beat)}. Re-spaced ${stretches
                .map(
                    (s) =>
                        `${rangeLabel(s.from, s.to)}: now ${stretchTempo(result.durations, s.from, s.to)} (was ${stretchTempo(data.durations, s.from, s.to)})`,
                )
                .join("; ")}`,
            { id: "tempo-respaced" },
        );
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
            ? `m. ${m.number}, count ${beat - m.start + 1}`
            : `Count ${beat}`;
        let title: string;
        let subtitle: string | undefined;

        // D: a right-click inside the selection is about the selection
        if (range && beat >= range.from && beat < range.to) {
            title = measuresLabel(range.from, range.to);
            subtitle = `${range.to - range.from} counts`;
            items.push(
                {
                    label: "Set tempo…",
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
                    label: "Twice as fast",
                    icon: <TextGlyph>×2</TextGlyph>,
                    onSelect: () => scaleSelection(0.5),
                    range,
                },
                {
                    label: "Half as fast",
                    icon: <TextGlyph>÷2</TextGlyph>,
                    onSelect: () => scaleSelection(2),
                    range,
                },
                {
                    label: "Remove these counts…",
                    icon: <TrashIcon size={I} aria-hidden />,
                    onSelect: () => void askRemove(e, range.from, range.to),
                    range,
                    separatorBefore: true,
                },
                {
                    label: "Clear the selection",
                    icon: <XIcon size={I} aria-hidden />,
                    aside: "Esc",
                    onSelect: () => useTempoUi.getState().setRange(null),
                },
            );
        } else if (y < TEMPO.top && m) {
            // B: the marks and measures lanes: the measure
            const measure = { from: m.start, to: m.start + m.counts };
            const meter = m.meter ?? `${m.counts}/4`;
            const [top, bottom] = meter.split("/");
            title = `Measure ${m.number}`;
            subtitle = m.mark ? `${meter} · mark ${m.mark}` : meter;
            items.push(
                {
                    label: "Time signature…",
                    icon: <MeterGlyph top={top ?? ""} bottom={bottom ?? ""} />,
                    onSelect: () =>
                        setMenu(signatureMenu(e.clientX, e.clientY, m.start)),
                    range: measure,
                },
                {
                    label: "Renumber from here…",
                    icon: <NumberGlyph n={m.number} />,
                    onSelect: () => renumber(e, m),
                    range: measure,
                },
                {
                    label: m.mark ? "Rehearsal mark…" : "Add a rehearsal mark…",
                    icon: <MarkGlyph letter={m.mark ?? "A"} />,
                    onSelect: () => editMark(e, m),
                    range: measure,
                },
                {
                    label: "Add a measure before…",
                    icon: <PlusIcon size={I} aria-hidden />,
                    onSelect: () =>
                        void askAdd(
                            e,
                            m.start,
                            m.counts,
                            `a measure (${m.counts} counts) before measure ${m.number}`,
                        ),
                    range: { from: m.start, to: m.start },
                    separatorBefore: true,
                },
                {
                    label: "Remove this measure…",
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
                ? `hold ${data.durations[beat]!.toFixed(1)} s`
                : bpmText(qBpm(beat, data.durations));
            const onTempo = y < MUSIC.top;
            if (hold)
                items.push(
                    {
                        label: "Hold length…",
                        icon: <FermataGlyph />,
                        aside: `${data.durations[beat]!.toFixed(1)} s`,
                        onSelect: () => editHold(where, beat),
                        range: one,
                    },
                    {
                        label: "Not a hold",
                        icon: <FermataGlyph />,
                        onSelect: () => toggleHold(beat),
                        range: one,
                    },
                );
            if (onTempo && !hold && beat < data.storedCount) {
                if (beat > 1)
                    items.push(
                        changes.has(beat)
                            ? {
                                  label: "Remove this tempo change",
                                  icon: <StepGlyph />,
                                  onSelect: () => removeChange(beat),
                                  range: { from: beat, to: beat },
                              }
                            : {
                                  label: "Add a tempo change here",
                                  icon: <StepGlyph />,
                                  onSelect: () => addChange(beat),
                                  range: { from: beat, to: beat },
                              },
                    );
                // From this count to the end of its tempo, or the next pin or hold first
                const end = tempoStretchEnd(beat);
                const stretch = { from: beat, to: end };
                const current = qBpm(beat, data.durations);
                const last = measureAt(end - 1);
                items.push({
                    label: "Set tempo…",
                    icon: <GaugeIcon size={I} aria-hidden />,
                    aside:
                        end - beat > 1 && last
                            ? `to m. ${last.number}`
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
                        ? "Gradual change"
                        : `Gradual change to ${bpmText(target!)}`,
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
                        ? "Nothing to change to: the tempo after it is the same, or it's one count"
                        : `Ends on the tempo after it (${bpmText(target!)}); holds and pins outside stay as they are`,
                    range: stretch,
                });
                // After a rit. or accel.: back to the tempo before it, from this count
                const back = aTempoAt(beat);
                if (back)
                    items.push({
                        label: "A tempo",
                        icon: <ArrowUUpLeftIcon size={I} aria-hidden />,
                        aside: `back to ${bpmText(back.bpm)}`,
                        onSelect: () => aTempo(beat),
                        hint: `From ${measureLabel(back.from)}, back to the tempo the gradual change started at. The counts before it keep their tempo.`,
                        range: { from: back.from, to: back.to },
                    });
            }
            items.push(
                data.locks.has(beat)
                    ? {
                          label: "Unpin",
                          icon: <PushPinSlashIcon size={I} aria-hidden />,
                          onSelect: () => togglePin(beat),
                          range: { from: beat, to: beat },
                          separatorBefore: items.length > 0,
                      }
                    : {
                          label: "Pin to the music",
                          icon: <PushPinIcon size={I} aria-hidden />,
                          onSelect: () => togglePin(beat),
                          range: { from: beat, to: beat },
                          separatorBefore: items.length > 0,
                      },
            );
            if (!hold)
                items.push({
                    label: "Make a hold (fermata)",
                    icon: <FermataGlyph />,
                    onSelect: () => toggleHold(beat),
                    range: one,
                });
            items.push(
                {
                    label: "Add a count before…",
                    icon: <PlusIcon size={I} aria-hidden />,
                    onSelect: () =>
                        void askAdd(
                            e,
                            beat,
                            1,
                            `a count before ${measureLabel(beat)}`,
                        ),
                    range: { from: beat, to: beat },
                },
                {
                    label: "Add a count after…",
                    icon: <PlusIcon size={I} aria-hidden />,
                    onSelect: () =>
                        void askAdd(
                            e,
                            beat + 1,
                            1,
                            `a count after ${measureLabel(beat)}`,
                        ),
                    range: { from: beat + 1, to: beat + 1 },
                },
                {
                    label: "Remove this count…",
                    icon: <MinusIcon size={I} aria-hidden />,
                    onSelect: () => void askRemove(e, beat, beat + 1),
                    range: one,
                },
            );
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
            toast.error(
                `"${text}" isn't a time signature: try 7/8, or 7/8 2+2+3 (the grouping in eighths)`,
            );
            return;
        }
        const measureStarts = data.measures
            .filter((m) => m.id !== null)
            .map((m) => m.start);
        const label = meterLabel(meter, true);
        const was = measureAt(start);
        const old = was ? meterOfMeasure(was) : null;
        const common = {
            durations: data.durations,
            locks: data.locks,
            measureStarts,
            beatCount: data.storedCount,
            start,
            meter,
            units,
            holds: data.holds,
        };
        // This measure only: the measures after keep their meters and move to follow it (a 2/4
        // bar in a 4/4 piece brings the downbeats after it 2 counts earlier, as in the score)
        const plan = planMeter({
            ...common,
            only: only && old ? { old } : undefined,
        });
        // a meter that changes count lengths re-times the counts, which lets go of the pins
        // inside; say so (4/4 to 2/4 keeps them all)
        const dropped = [...data.locks].filter(
            (l) => !plan.result.locks.has(l),
        );
        const pinsNote = dropped.length
            ? `. Unpinned ${dropped.length} count(s) inside, since their lengths changed`
            : "";
        const by = plan.shift?.by ?? 0;
        const shiftNote = by
            ? `. The measures after it start ${Math.abs(by)} count${Math.abs(by) === 1 ? "" : "s"} ${by < 0 ? "earlier" : "later"}`
            : "";
        setPreview(plan.result);
        void run("Time signature", async () => {
            await writeMeter({ plan, before: data.durations });
            await refetch();
            toast.success(
                (only && old
                    ? `${label} for m. ${was!.number} only; the tempo is as it was`
                    : `${label} from ${measureLabel(plan.from)}, ${meter.grouping.length} counts a measure; the tempo is as it was`) +
                    shiftNote +
                    pinsNote,
                { id: NOTE_TOAST },
            );
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
                    ? `m. ${m.number} only`
                    : `From m. ${m.number}`
                : undefined,
            subtitle: only
                ? "the measures after keep theirs"
                : "until the next time signature",
            items: [
                {
                    label: "Just this measure",
                    icon: only ? (
                        <CheckIcon size={14} aria-hidden />
                    ) : undefined,
                    hint: "On: the time signature is for this measure only; the measures after keep theirs and move to follow it. Off: it lasts until the next time signature, as in a score.",
                    onSelect: () => setMenu(signatureMenu(x, y, start, !only)),
                },
                ...METER_CHOICES.map((choice, i) => ({
                    label: choice.includes(" ")
                        ? `${choice.split(" ")[0]} counted ${choice.split(" ")[1]}`
                        : choice,
                    onSelect: () => setMeter(start, choice, only),
                    separatorBefore: i === 0,
                })),
                {
                    label: "Other… (like 11/8 3+3+3+2)",
                    onSelect: () =>
                        setEditor({
                            x,
                            y,
                            value: "",
                            hint: 'Time signature, and how it is counted in eighths: "7/8 2+2+3", "5/8 3+2", "3/2" (counted in quarters)',
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
        const changed = !prev || m.counts !== prev.counts;
        // A short measure (marked *) is one cut short, not one with its own time signature: a
        // single 2/4 bar set for that measure only shows its chip
        const stored = m.meter
            ? parseMeter(m.grouping ? `${m.meter} ${m.grouping}` : m.meter)
            : null;
        const ownMeter = !!stored && stored.grouping.length === m.counts;
        const partial =
            !ownMeter &&
            !!prev &&
            m.counts < prev.counts &&
            (!next || next.counts !== m.counts);
        if (!visible) return;
        const left = xOf(m.start, ppb);
        const chip = changed && !partial;
        const chipWidth = chip
            ? textWidth(meterLabel(meterOfMeasure(m)), `10px ${fontFamily}`) +
              10
            : 0;
        const measureWidth = ppb * m.counts;
        const numberText = `${m.number}${partial ? "*" : ""}`;
        const marked = partial || m.overridden;
        const onStride = (m.number - 1) % numberStride === 0;
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
                            ? `Measure ${m.number}: a short measure, ${m.counts} count(s)`
                            : m.overridden
                              ? `Measure ${m.number}: renumbered by hand; the measures after count on from it. Right-click or double-click to change it.`
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
                        title={`Time signature ${meterLabel(meterOfMeasure(m), true)}: click to change it from here to the next change`}
                        // A press goes on to the lane, so a drag from the chip selects measures
                        // and a click without a drag opens the menu there (priya, jo); this is
                        // for Enter and Space on the focused chip
                        onClick={(e) => {
                            if (e.detail !== 0) return;
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenu(signatureMenu(r.left, r.bottom, m.start));
                        }}
                    >
                        {meterLabel(meterOfMeasure(m))}
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
                        title={`Rehearsal mark ${mark} at m. ${m.number}: drag it to another measure; double-click to rename it`}
                    >
                        {mark}
                    </span>
                ),
            });
        }
    });
    for (const s of segments) {
        if (s.to < firstBeat || s.from > lastBeat) continue;
        // the label stays in view along its segment, right of the lane names
        const left = Math.max(xOf(s.from, ppb), gutterRight) + 3;
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
        const top = y < TEMPO.top + 16 ? y + 3 : y - 14;
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
            render: (index, box) => (
                <span
                    key={`t-${s.from}`}
                    className="text-accent pointer-events-none absolute text-[10px] leading-[12px] font-medium whitespace-nowrap"
                    style={{ left: box.x, top: box.y }}
                >
                    {texts[index]}
                </span>
            ),
        });
    }
    for (const b of data.holds) {
        if (b < firstBeat || b > lastBeat) continue;
        const seconds = durations[b]!.toFixed(1);
        const texts = [`hold ${seconds}s`, `${seconds}s`];
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
    // While a hit or count line is dragged: the counts it will re-space, with their tempo now
    // and after (sam: a pin re-spaces back to the pin before, which nothing showed)
    const dragBeat =
        gesture?.kind === "grab"
            ? gesture.beat
            : gesture?.kind === "line" && gesture.moved
              ? gesture.beat
              : null;
    if (dragBeat !== null && dragBeat > 1 && gesture) {
        const result =
            gesture.kind === "grab"
                ? preview
                : gesture.kind === "line"
                  ? placement(gesture.beat, gesture.seconds, gesture.one)
                  : null;
        const stretches = result
            ? changedStretches(data.durations, result.durations, dragBeat)
            : [];
        stretches.forEach((st, i) => {
            const left = xOf(st.from, ppb);
            const w = (st.to - st.from) * ppb;
            labels.push(
                <div
                    key={`respace-${i}`}
                    className="border-accent bg-accent/10 pointer-events-none absolute border-x border-dashed"
                    style={{
                        left,
                        width: w,
                        top: TEMPO.top,
                        height: MUSIC.top + MUSIC.height - TEMPO.top,
                    }}
                />,
            );
            // named as the tempo lane will label it (jo: one ramp, two numbers)
            const was = stretchTempo(data.durations, st.from, st.to);
            const now = result
                ? stretchTempo(result.durations, st.from, st.to)
                : bpmText(st.after);
            const full = `${rangeLabel(st.from, st.to)}: now ${now} (was ${was})`;
            const short = `now ${now} (was ${was})`;
            const text =
                textWidth(full, `11px ${fontFamily}`) + 12 < w ? full : short;
            const tw = textWidth(text, `11px ${fontFamily}`) + 10;
            labels.push(
                <span
                    key={`respace-label-${i}`}
                    data-testid="tempo-respace-label"
                    className="bg-modal border-accent text-accent pointer-events-none absolute z-[5] rounded-[3px] border px-4 text-[11px] leading-[14px] whitespace-nowrap"
                    style={{
                        left: Math.max(
                            gutterRight + 2,
                            Math.min(left + w / 2 - tw / 2, viewRight - tw - 4),
                        ),
                        top: TEMPO.top + 2 + (i % 2) * 17,
                    }}
                >
                    {text}
                </span>,
            );
        });
    }
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
                {gesture.measure.mark} → m. {target?.number ?? "?"}
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
                aria-label="Clear the selection"
                title="Clear the selection (Esc)"
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
                    left: Math.min(x + 10, viewRight - 60),
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
    if (blocked) {
        const w = textWidth(blocked.text, `11px ${fontFamily}`) + 10;
        labels.push(
            <span
                key="blocked"
                className="bg-red text-text-invert pointer-events-none absolute z-[5] rounded-[3px] px-4 text-[11px] whitespace-nowrap"
                style={{
                    left: Math.max(
                        gutterRight + 2,
                        Math.min(blocked.x + 6, viewRight - w - 6),
                    ),
                    top: MUSIC.top + 14,
                }}
            >
                {blocked.text}
            </span>,
        );
    }

    return (
        <div
            ref={rootRef}
            data-testid="tempo-band"
            data-ppb={ppb}
            data-offset={data.audioOffset}
            data-pins={[...data.locks].join(",")}
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
            onPointerCancel={() => {
                setGesture(null);
                setPreview(null);
                setBlocked(null);
            }}
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
                        lockCount={data.locks.size}
                        tapTarget={tapTarget}
                        onUseTap={applyTapTempo}
                        onClearPins={() =>
                            void run("Pins", () =>
                                saveMarks({ locks: new Set() }),
                            )
                        }
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

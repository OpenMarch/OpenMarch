/**
 * Visuals mode's cue lanes, the main lanes of its own timeline
 * (`VisualsTimeline`; performer-behavior.md sections 7.1 and 7.2): for the focused who on the
 * current tab, read-only rows of broader cues, the editable lane, rows of
 * exceptions, then the result row, colored by where each value comes from,
 * hatched where the who is mixed and ringed where a flagged cue sets it.
 *
 * On the lane, a click on empty space adds a state on that count, and a drag
 * adds a phrase of that length (on a states-only channel, a state where it is
 * let go: `laneCreate`); dragging a cue moves it, dragging a phrase's end sets
 * its length, Delete removes the picked cue and Esc drops a drag or the picked
 * cues. Everything lands on a count: there is nothing between counts. A Ctrl
 * or Cmd press is the timeline's everywhere on the band (a drawn range), never
 * a cue gesture.
 */
import {
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { T, useTranslate } from "@tolgee/react";
import clsx from "clsx";
import type { CueFlagKind, CueTarget } from "@openmarch/core";
import {
    allCuesQueryOptions,
    createCuesMutationOptions,
    deleteCuesMutationOptions,
    updateCuesMutationOptions,
} from "@/hooks/queries/useCues";
import { useVisualsStore } from "@/stores/VisualsStore";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { snapSeekBeat } from "@/components/timeline/TimelinePrimitives";
import { isPageSnapDisabled } from "@/components/timeline/TimelineGeometry";
import type {
    TimelineBand,
    TimelineBandGeometry,
} from "@/components/timeline/TimelineBand";
import type { VisualsBandData } from "./useVisualsBandData";
import { pasteBeat } from "./countWhere";
import { useTargetLabel } from "./useTargetLabel";
import {
    copyCues,
    countAtBeatIndex,
    laneCreate,
    pastedCues,
    type LaneCue,
    type LaneRow,
    type ResultSpan,
} from "./visualsLanes";
import type { VisualsChannel } from "./visualsWho";

const HEADER = 26;
const GREY_ROW = 20;
const LANE = 40;
const RESULT = 24;
const GAP = 6;

/** The band's height for what it shows. */
export function visualsBandHeight(data: VisualsBandData | null): number {
    if (!data) return HEADER;
    const rows = data.lanes.broader.length + data.lanes.exceptions.length;
    return HEADER + rows * GREY_ROW + LANE + RESULT + GAP * (rows + 2);
}

const CHANNEL_KEYS: Record<VisualsChannel, string> = {
    feet: "visuals.channels.feet",
    horn_equipment: "visuals.channels.hornEquipment",
    facing: "visuals.channels.facing",
    body: "visuals.channels.body",
};

const SOURCE_CLASS: Record<NonNullable<ResultSpan["source"]>, string> = {
    own: "bg-accent/70 text-text-invert",
    broader: "bg-text/25 text-text",
    exception: "bg-yellow/60 text-text",
    default: "bg-fg-2 text-text-subtitle",
};

const HATCH = {
    backgroundImage:
        "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-text) 25%, transparent) 0 4px, transparent 4px 8px)",
};

/**
 * A cue's block on a row. A state is its ramp into its count (a snap has
 * none), then its value holding until the next cue, with the label; a
 * phrase is its span.
 */
function CueBlock({
    cue,
    pixelsPerBeat,
    height,
    className,
    rampClassName,
    children,
    style,
    ...rest
}: {
    cue: LaneCue;
    pixelsPerBeat: number;
    height: number;
    className?: string;
    /** The ramp's tint, for states. */
    rampClassName?: string;
    children?: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
    const left = cue.from * pixelsPerBeat;
    const width = (cue.holdTo - cue.from) * pixelsPerBeat;
    const ramp = cue.kind === "state" ? (cue.to - cue.from) * pixelsPerBeat : 0;
    return (
        <div
            {...rest}
            className={clsx(
                "rounded-4 absolute top-0 flex items-center overflow-hidden text-[10px] leading-none whitespace-nowrap",
                className,
            )}
            style={{
                ...style,
                left,
                width: Math.max(width, 6),
                height,
                paddingLeft: ramp + 4,
            }}
            title={cue.label}
        >
            {ramp > 0 && (
                <div
                    aria-hidden
                    className={clsx(
                        "pointer-events-none absolute top-0 left-0 h-full",
                        rampClassName,
                    )}
                    style={{ width: ramp }}
                />
            )}
            {children}
        </div>
    );
}

function GreyRow({
    row,
    label,
    pixelsPerBeat,
    flags,
    onGo,
}: {
    row: LaneRow;
    label: string;
    pixelsPerBeat: number;
    flags: ReadonlyMap<number, readonly CueFlagKind[]>;
    onGo: (target: CueTarget) => void;
}) {
    const { t } = useTranslate();
    return (
        <div
            className="relative"
            style={{ height: GREY_ROW }}
            data-testid={`visuals-row-${row.key}`}
        >
            {row.cues.map((cue) => (
                <CueBlock
                    key={cue.id}
                    cue={cue}
                    pixelsPerBeat={pixelsPerBeat}
                    height={GREY_ROW - 3}
                    data-flagged={flags.has(cue.id) || undefined}
                    className={clsx(
                        "bg-text/15 text-text-subtitle hover:bg-text/25 cursor-pointer",
                        flags.has(cue.id) && FLAG_RING,
                    )}
                    rampClassName="bg-gradient-to-r from-transparent to-text/25"
                    onPointerDown={(e) => {
                        if (!isTimelinePress(e)) e.stopPropagation();
                    }}
                    onClick={(e) => {
                        if (!isTimelinePress(e)) onGo(row.target);
                    }}
                >
                    {t("visuals.band.rowCue", { who: label, value: cue.label })}
                </CueBlock>
            ))}
        </div>
    );
}

type Gesture =
    /** A drag on empty lane: what `laneCreate` makes of it. */
    | { kind: "create"; start: number; end: number }
    /** A cue dragged by `grab` counts from its count. */
    | { kind: "move"; cue: LaneCue; grab: number; count: number }
    /** A phrase's end dragged: the count after its last. */
    | { kind: "length"; cue: LaneCue; to: number }
    /** A state's ramp start dragged: its transition's first count. */
    | { kind: "ramp"; cue: LaneCue; from: number };

const FLAG_RING = "ring-red ring-2";
const NO_FLAGS: ReadonlyMap<number, readonly CueFlagKind[]> = new Map();

/**
 * Whether a press is the timeline's (section 7.2): Ctrl or Cmd is never a
 * cue gesture, so the band lets it through to the timeline's own handlers.
 * Visuals' timeline is read-only and draws no range: such a drag scrubs.
 */
const isTimelinePress = (e: { ctrlKey: boolean; metaKey: boolean }) =>
    e.ctrlKey || e.metaKey;

function EditableLane({
    data,
    pixelsPerBeat,
    snapBeats,
    flags,
    pasteAt,
}: {
    data: VisualsBandData;
    pixelsPerBeat: number;
    snapBeats: readonly number[];
    flags: ReadonlyMap<number, readonly CueFlagKind[]>;
    /** Pastes the clipboard at the playhead onto the focused who. */
    pasteAt: () => void;
}) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const { data: cues } = useQuery(allCuesQueryOptions());
    const { mutate: createCues } = useMutation(
        createCuesMutationOptions(queryClient),
    );
    const { mutate: updateCues } = useMutation(
        updateCuesMutationOptions(queryClient),
    );
    const { mutate: deleteCues } = useMutation(
        deleteCuesMutationOptions(queryClient),
    );
    const selected = useVisualsStore((s) => s.selectedCueIds);
    const selectCue = useVisualsStore((s) => s.selectCue);
    const clearSelectedCues = useVisualsStore((s) => s.clearSelectedCues);
    const setClipboard = useVisualsStore((s) => s.setClipboard);
    const laneRef = useRef<HTMLDivElement>(null);
    const [gesture, setGestureState] = useState<Gesture | null>(null);
    // The gesture as of the last pointer event, so a release reads the last
    // move even before React has drawn it
    const gestureRef = useRef<Gesture | null>(null);
    const setGesture = (next: Gesture | null) => {
        gestureRef.current = next;
        setGestureState(next);
    };
    const countTotal = data.counts.beatIdOfCount.length;
    const clamp = (c: number, max = countTotal - 1) =>
        Math.max(0, Math.min(max, c));
    /** The count at `clientX`, pulled to a page line or downbeat unless Alt is down. */
    const beatAt = (clientX: number, alt: boolean) => {
        const left = laneRef.current?.getBoundingClientRect().left ?? 0;
        return snapSeekBeat(
            (clientX - left) / pixelsPerBeat,
            snapBeats,
            pixelsPerBeat,
            isPageSnapDisabled({ altKey: alt }),
        );
    };
    const { target, channel, carries } = data;

    // What a press from `start` to `end` adds, and so what the lane draws while it's held
    const creating = (start: number, end: number) =>
        laneCreate(channel, carries, start, end);
    const add = (start: number, end: number) => {
        const made = creating(start, end);
        if (!target || !made) return;
        createCues([
            {
                channel,
                kind: made.kind,
                target,
                beatId: data.counts.beatIdOfCount[made.count]!,
                value: made.value,
                length: made.kind === "phrase" ? made.length : null,
                ...(made.settings ? { settings: made.settings } : {}),
            },
        ]);
    };

    const onLanePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (isTimelinePress(e)) return;
        // the lane's gestures, not the timeline's scrub or range
        e.stopPropagation();
        laneRef.current?.focus();
        if (e.button !== 0 || !target || countTotal === 0) return;
        const start = clamp(beatAt(e.clientX, e.altKey));
        e.currentTarget.setPointerCapture(e.pointerId);
        clearSelectedCues();
        setGesture({ kind: "create", start, end: start });
    };
    const startCueGesture =
        (cue: LaneCue, kind: "move" | "length" | "ramp") =>
        (e: ReactPointerEvent<HTMLDivElement>) => {
            if (isTimelinePress(e)) return;
            e.stopPropagation();
            laneRef.current?.focus();
            if (e.button !== 0) return;
            // Shift adds the cue to the picked ones, or takes it out; no drag
            if (e.shiftKey && kind === "move") {
                selectCue(cue.id, true);
                return;
            }
            laneRef.current?.setPointerCapture(e.pointerId);
            if (!selected.includes(cue.id)) selectCue(cue.id);
            if (kind === "move")
                setGesture({
                    kind,
                    cue,
                    grab: Math.round(beatAt(e.clientX, true)) - cue.count,
                    count: cue.count,
                });
            else if (kind === "length") setGesture({ kind, cue, to: cue.to });
            else setGesture({ kind, cue, from: cue.from });
        };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const beat = beatAt(e.clientX, e.altKey);
        switch (gesture.kind) {
            case "create":
                setGesture({ ...gesture, end: clamp(beat) });
                break;
            case "move":
                setGesture({ ...gesture, count: clamp(beat - gesture.grab) });
                break;
            case "length":
                setGesture({
                    ...gesture,
                    to: clamp(beat, countTotal),
                });
                break;
            case "ramp":
                setGesture({
                    ...gesture,
                    from: Math.min(gesture.cue.count, clamp(beat)),
                });
        }
    };
    const onPointerUp = () => {
        const g = gestureRef.current;
        setGesture(null);
        if (!g) return;
        if (g.kind === "create") add(g.start, g.end);
        else if (g.kind === "move" && g.count !== g.cue.count)
            updateCues([
                {
                    id: g.cue.id,
                    beatId: data.counts.beatIdOfCount[g.count]!,
                },
            ]);
        else if (g.kind === "length" && g.to !== g.cue.to)
            updateCues([
                { id: g.cue.id, length: Math.max(2, g.to - g.cue.from) },
            ]);
        else if (g.kind === "ramp" && g.from !== g.cue.from)
            updateCues([
                {
                    id: g.cue.id,
                    transitionLength: g.cue.count - g.from + 1,
                },
            ]);
    };
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const mod = e.metaKey || e.ctrlKey;
        if (e.key === "Escape" && (gestureRef.current || selected.length)) {
            // Esc drops a drag in progress, saving nothing, and the picked cues
            e.preventDefault();
            e.stopPropagation();
            setGesture(null);
            clearSelectedCues();
        } else if (
            (e.key === "Delete" || e.key === "Backspace") &&
            selected.length
        ) {
            e.preventDefault();
            e.stopPropagation();
            deleteCues(new Set(selected));
            clearSelectedCues();
        } else if (mod && e.key.toLowerCase() === "c" && selected.length) {
            e.preventDefault();
            e.stopPropagation();
            const copied = copyCues(cues ?? [], selected, data.counts);
            if (copied) setClipboard(copied);
        } else if (mod && e.key.toLowerCase() === "v") {
            e.preventDefault();
            e.stopPropagation();
            pasteAt();
        }
    };

    // what the lane draws while a gesture runs
    const shown = data.lanes.own.map((cue): LaneCue => {
        if (gesture?.kind === "move" && gesture.cue.id === cue.id) {
            const shift = gesture.count - cue.count;
            return {
                ...cue,
                count: gesture.count,
                from: cue.from + shift,
                to: cue.to + shift,
                holdTo: cue.holdTo + shift,
            };
        }
        if (gesture?.kind === "length" && gesture.cue.id === cue.id) {
            const to = Math.max(cue.from + 2, gesture.to);
            return { ...cue, to, holdTo: to };
        }
        if (gesture?.kind === "ramp" && gesture.cue.id === cue.id)
            return { ...cue, from: gesture.from };
        return cue;
    });
    // A drag on empty lane draws what its release adds: a phrase's span, or one count
    const preview =
        gesture?.kind === "create"
            ? creating(gesture.start, gesture.end)
            : null;
    const flagTitle = (cue: LaneCue) => {
        const kinds = flags.get(cue.id);
        return kinds
            ? t("visuals.band.flaggedCue", {
                  value: cue.label,
                  // each problem is a sentence of its own, one per line
                  problems: kinds
                      .map((k) => t(`visuals.flags.${k}`))
                      .join("\n"),
              })
            : cue.label;
    };

    return (
        <div
            ref={laneRef}
            role="group"
            aria-label={t("visuals.band.lane")}
            tabIndex={0}
            data-testid="visuals-lane"
            className={clsx(
                "rounded-4 bg-fg-2/60 relative outline-none",
                target ? "cursor-crosshair" : "cursor-not-allowed",
            )}
            style={{ height: LANE }}
            onPointerDown={onLanePointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setGesture(null)}
            onKeyDown={onKeyDown}
        >
            {shown.map((cue) => {
                const picked = selected.includes(cue.id);
                const flagged = flags.has(cue.id);
                return cue.kind === "phrase" ? (
                    // a phrase's span is the phrase: grab it anywhere
                    <CueBlock
                        key={cue.id}
                        cue={cue}
                        pixelsPerBeat={pixelsPerBeat}
                        height={LANE}
                        data-testid={`visuals-cue-${cue.id}`}
                        data-count={cue.count}
                        data-flagged={flagged || undefined}
                        aria-selected={picked}
                        title={flagTitle(cue)}
                        className={clsx(
                            "bg-accent/40 border-accent cursor-grab border pr-6 text-[11px]",
                            picked && "ring-text ring-1",
                            flagged && FLAG_RING,
                        )}
                        onPointerDown={startCueGesture(cue, "move")}
                    >
                        <span className="pointer-events-none truncate">
                            {cue.label}
                        </span>
                        <div
                            data-testid={`visuals-cue-${cue.id}-end`}
                            className="absolute top-0 right-0 h-full w-6 cursor-ew-resize"
                            onPointerDown={startCueGesture(cue, "length")}
                        />
                    </CueBlock>
                ) : (
                    // a state: its hold is paint, so a click there adds a cue;
                    // its ramp and its own count are the grip, and the ramp's
                    // start sets its transition
                    <div key={cue.id}>
                        <CueBlock
                            cue={cue}
                            pixelsPerBeat={pixelsPerBeat}
                            height={LANE}
                            className={clsx(
                                "bg-accent/15 border-accent/40 pointer-events-none border pr-6 text-[11px]",
                                picked && "ring-text ring-1",
                                flagged && FLAG_RING,
                            )}
                            rampClassName="bg-gradient-to-r from-transparent to-accent/50"
                        >
                            <span className="truncate">{cue.label}</span>
                        </CueBlock>
                        <div
                            data-testid={`visuals-cue-${cue.id}`}
                            data-count={cue.count}
                            data-flagged={flagged || undefined}
                            aria-selected={picked}
                            title={flagTitle(cue)}
                            className="absolute top-0 cursor-grab"
                            style={{
                                left: cue.from * pixelsPerBeat,
                                width: Math.max(
                                    10,
                                    (cue.to + 1 - cue.from) * pixelsPerBeat,
                                ),
                                height: LANE,
                            }}
                            onPointerDown={startCueGesture(cue, "move")}
                        >
                            <div
                                data-testid={`visuals-cue-${cue.id}-ramp`}
                                className="absolute top-0 left-0 h-full w-6 cursor-ew-resize"
                                onPointerDown={startCueGesture(cue, "ramp")}
                            />
                        </div>
                    </div>
                );
            })}
            {preview && (
                <div
                    data-testid="visuals-lane-preview"
                    data-kind={preview.kind}
                    className="bg-accent/30 rounded-4 pointer-events-none absolute top-0"
                    style={{
                        left: preview.count * pixelsPerBeat,
                        width: preview.length * pixelsPerBeat,
                        height: LANE,
                    }}
                />
            )}
        </div>
    );
}

function ResultRow({
    spans,
    pixelsPerBeat,
}: {
    spans: ResultSpan[];
    pixelsPerBeat: number;
}) {
    const { t } = useTranslate();
    return (
        <div
            className="relative"
            style={{ height: RESULT }}
            data-testid="visuals-result"
        >
            {spans.map((s) => (
                <div
                    key={s.from}
                    data-testid="visuals-result-span"
                    data-source={s.mixed ? "mixed" : s.source}
                    data-flagged={s.flagged || undefined}
                    className={clsx(
                        "absolute top-0 flex items-center overflow-hidden border-r border-r-black/10 px-4 text-[10px] leading-none whitespace-nowrap",
                        s.mixed ? "text-text" : SOURCE_CLASS[s.source!],
                        s.flagged && FLAG_RING,
                    )}
                    style={{
                        left: s.from * pixelsPerBeat,
                        width: (s.to - s.from) * pixelsPerBeat,
                        height: RESULT - 2,
                        ...(s.mixed ? HATCH : {}),
                    }}
                    title={s.mixed ? t("visuals.band.mixed") : (s.label ?? "")}
                >
                    {s.mixed ? t("visuals.band.mixed") : s.label}
                </div>
            ))}
        </div>
    );
}

function BandBody({
    data,
    geometry,
}: {
    data: VisualsBandData | null;
    geometry: TimelineBandGeometry;
}) {
    const { t } = useTranslate();
    const toggleFocus = useVisualsStore((s) => s.toggleFocus);
    const label = useTargetLabel();
    const { pixelsPerBeat, top, width, snapBeats } = geometry;
    const clipboard = useVisualsStore((s) => s.clipboard);
    const beatIndex = useTimelineSelectionStore(displayedBeat);
    const { beats, pages } = useTimingObjects();
    const queryClient = useQueryClient();
    const { mutate: createCues } = useMutation(
        createCuesMutationOptions(queryClient),
    );
    const flags = data?.flags ?? NO_FLAGS;
    // a paste goes on the same channel only (section 7.4)
    const canPaste =
        !!data?.target && !!clipboard && clipboard.channel === data.channel;
    const pasteAt = () => {
        if (!data?.target || !clipboard || !canPaste) return;
        // After a page box, on the page's first count, not its last (`pasteBeat`)
        const from = pasteBeat(
            beatIndex,
            useTimelineSelectionStore.getState().selection,
            pages,
        );
        const count = countAtBeatIndex(beats, from, data.counts);
        if (count === null) return;
        const made = pastedCues(clipboard, count, data.target, data.counts);
        // one undoable edit for the whole paste
        if (made.length) createCues(made);
    };

    // a grey row's cue goes to its who; a hand-picked set isn't one yet
    const goTo = (target: CueTarget) => {
        if (target.kind === "band") toggleFocus({ kind: "band" });
        else if (target.kind === "section")
            toggleFocus({ kind: "section", section: target.section });
        else if (target.kind === "tag")
            toggleFocus({ kind: "tag", tagId: target.tagId });
    };

    const title = data
        ? t("visuals.band.editing", {
              channel: t(CHANNEL_KEYS[data.channel]),
              who: label(data.target),
          })
        : t("visuals.band.focusFirst");

    return (
        <div
            data-testid="visuals-band"
            className="border-stroke absolute left-0 border-t"
            style={{ top, width, height: visualsBandHeight(data) }}
            onPointerDown={(e) => {
                if (!isTimelinePress(e)) e.stopPropagation();
            }}
        >
            <div
                className="sticky left-0 flex w-fit items-center gap-4"
                style={{ height: HEADER }}
            >
                <span
                    className="text-text-subtitle px-4 text-[11px]"
                    data-testid="visuals-band-title"
                >
                    {title}
                </span>
                {data && !data.target && (
                    <span className="text-yellow text-[11px]">
                        <T keyName="visuals.band.selectFirst" />
                    </span>
                )}
                {canPaste && (
                    <button
                        type="button"
                        className="text-accent text-[11px] hover:underline"
                        onClick={pasteAt}
                        data-testid="visuals-band-paste"
                    >
                        {t("visuals.band.paste", {
                            count: clipboard!.cues.length,
                        })}
                    </button>
                )}
                {flags.size > 0 && (
                    <span
                        className="text-red text-[11px]"
                        data-testid="visuals-band-flags"
                    >
                        {t("visuals.band.flagged", { count: flags.size })}
                    </span>
                )}
            </div>
            {data && (
                <div className="flex flex-col" style={{ gap: GAP }}>
                    {data.lanes.broader.map((row) => (
                        <GreyRow
                            key={row.key}
                            row={row}
                            label={label(row.target)}
                            pixelsPerBeat={pixelsPerBeat}
                            flags={flags}
                            onGo={goTo}
                        />
                    ))}
                    <EditableLane
                        data={data}
                        pixelsPerBeat={pixelsPerBeat}
                        snapBeats={snapBeats}
                        flags={flags}
                        pasteAt={pasteAt}
                    />
                    {data.lanes.exceptions.map((row) => (
                        <GreyRow
                            key={row.key}
                            row={row}
                            label={label(row.target)}
                            pixelsPerBeat={pixelsPerBeat}
                            flags={flags}
                            onGo={goTo}
                        />
                    ))}
                    <ResultRow
                        spans={data.result}
                        pixelsPerBeat={pixelsPerBeat}
                    />
                </div>
            )}
        </div>
    );
}

/** Visuals mode's lanes for its timeline: their height and what they draw. */
export function visualsTimelineBand(
    data: VisualsBandData | null,
): TimelineBand {
    return {
        height: visualsBandHeight(data),
        render: (geometry: TimelineBandGeometry) => (
            <BandBody data={data} geometry={geometry} />
        ),
    };
}

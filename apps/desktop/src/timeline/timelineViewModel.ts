import type { AssignmentRow, Diagnostic, SpanInfo } from "@openmarch/core";
import type {
    TimelineInput,
    TimelineLegInput,
} from "@/components/timeline/Timeline";
import type {
    TimelineActivitySpan,
    TimelineTrackDiagnostics,
} from "@/components/timeline/TimelineViewModel";

/**
 * The view-model adapter (docs/timeline/ui.md, "Mapping the spec onto the view model";
 * docs/timeline/phases/08-authoring-ui.md P8.8). Pure: the stored timeline tables, the resolver's
 * spans and its diagnostics in, the timeline's tracks out. Nothing it builds is stored.
 *
 * Under UI-9 the app draws one track per stored timeline (`buildTimelineClipTracks`). The marcher
 * and shape tracks below (`buildTimelineTracks`, UI-3) are what it drew before.
 *
 * - **Marcher track:** one per spec timeline in which the marcher has an assignment. The clip runs
 *   from the marcher's first assignment start to its last assignment end in that timeline. Its
 *   legs are the marcher's resolver spans (R-2) inside the clip: a hold span is `hold`, any other
 *   span is `move`. A span is active where the marcher's winning span belongs to an assignment in
 *   this timeline, and inactive otherwise (UI-1): stolen by a higher layer elsewhere, or no
 *   assignment here.
 * - **Shape track:** one per spec timeline and shape used as a destination in it, standing for the
 *   transitions into that shape. The clip spans those transitions; their ranges are `move` legs
 *   and any gap between them is a `hold` leg, unless another shape's transition occupies the gap,
 *   which starts a new clip. A span is active where at least one member's
 *   winning span is in those transitions, and inactive where all are stolen or none is assigned
 *   (U-Q4, decided in ui.md).
 * - **Linked clips:** every track carries its spec timeline id as `linkId`, because moving a clip
 *   moves its whole timeline (ui.md, `TimelineRangeChange`).
 * - **Diagnostics (§8.9):** a track's badge lists the diagnostics of its transitions that concern
 *   its target: for a shape, all of them; for a marcher, the ones about that marcher. A
 *   transition-wide one (such as `D-VACANT`) of a transition without a shape shows once, on the
 *   first shown marcher track assigned to it.
 * - **Default track set (U-Q1, decided in ui.md):** every shape track, plus the marcher tracks of
 *   individually moved marchers (assigned to a one-slot transition without a shape in that
 *   timeline) and of the selected marchers. `"all"` shows every marcher track.
 *
 * Every range here is in spec beat positions (spec §7). `Timeline` maps them onto the view's beat
 * axis (`createTimelineBeatAxis`), which hides the zero-length beat 0.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface TimelineViewTimeline {
    readonly id: number;
    readonly name: string | null;
    readonly start: number;
    readonly end: number;
}

export interface TimelineViewTransition {
    readonly id: number;
    readonly timelineId: number;
    /** null: slots are placed individually (D-16) */
    readonly destShapeId: number | null;
    readonly slotCount: number;
    readonly start: number;
    readonly end: number;
}

export interface TimelineViewShape {
    readonly id: number;
    readonly name: string | null;
}

export interface TimelineViewMarcher {
    readonly id: number;
    /** Drill number, such as "T3" */
    readonly label: string;
}

/** The stored rows the adapter reads (spec §5.1). */
export interface TimelineViewTables {
    readonly timelines: readonly TimelineViewTimeline[];
    readonly transitions: readonly TimelineViewTransition[];
    readonly assignments: readonly AssignmentRow[];
    readonly shapes: readonly TimelineViewShape[];
    readonly marchers: readonly TimelineViewMarcher[];
}

export interface TimelineViewSources {
    readonly tables: TimelineViewTables;
    /**
     * A marcher's resolver spans (R-2), sorted, partitioning (-Infinity, +Infinity). Called only
     * for marchers whose spans a track needs. See `resolverSpans` in `timelineStore.ts`.
     */
    readonly spansOf: (marcherId: number) => readonly SpanInfo[];
    readonly diagnostics: readonly Diagnostic[];
}

/** Which tracks to build (U-Q1). */
export type TimelineTrackFilter =
    | {
          readonly kind: "default";
          readonly selectedMarcherIds: ReadonlySet<number>;
      }
    | { readonly kind: "all" };

// ---------------------------------------------------------------------------
// Track ids and colors
// ---------------------------------------------------------------------------

export const marcherTrackId = (timelineId: number, marcherId: number) =>
    `timeline-${timelineId}-marcher-${marcherId}`;

export const shapeTrackId = (timelineId: number, shapeId: number) =>
    `timeline-${timelineId}-shape-${shapeId}`;

/** One color per spec timeline, so linked clips share it. */
export const TIMELINE_TRACK_COLORS = [
    "#2fc4b2",
    "#e79b00",
    "#e56a82",
    "#7c8cf8",
    "#62b851",
    "#c27be0",
    "#e0784a",
    "#4aa3e0",
] as const;

// ---------------------------------------------------------------------------
// Interval helpers (half-open [start, end), spec §7)
// ---------------------------------------------------------------------------

interface Interval {
    start: number;
    end: number;
}

/** Sorted, non-overlapping union of `intervals`, merging ones that touch. */
function union(intervals: Interval[]): Interval[] {
    const sorted = intervals
        .filter((i) => i.end > i.start)
        .sort((a, b) => a.start - b.start);
    const out: Interval[] = [];
    for (const i of sorted) {
        const last = out[out.length - 1];
        if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
        else out.push({ ...i });
    }
    return out;
}

/** Partitions `clip` into active spans (inside `active`, a sorted union) and inactive ones. */
function activityOver(
    clip: Interval,
    active: Interval[],
): TimelineActivitySpan[] {
    const out: TimelineActivitySpan[] = [];
    const push = (start: number, end: number, isActive: boolean) => {
        if (end <= start) return;
        const last = out[out.length - 1];
        if (last && last.active === isActive && last.endBeatIndex === start) {
            out[out.length - 1] = { ...last, endBeatIndex: end };
            return;
        }
        out.push({
            startBeatIndex: start,
            endBeatIndex: end,
            active: isActive,
        });
    };
    let cursor = clip.start;
    for (const i of active) {
        const start = Math.max(i.start, clip.start);
        const end = Math.min(i.end, clip.end);
        if (end <= start) continue;
        push(cursor, start, false);
        push(start, end, true);
        cursor = end;
    }
    push(cursor, clip.end, false);
    return out;
}

function diagnosticsBadge(
    diagnostics: readonly Diagnostic[],
): TimelineTrackDiagnostics | undefined {
    if (diagnostics.length === 0) return undefined;
    return {
        level: diagnostics.some((d) => d.level === "warning")
            ? "warning"
            : "info",
        messages: diagnostics.map((d) => `${d.code}: ${d.message}`),
    };
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

/** Groups `items` by `key`, keeping their order. */
function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
    const out = new Map<K, T[]>();
    for (const item of items) {
        const k = key(item);
        const list = out.get(k);
        if (list) list.push(item);
        else out.set(k, [item]);
    }
    return out;
}

/** What every track of one build reads, indexed once. */
interface BuildContext {
    readonly filter: TimelineTrackFilter;
    readonly transitionById: ReadonlyMap<number, TimelineViewTransition>;
    readonly transitionsByTimeline: ReadonlyMap<
        number,
        TimelineViewTransition[]
    >;
    readonly rowsByTransition: ReadonlyMap<number, AssignmentRow[]>;
    readonly shapeName: ReadonlyMap<number, string | null>;
    readonly marcherLabel: ReadonlyMap<number, string>;
    readonly diagnosticsByTransition: ReadonlyMap<number, Diagnostic[]>;
    /** Memoized `sources.spansOf` */
    readonly spansOf: (marcherId: number) => readonly SpanInfo[];
}

/**
 * Builds the timeline's tracks from the spec model. The result's ranges are spec beat positions;
 * the order is by timeline, then shape tracks, then marcher tracks.
 */
export function buildTimelineTracks(
    sources: TimelineViewSources,
    filter: TimelineTrackFilter,
): TimelineInput[] {
    const { tables } = sources;
    const spanCache = new Map<number, readonly SpanInfo[]>();
    const context: BuildContext = {
        filter,
        transitionById: new Map(tables.transitions.map((t) => [t.id, t])),
        transitionsByTimeline: groupBy(tables.transitions, (t) => t.timelineId),
        rowsByTransition: groupBy(tables.assignments, (r) => r.transition),
        shapeName: new Map(tables.shapes.map((s) => [s.id, s.name])),
        marcherLabel: new Map(tables.marchers.map((m) => [m.id, m.label])),
        diagnosticsByTransition: groupBy(
            sources.diagnostics,
            (d) => d.transitionId,
        ),
        spansOf: (marcherId) => {
            let spans = spanCache.get(marcherId);
            if (!spans)
                spanCache.set(marcherId, (spans = sources.spansOf(marcherId)));
            return spans;
        },
    };
    return [...tables.timelines]
        .sort((a, b) => a.start - b.start || a.id - b.id)
        .flatMap((timeline, index) =>
            tracksOfTimeline(
                context,
                timeline,
                TIMELINE_TRACK_COLORS[index % TIMELINE_TRACK_COLORS.length],
            ),
        );
}

export const timelineTrackId = (timelineId: number) => `timeline-${timelineId}`;

/**
 * One track per stored timeline (ui.md UI-9 "Tracks"; P8.11), however many transitions it holds,
 * so a group of one-slot transitions is one clip. This supersedes the marcher and shape tracks of
 * `buildTimelineTracks` (UI-3) in timeline mode.
 *
 * - **Clip:** the timeline's range (C-11), one `move` leg. A stored timeline with nobody in it
 *   still shows (UI-9: removing marchers never deletes a timeline).
 * - **Activity:** active where at least one member's winning span (R-2) is in one of its
 *   transitions, and inactive where every member is stolen or there are none (UI-4's rule over
 *   the whole timeline).
 * - **Diagnostics:** every diagnostic of its transitions.
 * - **Order and color:** by start, then id; one color per timeline, as `buildTimelineTracks`.
 *
 * How a selected marcher's spans (UI-1) show inside the one track is open (ui.md U-Q5 TODO).
 */
export function buildTimelineClipTracks(
    sources: TimelineViewSources,
): TimelineInput[] {
    const { tables } = sources;
    const transitionsByTimeline = groupBy(
        tables.transitions,
        (t) => t.timelineId,
    );
    const rowsByTransition = groupBy(tables.assignments, (r) => r.transition);
    const diagnosticsByTransition = groupBy(
        sources.diagnostics,
        (d) => d.transitionId,
    );
    const spanCache = new Map<number, readonly SpanInfo[]>();
    const spansOf = (marcherId: number) => {
        let spans = spanCache.get(marcherId);
        if (!spans)
            spanCache.set(marcherId, (spans = sources.spansOf(marcherId)));
        return spans;
    };
    return [...tables.timelines]
        .sort((a, b) => a.start - b.start || a.id - b.id)
        .map((timeline, index) => {
            const transitions = transitionsByTimeline.get(timeline.id) ?? [];
            const ids = new Set(transitions.map((t) => t.id));
            const members = new Set(
                transitions.flatMap((t) =>
                    (rowsByTransition.get(t.id) ?? []).map((r) => r.marcher),
                ),
            );
            const active: Interval[] = [];
            for (const marcherId of members)
                for (const span of spansOf(marcherId))
                    if (span.transitionId != null && ids.has(span.transitionId))
                        active.push({ start: span.start, end: span.end });
            const id = timelineTrackId(timeline.id);
            const clip: Interval = { start: timeline.start, end: timeline.end };
            return {
                id,
                linkId: timeline.id,
                targetId: timeline.id,
                targetType: "timeline",
                label: timeline.name ?? `Timeline ${timeline.id}`,
                color: TIMELINE_TRACK_COLORS[
                    index % TIMELINE_TRACK_COLORS.length
                ],
                startBeatIndex: clip.start,
                endBeatIndex: clip.end,
                legs: [
                    {
                        id: `${id}-leg-${clip.start}`,
                        startBeatIndex: clip.start,
                        endBeatIndex: clip.end,
                        texture: "move",
                    },
                ],
                activitySpans: activityOver(clip, union(active)),
                diagnostics: diagnosticsBadge(
                    [...ids]
                        .sort((a, b) => a - b)
                        .flatMap(
                            (tid) => diagnosticsByTransition.get(tid) ?? [],
                        ),
                ),
            };
        });
}

function shapeTracksOfTimeline(
    context: BuildContext,
    timelineId: number,
    color: string,
    transitions: readonly TimelineViewTransition[],
): TimelineInput[] {
    const tracks: TimelineInput[] = [];
    const byShape = groupBy(
        transitions.filter((t) => t.destShapeId != null),
        (t) => t.destShapeId!,
    );
    for (const [shapeId, shapeTransitions] of [...byShape].sort(
        ([a], [b]) => a - b,
    ))
        clipsOfShape(shapeTransitions, transitions).forEach((group, k) =>
            tracks.push(
                shapeTrack({
                    context,
                    id:
                        k === 0
                            ? shapeTrackId(timelineId, shapeId)
                            : `${shapeTrackId(timelineId, shapeId)}-${k}`,
                    timelineId,
                    shapeId,
                    label: context.shapeName.get(shapeId) ?? `Shape ${shapeId}`,
                    color,
                    transitions: group,
                }),
            ),
        );

    return tracks;
}

function tracksOfTimeline(
    context: BuildContext,
    timeline: { id: number; start: number; end: number },
    color: string,
): TimelineInput[] {
    const { filter, transitionById, rowsByTransition, spansOf } = context;
    const timelineId = timeline.id;
    const transitions = context.transitionsByTimeline.get(timelineId) ?? [];
    const tracks: TimelineInput[] = [];

    tracks.push(
        ...shapeTracksOfTimeline(context, timelineId, color, transitions),
    );

    const byMarcher = groupBy(
        transitions.flatMap((t) => rowsByTransition.get(t.id) ?? []),
        (r) => r.marcher,
    );
    const inTimeline = new Set(transitions.map((t) => t.id));
    // Transition-wide diagnostics (such as D-VACANT) of a transition without a shape track go on
    // one marcher track only: the first shown one assigned to it
    const unclaimed = new Set(
        transitions.filter((t) => t.destShapeId == null).map((t) => t.id),
    );
    for (const [marcherId, rows] of [...byMarcher].sort(([a], [b]) => a - b)) {
        const individual = rows.some((row) => {
            const t = transitionById.get(row.transition)!;
            return t.destShapeId == null && t.slotCount === 1;
        });
        if (
            filter.kind === "default" &&
            !individual &&
            !filter.selectedMarcherIds.has(marcherId)
        )
            continue;
        const spans = spansOf(marcherId);
        // Spans can lag the tables for a moment after a commit; skip until they catch up
        if (spans.length === 0) continue;
        const diagnostics = [...new Set(rows.map((r) => r.transition))]
            .sort((a, b) => a - b)
            .flatMap((tid) => {
                const wide = unclaimed.delete(tid);
                return (context.diagnosticsByTransition.get(tid) ?? []).filter(
                    (d) =>
                        d.marcherId === marcherId ||
                        (wide && d.marcherId === null),
                );
            });
        tracks.push(
            marcherTrack({
                timelineId,
                clip: { start: timeline.start, end: timeline.end },
                marcherId,
                label:
                    context.marcherLabel.get(marcherId) ??
                    `Marcher ${marcherId}`,
                color,
                inTimeline,
                spans,
                diagnostics,
            }),
        );
    }
    return tracks;
}

/**
 * Splits a shape's transitions into clips: a gap between two moves into the shape starts a new
 * clip when another shape's transition in the timeline occupies it, so the shape doesn't seem to
 * hold through another formation.
 *
 * TODO(P8.12): every transition spans its timeline (C-11) and P9.10 converts a timeline per page,
 * so no timeline has gaps to split. The app no longer draws shape tracks (UI-9 draws
 * `buildTimelineClipTracks`), so remove this with `buildTimelineTracks`.
 */
function clipsOfShape(
    shapeTransitions: readonly TimelineViewTransition[],
    timelineTransitions: readonly TimelineViewTransition[],
): TimelineViewTransition[][] {
    const shapeId = shapeTransitions[0]!.destShapeId;
    const others = timelineTransitions.filter(
        (t) => t.destShapeId != null && t.destShapeId !== shapeId,
    );
    const sorted = [...shapeTransitions].sort(
        (a, b) => a.start - b.start || a.id - b.id,
    );
    const groups: TimelineViewTransition[][] = [];
    let end = -Infinity;
    for (const t of sorted) {
        const gapStart = end;
        const occupied =
            t.start > gapStart &&
            others.some((o) => o.start < t.start && o.end > gapStart);
        if (groups.length === 0 || occupied) groups.push([t]);
        else groups[groups.length - 1]!.push(t);
        end = Math.max(end, t.end);
    }
    return groups;
}

function marcherTrack({
    timelineId,
    clip,
    marcherId,
    label,
    color,
    inTimeline,
    spans,
    diagnostics,
}: {
    timelineId: number;
    /**
     * The timeline's range (ui.md UI-8): the clip is the timeline, and the marcher's assignments
     * show as the active spans inside it
     */
    clip: Interval;
    marcherId: number;
    label: string;
    color: string;
    inTimeline: ReadonlySet<number>;
    spans: readonly SpanInfo[];
    /** The badge's diagnostics, chosen by the caller */
    diagnostics: readonly Diagnostic[];
}): TimelineInput {
    const id = marcherTrackId(timelineId, marcherId);
    const legs: TimelineLegInput[] = [];
    const active: Interval[] = [];
    for (const span of spans) {
        const start = Math.max(span.start, clip.start);
        const end = Math.min(span.end, clip.end);
        if (end <= start) continue;
        legs.push({
            id: `${id}-leg-${start}`,
            startBeatIndex: start,
            endBeatIndex: end,
            texture: span.kind === "hold" ? "hold" : "move",
        });
        if (span.transitionId != null && inTimeline.has(span.transitionId))
            active.push({ start, end });
    }

    return {
        id,
        linkId: timelineId,
        targetId: marcherId,
        targetType: "marcher",
        label,
        color,
        startBeatIndex: clip.start,
        endBeatIndex: clip.end,
        legs,
        activitySpans: activityOver(clip, union(active)),
        diagnostics: diagnosticsBadge(diagnostics),
    };
}

function shapeTrack({
    context,
    id,
    timelineId,
    shapeId,
    label,
    color,
    transitions,
}: {
    context: BuildContext;
    id: string;
    timelineId: number;
    shapeId: number;
    label: string;
    color: string;
    transitions: readonly TimelineViewTransition[];
}): TimelineInput {
    const ids = new Set(transitions.map((t) => t.id));
    const moves = union(
        transitions.map((t) => ({ start: t.start, end: t.end })),
    );
    const clip: Interval = {
        start: moves[0]!.start,
        end: moves[moves.length - 1]!.end,
    };

    const legs: TimelineLegInput[] = [];
    let cursor = clip.start;
    for (const move of moves) {
        if (move.start > cursor)
            legs.push({
                id: `${id}-leg-${cursor}`,
                startBeatIndex: cursor,
                endBeatIndex: move.start,
                texture: "hold",
            });
        legs.push({
            id: `${id}-leg-${move.start}`,
            startBeatIndex: move.start,
            endBeatIndex: move.end,
            texture: "move",
        });
        cursor = move.end;
    }

    const members = new Set(
        transitions.flatMap((t) =>
            (context.rowsByTransition.get(t.id) ?? []).map((r) => r.marcher),
        ),
    );
    const active: Interval[] = [];
    for (const marcherId of members)
        for (const span of context.spansOf(marcherId))
            if (span.transitionId != null && ids.has(span.transitionId))
                active.push({ start: span.start, end: span.end });

    const diagnostics = [...ids]
        .sort((a, b) => a - b)
        .flatMap((tid) => context.diagnosticsByTransition.get(tid) ?? []);

    return {
        id,
        linkId: timelineId,
        targetId: shapeId,
        targetType: "shape",
        label,
        color,
        startBeatIndex: clip.start,
        endBeatIndex: clip.end,
        legs,
        activitySpans: activityOver(clip, union(active)),
        diagnostics: diagnosticsBadge(diagnostics),
    };
}

// ---------------------------------------------------------------------------
// The view's beat axis
// ---------------------------------------------------------------------------

/**
 * Maps spec beat positions onto the timeline's x axis. Every show starts with a fixed,
 * zero-length beat 0 (`timeMap.ts`): it has no time, so drawn one beat wide it would be an empty
 * column before the first timed page. The axis hides it: view beat `v` is spec beat `v + 1`, and
 * spec positions in `[0, 1)` all land on view 0. Beats without a zero-length beat 0 (such as the
 * stories') map one to one.
 */
export interface TimelineBeatAxis {
    /** Spec beats hidden before view 0: 1 when beat 0 is the zero-length beat, else 0 */
    readonly offset: number;
    /** The number of view beats */
    readonly beatCount: number;
    /** Spec beat position to view beat position */
    readonly toView: (beat: number) => number;
    /** View beat position to spec beat position */
    readonly toSpec: (beat: number) => number;
}

export function createTimelineBeatAxis(
    beats: readonly { readonly duration: number }[],
): TimelineBeatAxis {
    const offset = beats.length > 1 && beats[0]!.duration === 0 ? 1 : 0;
    return {
        offset,
        beatCount: beats.length - offset,
        toView: (beat) => Math.max(0, beat - offset),
        toSpec: (beat) => beat + offset,
    };
}

/** A track's spec-beat ranges mapped onto the view axis; zero-width pieces are dropped. */
export function timelineInputToView(
    input: TimelineInput,
    axis: TimelineBeatAxis,
): TimelineInput | null {
    if (axis.offset === 0) return input;
    const legs = input.legs
        .map((leg) => ({
            ...leg,
            startBeatIndex: axis.toView(leg.startBeatIndex),
            endBeatIndex: axis.toView(leg.endBeatIndex),
        }))
        .filter((leg) => leg.endBeatIndex > leg.startBeatIndex);
    if (legs.length === 0) return null;
    const activitySpans: TimelineActivitySpan[] = [];
    for (const span of input.activitySpans) {
        const start = axis.toView(span.startBeatIndex);
        const end = axis.toView(span.endBeatIndex);
        if (end <= start) continue;
        const last = activitySpans[activitySpans.length - 1];
        if (last && last.active === span.active)
            activitySpans[activitySpans.length - 1] = {
                ...last,
                endBeatIndex: end,
            };
        else
            activitySpans.push({
                startBeatIndex: start,
                endBeatIndex: end,
                active: span.active,
            });
    }
    return {
        ...input,
        startBeatIndex: axis.toView(input.startBeatIndex),
        endBeatIndex: axis.toView(input.endBeatIndex),
        legs,
        activitySpans,
    };
}

import {
    createResolver,
    type Resolver,
    type SpanInfo,
    type TimelineSnapshot,
} from "@openmarch/core";
import { PATH_DRAW_TOLERANCE } from "./timelinePaths";
import { sampleMarcherPath } from "./timelineKeyframes";

/**
 * What the field draws for an isolated timeline (docs/timeline/research/ownership/09-isolation.md,
 * after 07-ghost-rendering.md phase G0). Pure: it reads the resolver and the timeline's rows and
 * returns plain data, which `TimelineFocusLayer` draws.
 *
 * For each member of the isolated timeline F over `[start, end]`:
 *
 * - **performed**: where the member is in F (the resolver's span is one of F's transitions), its
 *   real path, solid in F's color.
 * - **ghost**: beats after the member has started performing F where another move owns it (it was
 *   stolen out, R-4) or F only resumes it with a catch-up (`resume`, D-12): F's planned path for it
 *   over those beats, gray and dashed. Planned means as if nothing had stolen it: a throwaway
 *   resolver over F's transitions alone, with every member starting where it really is at F's start
 *   (the `sampleShape` pattern in `timelineMoves.ts`).
 * - **context**: the move that takes the member out of F, drawn over its own whole span (one hop),
 *   in that move's color, so a move that runs past F's end shows.
 * - **origin**, **destination**, **ghost end** and **forks**: where the member starts, where it
 *   really ends in F (if F still has it at its end), where F's plan would end it (if not), and
 *   where it leaves F.
 *
 * Not drawn yet: the approach of a member that joins F partway (its planned start isn't stored
 * until ghost starts exist, WP-O3).
 */

export interface FocusPoint {
    readonly x: number;
    readonly y: number;
}

export type FocusPolyline = readonly FocusPoint[];

export interface FocusSlotScene {
    readonly marcherId: number;
    /** Where the member is at F's start */
    readonly origin: FocusPoint;
    readonly performed: readonly FocusPolyline[];
    readonly ghosts: readonly FocusPolyline[];
    /** Where F really leaves it at F's end, or null when another move has it then */
    readonly destination: FocusPoint | null;
    /** Where F's plan ends it, when another move has it at F's end */
    readonly ghostEnd: FocusPoint | null;
    /** Where it leaves F for another move, in that move's color */
    readonly forks: readonly (FocusPoint & { readonly color: string })[];
    /** It stays put over all of F: no path to draw, so it is drawn quietly */
    readonly holds: boolean;
}

export interface FocusContextPath {
    readonly marcherId: number;
    readonly color: string;
    readonly points: FocusPolyline;
}

export interface FocusScene {
    readonly timelineId: number;
    readonly color: string;
    readonly slots: readonly FocusSlotScene[];
    readonly context: readonly FocusContextPath[];
}

/** One of F's assignment rows. A member can have several (a converted show's split moves). */
export interface FocusMemberSlot {
    readonly marcherId: number;
    readonly transitionId: number;
    readonly slot: number;
    readonly start: number;
    readonly end: number;
    readonly layer: number;
}

type FocusResolver = Pick<Resolver, "positionAt" | "spanInfos" | "marcherIds">;

export interface BuildFocusSceneInput {
    /** The real resolver */
    readonly resolver: FocusResolver;
    readonly timeline: {
        readonly id: number;
        readonly start: number;
        readonly end: number;
    };
    /** Every assignment row in F */
    readonly members: readonly FocusMemberSlot[];
    /** The host's snapshot: F's transitions and the shapes they use are read from it */
    readonly snapshot: Pick<TimelineSnapshot, "transitions" | "shapes">;
    /** The timeline each transition belongs to, for context colors */
    readonly timelineOfTransition: ReadonlyMap<number, number>;
    /** A timeline's color, as the strip draws it */
    readonly colorOf: (timelineId: number) => string;
    /** Color for a stretch with no move (a hold) */
    readonly holdColor?: string;
    readonly tolerance?: number;
    /** The plan resolver, when the caller built it already (`planResolver`) */
    readonly plan?: Resolver | null;
}

const xy = ([x, y]: readonly [number, number]): FocusPoint => ({ x, y });

const sample = (
    resolver: Pick<Resolver, "positionAt" | "spanInfos">,
    marcherId: number,
    from: number,
    to: number,
    tolerance: number,
): FocusPolyline =>
    from < to
        ? sampleMarcherPath(resolver, marcherId, from, to, {
              tolerance,
          }).points.map(xy)
        : [];

/**
 * F's planned paths: a resolver over F's rows only, where each member holds at its real position
 * at F's start and then follows its rows in F as if no other move took it. Null when a row's
 * transition isn't in the snapshot. Known gap: a follow-the-leader transition that inherits its
 * order from a transition outside F falls back to slot order here (D-ORDER-FALLBACK).
 */
export function planResolver(
    input: Pick<
        BuildFocusSceneInput,
        "resolver" | "timeline" | "members" | "snapshot"
    >,
): Resolver | null {
    const { resolver, timeline, members, snapshot } = input;
    const transitionIds = new Set(members.map((m) => m.transitionId));
    const transitions: TimelineSnapshot["transitions"] = {};
    for (const id of transitionIds) {
        const row = snapshot.transitions[id];
        if (!row) return null;
        transitions[id] = row;
    }
    if (members.length === 0) return null;
    const marcherIds = [...new Set(members.map((m) => m.marcherId))];
    const plan: TimelineSnapshot = {
        marchers: marcherIds.map((id) => ({
            id,
            home: resolver.positionAt(id, timeline.start),
        })),
        shapes: snapshot.shapes,
        transitions,
        assignments: members.map((m, i) => ({
            id: i + 1,
            marcher: m.marcherId,
            transition: m.transitionId,
            slot: m.slot,
            start: m.start,
            end: m.end,
            layer: m.layer,
        })),
    };
    return createResolver(plan);
}

/** The spans of one marcher clipped to `[start, end]`, dropping empty pieces. */
const clipped = (
    spans: readonly SpanInfo[],
    start: number,
    end: number,
): SpanInfo[] =>
    spans
        .map((s) => ({
            ...s,
            start: Math.max(s.start, start),
            end: Math.min(s.end, end),
        }))
        .filter((s) => s.start < s.end);

// eslint-disable-next-line max-lines-per-function
export function buildFocusScene(input: BuildFocusSceneInput): FocusScene {
    const {
        resolver,
        timeline,
        members,
        timelineOfTransition,
        colorOf,
        holdColor = "#888888",
        tolerance = PATH_DRAW_TOLERANCE,
    } = input;
    const { start, end } = timeline;
    // Every transition of F, not only the rows' (a member's other rows in F count as F)
    const inF = new Set(members.map((m) => m.transitionId));
    for (const [transitionId, timelineId] of timelineOfTransition)
        if (timelineId === timeline.id) inF.add(transitionId);
    const firstRow = new Map<number, number>();
    for (const m of members)
        firstRow.set(
            m.marcherId,
            Math.min(firstRow.get(m.marcherId) ?? Infinity, m.start),
        );
    const plan = input.plan !== undefined ? input.plan : planResolver(input);
    const known = new Set(resolver.marcherIds());
    const colorOfTransition = (transitionId: number | null) => {
        if (transitionId === null) return holdColor;
        const timelineId = timelineOfTransition.get(transitionId);
        return timelineId === undefined ? holdColor : colorOf(timelineId);
    };

    const slots: FocusSlotScene[] = [];
    const context: FocusContextPath[] = [];
    // Whether F's plan has the member on its own path at `beat`: a catch-up in the real show is
    // drawn beside the plan only where the plan doesn't catch up there too
    const planFounds = (marcherId: number, beat: number) =>
        plan?.spanInfos(marcherId).find((p) => p.start <= beat && beat < p.end)
            ?.kind === "founding";
    const drawnContext = new Set<string>();
    for (const [marcherId, rowStart] of firstRow) {
        if (!known.has(marcherId)) continue;
        const all = resolver.spanInfos(marcherId);
        const spans = clipped(all, start, end);
        // F has it from its first row on: before that is a joiner's approach (not drawn yet)
        const started = (beat: number) => beat >= rowStart;
        const performed: FocusPolyline[] = [];
        const ghosts: FocusPolyline[] = [];
        const forks: (FocusPoint & { color: string })[] = [];
        const ghost = (from: number, to: number) => {
            if (plan) {
                const points = sample(plan, marcherId, from, to, tolerance);
                if (points.length > 0) ghosts.push(points);
            }
        };
        for (let i = 0; i < spans.length; i++) {
            const span = spans[i]!;
            const mine =
                span.transitionId !== null && inF.has(span.transitionId);
            if (mine) {
                performed.push(
                    sample(
                        resolver,
                        marcherId,
                        span.start,
                        span.end,
                        tolerance,
                    ),
                );
                // A catch-up (join, resume) isn't F's plan: show the plan beside it. A joiner's
                // join from its first row on is its own entry, not a catch-up
                if (
                    span.kind !== "founding" &&
                    span.start > rowStart &&
                    planFounds(marcherId, span.start)
                )
                    ghost(span.start, span.end);
                continue;
            }
            if (!started(span.start)) continue;
            ghost(span.start, span.end);
            const previous = spans[i - 1];
            if (
                previous?.transitionId != null &&
                inF.has(previous.transitionId)
            )
                forks.push({
                    ...xy(resolver.positionAt(marcherId, span.start)),
                    color: colorOfTransition(span.transitionId),
                });
            const key = `${marcherId}:${span.transitionId}`;
            if (span.transitionId !== null && !drawnContext.has(key)) {
                drawnContext.add(key);
                // One hop: the other move over its whole span, past F's end too
                const whole = all.find(
                    (s) =>
                        s.transitionId === span.transitionId &&
                        s.start <= span.start &&
                        span.start < s.end,
                );
                const to =
                    whole && Number.isFinite(whole.end) ? whole.end : span.end;
                const points = sample(
                    resolver,
                    marcherId,
                    span.start,
                    to,
                    tolerance,
                );
                if (points.length > 0)
                    context.push({
                        marcherId,
                        color: colorOfTransition(span.transitionId),
                        points,
                    });
            }
        }
        const last = spans[spans.length - 1];
        const origin = xy(resolver.positionAt(marcherId, start));
        const kept = performed.filter((p) => p.length > 0);
        const endsInF =
            last !== undefined &&
            last.transitionId !== null &&
            inF.has(last.transitionId);
        slots.push({
            marcherId,
            origin,
            performed: kept,
            ghosts,
            holds:
                ghosts.length === 0 &&
                kept.every((p) =>
                    p.every(
                        (q) =>
                            Math.abs(q.x - origin.x) < 0.5 &&
                            Math.abs(q.y - origin.y) < 0.5,
                    ),
                ),
            destination: endsInF
                ? xy(resolver.positionAt(marcherId, end))
                : null,
            ghostEnd:
                !endsInF && started(end - 1) && plan
                    ? xy(plan.positionAt(marcherId, end))
                    : null,
            forks,
        });
    }
    return {
        timelineId: timeline.id,
        color: colorOf(timeline.id),
        slots,
        context,
    };
}

/** Whether the scene has anything gray to draw (some member left F or is caught up). */
export const sceneHasGhosts = (scene: FocusScene): boolean =>
    scene.slots.some((s) => s.ghosts.length > 0);

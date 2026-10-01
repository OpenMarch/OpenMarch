import {
    createResolver,
    MAX_ABS_BULGE,
    type AssignmentRow,
    type OrderMode,
    type PathStyle,
    type ShapeRow,
    type TransitionRow,
    type XY,
} from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import {
    setTimelineTransitionDestination,
    updateTimelineTransition,
    type ModifiedTimelineTransitionArgs,
    type TimelineTransitionDestination,
} from "@/db-functions/timelineTransitions";
import type { MarcherInspection } from "./timelineInspector";
import type { TimelineViewShape } from "./timelineViewModel";

/**
 * The inspector's transition editor (P8.3): what it edits, and how each control's change becomes
 * one undoable edit. Pure apart from `applyTransitionEdit`, which runs the planned db-function.
 *
 * Every change is planned against the transition as the inspector shows it. A change that would
 * write nothing is planned as `null` and skipped, since an edit that writes nothing is refused by
 * `transactionWithHistory`. The db-functions validate each write, but they can't tell a stale
 * plan from a fresh one: a plan made from a target shown before the previous edit landed would
 * write over that edit. So the editor plans nothing until the target is rebuilt after its last
 * edit (`TimelineTransitionEditor`).
 */

/** The bulge a transition gets when it becomes an arc. */
export const DEFAULT_BULGE = 0.25;

/** One shape a transition can head to. */
export interface TransitionShapeOption {
    id: number;
    name: string | null;
    kind: ShapeRow["kind"];
    /** A block's cell count; null for the path kinds */
    capacity: number | null;
}

/** A transition as the editor shows it. */
export interface TransitionEditTarget {
    id: number;
    start: number;
    end: number;
    style: PathStyle;
    order: OrderMode;
    slotCount: number;
    /** The smallest slot count that keeps every assigned slot: the highest assigned slot + 1 */
    minSlotCount: number;
    destination:
        | { kind: "shape"; shapeId: number; shape: ShapeRow | null }
        | { kind: "individual"; points: XY[] };
    /** The arc's bulge, or null for any other style */
    bulge: number | null;
    /** The follow-the-leader waypoints (empty for any other style) */
    waypoints: XY[];
}

/** One control's change. */
export type TransitionEdit =
    | { kind: "pathStyle"; style: PathStyle }
    | { kind: "bulge"; bulge: number }
    | { kind: "waypoints"; waypoints: XY[] }
    | { kind: "orderMode"; order: OrderMode }
    | { kind: "slotCount"; slotCount: number }
    | { kind: "destinationShape"; shapeId: number }
    | { kind: "destinationIndividual" };

/** The db-function call a change becomes. */
export type PlannedTransitionEdit =
    | { fn: "update"; args: ModifiedTimelineTransitionArgs }
    | {
          fn: "destination";
          args: {
              transitionId: number;
              destination: TimelineTransitionDestination;
          };
      };

/**
 * The transition a marcher's inspection edits at a page's end beat: the move that brought it
 * there. Spans are half-open, so when a span starts exactly at the beat, that span (a hold, or
 * the next page's move) isn't it: the move ending here is the previous span's transition, if the
 * previous span was a move at all. Otherwise it is the move the beat falls inside.
 */
export function editableTransitionId(
    inspection: MarcherInspection,
): number | null {
    const { span, origin } = inspection;
    if (span.start === inspection.beat)
        return origin.kind === "span" ? origin.transitionId : null;
    if (span.kind === "hold") return null;
    return inspection.transition?.id ?? null;
}

/** The editor's view of transition `id`, from the resolver's rows and the stored assignments. */
export function buildTransitionEditTarget(
    id: number,
    sources: {
        transitions: Readonly<Record<number, TransitionRow>>;
        shapes: Readonly<Record<number, ShapeRow>>;
        assignments: readonly AssignmentRow[];
    },
): TransitionEditTarget | null {
    const row = sources.transitions[id];
    if (!row) return null;
    let minSlotCount = 1;
    for (const a of sources.assignments)
        if (a.transition === id)
            minSlotCount = Math.max(minSlotCount, a.slot + 1);
    return {
        id,
        start: row.start,
        end: row.end,
        style: row.style,
        order: row.order,
        slotCount: row.slots,
        minSlotCount,
        destination:
            row.dest !== null
                ? {
                      kind: "shape",
                      shapeId: row.dest,
                      shape: sources.shapes[row.dest] ?? null,
                  }
                : {
                      kind: "individual",
                      points: (row.points ?? []).map((p): XY => [p[0], p[1]]),
                  },
        bulge: row.style === "arc" ? (row.params?.bulge ?? 0) : null,
        waypoints:
            row.style === "follow_the_leader"
                ? (row.params?.waypoints ?? []).map((p): XY => [p[0], p[1]])
                : [],
    };
}

/** The transitions `inspections` can edit, once each, in the inspections' order. */
export function buildTransitionEditTargets(
    inspections: readonly MarcherInspection[],
    sources: Parameters<typeof buildTransitionEditTarget>[1],
): TransitionEditTarget[] {
    const targets: TransitionEditTarget[] = [];
    const seen = new Set<number>();
    for (const inspection of inspections) {
        const id = editableTransitionId(inspection);
        if (id === null || seen.has(id)) continue;
        seen.add(id);
        const target = buildTransitionEditTarget(id, sources);
        if (target) targets.push(target);
    }
    return targets;
}

/** The shapes a transition can pick, by id, with their names. */
export function transitionShapeOptions(
    shapes: Readonly<Record<number, ShapeRow>>,
    named: readonly TimelineViewShape[],
): TransitionShapeOption[] {
    const names = new Map(named.map((s) => [s.id, s.name]));
    return Object.entries(shapes)
        .map(([id, shape]) => ({
            id: Number(id),
            name: names.get(Number(id)) ?? null,
            kind: shape.kind,
            capacity:
                shape.kind === "block"
                    ? shape.geometry.rows * shape.geometry.cols
                    : null,
        }))
        .sort((a, b) => a.id - b.id);
}

/** Why follow-the-leader can't be picked, or null when it can (I-T5, I-T3). */
export function followTheLeaderBlocker(
    target: TransitionEditTarget,
): "noShape" | "block" | null {
    if (target.destination.kind !== "shape") return "noShape";
    if (target.destination.shape?.kind === "block") return "block";
    return null;
}

/**
 * Why a shape can't be a transition's destination, or null when it can: follow the leader can't
 * end in a block (I-T3, E-T3), and a block must have a cell for every slot (I-T4, E-T4).
 */
export function shapeBlocker(
    target: TransitionEditTarget,
    shape: TransitionShapeOption,
): "ftlBlock" | "tooSmall" | null {
    if (shape.kind !== "block") return null;
    if (target.style === "follow_the_leader") return "ftlBlock";
    if (shape.capacity !== null && shape.capacity < target.slotCount)
        return "tooSmall";
    return null;
}

/** The most slots a transition can have (I-N2). */
export const MAX_SLOT_COUNT = 10000;

/** A typed slot count as a whole number from `min` (the assigned slots) to `MAX_SLOT_COUNT`. */
export function clampSlotCount(value: number, min: number): number {
    return Math.min(MAX_SLOT_COUNT, Math.max(min, Math.round(value)));
}

/** A bulge clamped to the minor arcs (D-15, |k| ≤ ½); null for a value that isn't a number. */
export function clampBulge(value: number): number | null {
    if (!Number.isFinite(value)) return null;
    return Math.max(-MAX_ABS_BULGE, Math.min(MAX_ABS_BULGE, value));
}

/**
 * The points of a shapeless transition resized to `count` slots: kept slots keep their points,
 * and each new slot starts at the last point (or the field's origin when there is none).
 */
export function resizePoints(points: readonly XY[], count: number): XY[] {
    const kept = points.slice(0, count).map((p): XY => [p[0], p[1]]);
    const last: XY = kept[kept.length - 1] ??
        points[points.length - 1] ?? [0, 0];
    while (kept.length < count) kept.push([last[0], last[1]]);
    return kept;
}

/**
 * The `count` slot destinations a shape gives (R-13), for switching a transition to individual
 * points that start where the shape put them (D-16, Q-14). Read through a one-transition resolver,
 * so the sampling is the resolver's own: each slot's marcher starts at (0, 0) and moves directly
 * to its slot, so at the end beat it stands exactly on the sample.
 */
export function shapeSlotPoints(shape: ShapeRow, count: number): XY[] {
    const ids = Array.from({ length: count }, (_, i) => i + 1);
    const resolver = createResolver({
        marchers: ids.map((id) => ({ id, home: [0, 0] as XY })),
        shapes: { 1: shape },
        transitions: {
            1: {
                id: 1,
                start: 0,
                end: 1,
                dest: 1,
                slots: count,
                style: "direct",
                order: "slot",
                params: null,
            },
        },
        assignments: ids.map((id) => ({
            id,
            marcher: id,
            transition: 1,
            slot: id - 1,
            start: 0,
            end: 1,
            layer: 0,
        })),
    });
    return ids.map((id) => {
        const [x, y] = resolver.positionAt(id, 1);
        return [x, y];
    });
}

const samePoints = (a: readonly XY[], b: readonly XY[]) =>
    a.length === b.length &&
    a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1]);

/** The path parameters a transition gets when it switches to `style`. */
function paramsForStyle(
    style: PathStyle,
): ModifiedTimelineTransitionArgs["pathParams"] {
    if (style === "arc") return { bulge: DEFAULT_BULGE };
    if (style === "follow_the_leader") return { waypoints: [] };
    return null;
}

/**
 * The db-function call for one control's change, or null when it changes nothing. The values
 * are planned as given: the db-functions' validators refuse anything out of range.
 */
export function planTransitionEdit(
    target: TransitionEditTarget,
    edit: TransitionEdit,
): PlannedTransitionEdit | null {
    const update = (
        args: Omit<ModifiedTimelineTransitionArgs, "id">,
    ): PlannedTransitionEdit => ({
        fn: "update",
        args: { id: target.id, ...args },
    });
    switch (edit.kind) {
        case "pathStyle":
            if (edit.style === target.style) return null;
            return update({
                pathStyle: edit.style,
                pathParams: paramsForStyle(edit.style),
            });
        case "bulge":
            if (target.style !== "arc" || edit.bulge === target.bulge)
                return null;
            return update({ pathParams: { bulge: edit.bulge } });
        case "waypoints":
            if (
                target.style !== "follow_the_leader" ||
                samePoints(edit.waypoints, target.waypoints)
            )
                return null;
            return update({ pathParams: { waypoints: edit.waypoints } });
        case "orderMode":
            if (edit.order === target.order) return null;
            return update({ orderMode: edit.order });
        case "slotCount": {
            // Never plan more than I-N2 allows, so no huge point list is built for a typo
            const slotCount = clampSlotCount(edit.slotCount, 1);
            if (slotCount === target.slotCount) return null;
            if (target.destination.kind === "individual")
                return update({
                    slotCount,
                    points: resizePoints(target.destination.points, slotCount),
                });
            return update({ slotCount });
        }
        case "destinationShape":
            if (
                target.destination.kind === "shape" &&
                target.destination.shapeId === edit.shapeId
            )
                return null;
            return {
                fn: "destination",
                args: {
                    transitionId: target.id,
                    destination: { kind: "shape", shapeId: edit.shapeId },
                },
            };
        case "destinationIndividual": {
            if (target.destination.kind === "individual") return null;
            const shape = target.destination.shape;
            const points = shape
                ? shapeSlotPoints(shape, target.slotCount)
                : resizePoints([], target.slotCount);
            return {
                fn: "destination",
                args: {
                    transitionId: target.id,
                    destination: { kind: "individual", points },
                },
            };
        }
    }
}

/** Runs a planned change as one undoable edit. */
export async function applyTransitionEdit(
    db: DbConnection,
    plan: PlannedTransitionEdit,
): Promise<void> {
    if (plan.fn === "update")
        await updateTimelineTransition({ db, modified: plan.args });
    else await setTimelineTransitionDestination({ db, ...plan.args });
}

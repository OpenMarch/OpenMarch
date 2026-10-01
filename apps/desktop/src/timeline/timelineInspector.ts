import type {
    Diagnostic,
    Explanation,
    OrderSource,
    PathStyle,
    OrderMode,
    SpanInfo,
    SpanKind,
    TransitionRow,
    XY,
} from "@openmarch/core";
import type { TimelineViewTables } from "./timelineViewModel";

/**
 * The inspector's read-only account of one marcher at one beat (P8.5, ui.md "What the timeline
 * doesn't show"), from the resolver's `explain` (spec 10.1) plus the rows the explanation only
 * names: the transition's style and parameters, its timeline, the layer of the assignment and
 * the destination shape. Pure data; `TimelineInspectorSection` words it.
 */

export interface InspectedSpan {
    kind: SpanKind;
    /** `-Infinity` for the leading hold */
    start: number;
    /** `+Infinity` for the trailing hold */
    end: number;
    slot: number | null;
}

export interface InspectedTransition {
    id: number;
    timelineId: number | null;
    timelineName: string | null;
    start: number;
    end: number;
    style: PathStyle;
    order: OrderMode;
    slotCount: number;
    /** Arc bulge, when the transition's params carry one */
    bulge: number | null;
    /** Extra follow-the-leader trail vertices */
    waypoints: number;
    destination:
        | { kind: "shape"; shapeId: number; name: string | null; shape: string }
        | { kind: "points"; count: number };
}

export type InspectedOrigin =
    | { kind: "home"; xy: XY }
    | { kind: "span"; xy: XY; span: SpanKind; transitionId: number | null };

export interface InspectedFtl {
    /** Place in the member order, 0 = tail; null for a marcher that isn't a member here */
    q: number | null;
    memberCount: number;
    orderSource: OrderSource;
    /** Where the marcher ends up on the shape, when it's a target of this entry */
    target: XY | null;
}

export interface MarcherInspection {
    marcherId: number;
    beat: number;
    span: InspectedSpan;
    transition: InspectedTransition | null;
    /** Layer of the assignment the span runs under; null for a hold */
    layer: number | null;
    progress: number | null;
    origin: InspectedOrigin;
    ftl: InspectedFtl | null;
    /** The marcher's diagnostics: those at this beat first, then the rest of the marcher's */
    diagnostics: Diagnostic[];
}

/** What `buildMarcherInspection` reads besides the explanation. */
export interface InspectionSources {
    tables: Pick<
        TimelineViewTables,
        "timelines" | "transitions" | "assignments" | "shapes"
    >;
    /** The resolver's current transition rows, with the style, order, params and destination */
    transitions: Readonly<Record<number, TransitionRow>>;
    /** Shape kinds by id (line, freehand, box, circle, block) */
    shapeKinds: Readonly<Record<number, string>>;
    /** The show's diagnostics, for the ones of this marcher at other beats */
    showDiagnostics: readonly Diagnostic[];
}

const diagnosticKey = (d: Diagnostic) =>
    `${d.code}|${d.transitionId}|${d.marcherId ?? ""}|${d.slot ?? ""}`;

const spanOf = (s: SpanInfo): InspectedSpan => ({
    kind: s.kind,
    start: s.start,
    end: s.end,
    slot: s.slot,
});

/** The transition a span runs in, with its timeline and destination shape. */
function inspectTransition(
    transitionId: number | null,
    sources: InspectionSources,
): InspectedTransition | null {
    if (transitionId === null) return null;
    const { tables } = sources;
    const row = sources.transitions[transitionId];
    if (!row) return null;
    const stored = tables.transitions.find((t) => t.id === transitionId);
    const timeline =
        stored && tables.timelines.find((t) => t.id === stored.timelineId);
    return {
        id: row.id,
        timelineId: stored?.timelineId ?? null,
        timelineName: timeline?.name ?? null,
        start: row.start,
        end: row.end,
        style: row.style,
        order: row.order,
        slotCount: row.slots,
        bulge: row.params?.bulge ?? null,
        waypoints: row.params?.waypoints?.length ?? 0,
        destination:
            row.dest !== null
                ? {
                      kind: "shape",
                      shapeId: row.dest,
                      name:
                          tables.shapes.find((s) => s.id === row.dest)?.name ??
                          null,
                      shape: sources.shapeKinds[row.dest] ?? "unknown",
                  }
                : { kind: "points", count: row.points?.length ?? 0 },
    };
}

/** The inspector's account of `marcherId` at `beat`, given the resolver's explanation of it. */
export function buildMarcherInspection(
    marcherId: number,
    beat: number,
    explanation: Explanation,
    sources: InspectionSources,
): MarcherInspection {
    const { span } = explanation;
    const { tables } = sources;

    const transition = inspectTransition(span.transitionId, sources);

    const layer =
        span.assignmentId === null
            ? null
            : (tables.assignments.find((a) => a.id === span.assignmentId)
                  ?.layer ?? null);

    // The leading hold is the marcher standing at home
    const from = explanation.originFrom;
    const origin: InspectedOrigin =
        from === "home" || (from.kind === "hold" && from.start === -Infinity)
            ? { kind: "home", xy: explanation.origin }
            : {
                  kind: "span",
                  xy: explanation.origin,
                  span: from.kind,
                  transitionId: from.transitionId,
              };

    const ftl: InspectedFtl | null = explanation.ftl
        ? {
              q: explanation.ftl.q,
              memberCount: explanation.ftl.entry.members.length,
              orderSource: explanation.ftl.entry.orderSource,
              target:
                  explanation.ftl.entry.targets.find(
                      ([id]) => id === marcherId,
                  )?.[1] ?? null,
          }
        : null;

    const seen = new Set<string>();
    const diagnostics: Diagnostic[] = [];
    for (const d of [
        ...explanation.diagnostics,
        ...sources.showDiagnostics.filter((d) => d.marcherId === marcherId),
    ]) {
        const key = diagnosticKey(d);
        if (seen.has(key)) continue;
        seen.add(key);
        diagnostics.push(d);
    }

    return {
        marcherId,
        beat,
        span: spanOf(span),
        transition,
        layer,
        progress: explanation.progress,
        origin,
        ftl,
        diagnostics,
    };
}

/** The diagnostics of the whole show that name a transition, grouped for the show-wide list. */
export function groupDiagnosticsByTransition(
    diagnostics: readonly Diagnostic[],
): Array<{ transitionId: number; diagnostics: Diagnostic[] }> {
    const groups = new Map<number, Diagnostic[]>();
    for (const d of diagnostics) {
        const list = groups.get(d.transitionId) ?? [];
        list.push(d);
        groups.set(d.transitionId, list);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([transitionId, list]) => ({ transitionId, diagnostics: list }));
}

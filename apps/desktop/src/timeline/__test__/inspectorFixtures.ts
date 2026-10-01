import {
    createResolver,
    type SpanKind,
    type TimelineSnapshot,
} from "@openmarch/core";
import { GOLDEN_FIXTURES } from "../fixtures/goldenFixtures";
import { line, rowBuilder, tr } from "../fixtures/fixtureTypes";
import {
    buildMarcherInspection,
    type InspectionSources,
    type MarcherInspection,
} from "../timelineInspector";

/** Test helpers for the inspector (P8.5): golden shows, their inspections and where to look. */

export const golden = (name: string): TimelineSnapshot => {
    const fixture = GOLDEN_FIXTURES.find((f) => f.name === name);
    if (!fixture) throw new Error(`no golden fixture ${name}`);
    return fixture.build().show;
};

/** QA-DG-4: a follow-the-leader transition whose marchers all join late, so it has no founders. */
export function ftlEmptyShow(): TimelineSnapshot {
    const show = golden("G6");
    show.assignments = show.assignments.map((r) =>
        r.transition === 2 ? { ...r, start: 6 } : r,
    );
    return show;
}

/** A show with a one-slot freehand transition, to exercise arc params and waypoints. */
export function arcShow(): TimelineSnapshot {
    const row = rowBuilder();
    return {
        marchers: [{ id: 1, home: [0, 0] }],
        shapes: {
            1: line([
                [10, 0],
                [11, 0],
            ]),
        },
        transitions: {
            1: tr(1, 0, 8, 1, { style: "arc", params: { bulge: 0.25 } }),
        },
        assignments: [row(1, 1, 0, 0, 8)],
    };
}

/** The sources for `show`: every transition on timeline 1, shapes named `S<id>`. */
export function inspectionSources(show: TimelineSnapshot): InspectionSources {
    const resolver = createResolver(show);
    const transitions = Object.values(show.transitions);
    return {
        tables: {
            timelines: [
                {
                    id: 1,
                    name: "Opener",
                    start: Math.min(...transitions.map((t) => t.start)),
                    end: Math.max(...transitions.map((t) => t.end)),
                },
            ],
            transitions: transitions.map((t) => ({
                id: t.id,
                timelineId: 1,
                destShapeId: t.dest,
                slotCount: t.slots,
                start: t.start,
                end: t.end,
            })),
            assignments: show.assignments,
            shapes: Object.keys(show.shapes).map((id) => ({
                id: Number(id),
                name: `S${id}`,
            })),
        },
        transitions: show.transitions,
        shapeKinds: Object.fromEntries(
            Object.entries(show.shapes).map(([id, s]) => [id, s.kind]),
        ),
        showDiagnostics: resolver.diagnostics(),
    };
}

/** `marcherId`'s inspection at `beat` in `show`. */
export function inspect(
    show: TimelineSnapshot,
    marcherId: number,
    beat: number,
): MarcherInspection {
    const resolver = createResolver(show);
    return buildMarcherInspection(
        marcherId,
        beat,
        resolver.explain(marcherId, beat),
        inspectionSources(show),
    );
}

/** A beat inside the marcher's first span of `kind` (the middle of a finite one). */
export function beatOfSpanKind(
    show: TimelineSnapshot,
    marcherId: number,
    kind: SpanKind,
    nth = 0,
): number {
    const spans = createResolver(show)
        .spanInfos(marcherId)
        .filter((s) => s.kind === kind && Number.isFinite(s.start));
    const span = spans[nth];
    if (!span) throw new Error(`no ${kind} span for marcher ${marcherId}`);
    return Number.isFinite(span.end)
        ? (span.start + span.end) / 2
        : span.start + 1;
}

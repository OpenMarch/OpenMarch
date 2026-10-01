import { eq, sql } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "@/db-functions/types";
import { transactionWithHistory } from "@/db-functions/history";
import { createMarchersInTransaction } from "@/db-functions/marcher";
import { updateMarcherHomesInTransaction } from "@/db-functions/marcherHome";
import { createTimelinesInTransaction } from "@/db-functions/timelines";
import { createTimelineShapesInTransaction } from "@/db-functions/timelineShapes";
import {
    createTimelineTransitionsInTransaction,
    type TimelinePathParams,
} from "@/db-functions/timelineTransitions";
import { createTimelineAssignmentsInTransaction } from "@/db-functions/timelineAssignments";
import type { PathParams, TransitionRow } from "@openmarch/core";
import type { FixtureTimeline, TimelineFixture } from "./fixtureTypes";

/**
 * Writes a fixture into the open file (docs/timeline/phases/05-rendering.md P5.7): new marchers,
 * timelines, shapes, transitions and assignments, through the timeline db-functions, as ONE
 * undoable edit. Existing rows are left alone, so a fixture can be loaded into any file; its
 * marchers get a drill prefix of their own, numbered after any that already use it.
 */

/** The drill prefix of fixture marchers. */
export const FIXTURE_DRILL_PREFIX = "FX";

export interface LoadTimelineFixtureOptions {
    /**
     * Added to every beat. Beat 0 has no show time (beat 1 starts the show; see `timeMap.ts`), so
     * the dev loader passes 1 to make a fixture that starts at beat 0 visible from the start.
     */
    beatOffset?: number;
}

/** The database id of each fixture id, by table. */
export interface LoadedTimelineFixture {
    marchers: Map<number, number>;
    shapes: Map<number, number>;
    transitions: Map<number, number>;
    timelines: Map<number, number>;
    assignments: Map<number, number>;
}

/** Path params in the db-functions' shape: one of `{bulge}`, `{waypoints}` or null, by style. */
const pathParamsFor = (t: TransitionRow): TimelinePathParams => {
    const params: PathParams | null = t.params;
    if (t.style === "arc") return { bulge: params?.bulge ?? 0 };
    if (t.style === "follow_the_leader")
        return { waypoints: params?.waypoints ?? [] };
    return null;
};

/** One timeline over every transition, when the fixture names none. */
const defaultTimelines = (fixture: TimelineFixture): FixtureTimeline[] => {
    const transitions = Object.values(fixture.show.transitions);
    if (transitions.length === 0) return [];
    return [
        {
            id: 1,
            name: fixture.name,
            start: Math.min(...transitions.map((t) => t.start)),
            end: Math.max(...transitions.map((t) => t.end)),
            transitions: transitions.map((t) => t.id),
        },
    ];
};

const nextDrillOrder = async (tx: DbTransaction): Promise<number> => {
    const row = await tx
        .select({
            max: sql<number | null>`max(${schema.marchers.drill_order})`,
        })
        .from(schema.marchers)
        .where(eq(schema.marchers.drill_prefix, FIXTURE_DRILL_PREFIX))
        .get();
    return (row?.max ?? 0) + 1;
};

/** Writes `fixture` inside `tx`. Throws, and writes nothing once the edit rolls back, on a bad row. */
// eslint-disable-next-line max-lines-per-function
export async function writeTimelineFixtureInTransaction({
    tx,
    fixture,
    beatOffset = 0,
}: {
    tx: DbTransaction;
    fixture: TimelineFixture;
    beatOffset?: number;
}): Promise<LoadedTimelineFixture> {
    const { show } = fixture;
    const loaded: LoadedTimelineFixture = {
        marchers: new Map(),
        shapes: new Map(),
        transitions: new Map(),
        timelines: new Map(),
        assignments: new Map(),
    };
    const need = (map: Map<number, number>, id: number, what: string) => {
        const mapped = map.get(id);
        if (mapped === undefined)
            throw new Error(`${fixture.name}: unknown ${what} ${id}`);
        return mapped;
    };

    // Marchers, then their homes
    const firstOrder = await nextDrillOrder(tx);
    const marchers = await createMarchersInTransaction({
        tx,
        newMarchers: show.marchers.map((m, i) => ({
            name: `${fixture.name} M${m.id}`,
            section: "Other",
            drill_prefix: FIXTURE_DRILL_PREFIX,
            drill_order: firstOrder + i,
        })),
    });
    show.marchers.forEach((m, i) => loaded.marchers.set(m.id, marchers[i]!.id));
    await updateMarcherHomesInTransaction({
        tx,
        modifiedHomes: show.marchers.map((m) => ({
            marcherId: loaded.marchers.get(m.id)!,
            home: m.home,
        })),
    });

    // Timelines
    const timelines = fixture.timelines ?? defaultTimelines(fixture);
    const timelineOf = new Map<number, number>();
    const createdTimelines = await createTimelinesInTransaction({
        tx,
        newTimelines: timelines.map((l) => ({
            name: l.name,
            startBeat: l.start + beatOffset,
            endBeat: l.end + beatOffset,
        })),
    });
    timelines.forEach((l, i) => {
        loaded.timelines.set(l.id, createdTimelines[i]!.id);
        for (const t of l.transitions)
            timelineOf.set(t, createdTimelines[i]!.id);
    });

    // Shapes
    const shapeIds = Object.keys(show.shapes).map(Number);
    const createdShapes = await createTimelineShapesInTransaction({
        tx,
        newShapes: shapeIds.map((id) => ({
            name: `${fixture.name} S${id}`,
            kind: show.shapes[id]!.kind,
            geometry: show.shapes[id]!.geometry,
        })),
    });
    shapeIds.forEach((id, i) => loaded.shapes.set(id, createdShapes[i]!.id));

    // Transitions, each with its shape or its individual destinations
    const transitions = Object.values(show.transitions);
    const createdTransitions = await createTimelineTransitionsInTransaction({
        tx,
        newTransitions: transitions.map((t) => ({
            timelineId: need(timelineOf, t.id, "timeline of transition"),
            startBeat: t.start + beatOffset,
            endBeat: t.end + beatOffset,
            slotCount: t.slots,
            destination:
                t.dest === null
                    ? { kind: "individual", points: t.points ?? [] }
                    : {
                          kind: "shape",
                          shapeId: need(loaded.shapes, t.dest, "shape"),
                      },
            pathStyle: t.style,
            pathParams: pathParamsFor(t),
            orderMode: t.order,
        })),
    });
    transitions.forEach((t, i) =>
        loaded.transitions.set(t.id, createdTransitions[i]!.id),
    );

    // Assignments
    const createdAssignments = await createTimelineAssignmentsInTransaction({
        tx,
        newAssignments: show.assignments.map((a) => ({
            marcherId: need(loaded.marchers, a.marcher, "marcher"),
            transitionId: need(loaded.transitions, a.transition, "transition"),
            slotIndex: a.slot,
            startBeat: a.start + beatOffset,
            endBeat: a.end + beatOffset,
            layer: a.layer,
        })),
    });
    show.assignments.forEach((a, i) =>
        loaded.assignments.set(a.id, createdAssignments[i]!.id),
    );

    return loaded;
}

/** Loads `fixture` into the file as one undoable edit. */
export function loadTimelineFixture(
    db: DbConnection,
    fixture: TimelineFixture,
    { beatOffset = 0 }: LoadTimelineFixtureOptions = {},
): Promise<LoadedTimelineFixture> {
    return transactionWithHistory(db, "loadTimelineFixture", (tx) =>
        writeTimelineFixtureInTransaction({ tx, fixture, beatOffset }),
    );
}

import type {
    AssignmentRow,
    ShapeRow,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "@openmarch/core";

/**
 * A show to load into a file for development and tests (docs/timeline/phases/05-rendering.md
 * P5.7). Generators build these as plain data; `loadTimelineFixture` writes one through the
 * timeline db-functions. Every id is local to the fixture: the loader maps it to the id the
 * database gives the row.
 */
export interface TimelineFixture {
    /** Short name, such as "G6" or "QA-SC-11 (seed 1)" */
    name: string;
    /** What the fixture shows, for the dev console */
    description: string;
    /** Marchers, shapes, transitions and assignments, in the core model's shape */
    show: TimelineSnapshot;
    /**
     * The timelines (tracks) and which one holds each transition. Without it, the loader makes one
     * timeline that spans every transition.
     */
    timelines?: FixtureTimeline[];
}

export interface FixtureTimeline {
    id: number;
    name: string;
    start: number;
    end: number;
    /** Ids of the transitions on this timeline */
    transitions: number[];
}

// ---------------------------------------------------------------------------
// Builders, in the shape of the core golden tests (packages/core/src/timeline/__test__/fixtures.ts)
// ---------------------------------------------------------------------------

/** `P(x, y)`: a line shape whose first slot (of a one-slot transition) is at (x, y). */
export const P = (x: number, y: number): ShapeRow => ({
    kind: "line",
    geometry: {
        points: [
            [x, y],
            [x + 1, y],
        ],
    },
});

/** A line or freehand shape through `points`. */
export const line = (
    points: XY[],
    kind: "line" | "freehand" = "line",
): ShapeRow => ({ kind, geometry: { points } });

/** A transition; one slot, direct, `inherit` order and no params unless `extra` says otherwise. */
export const tr = (
    id: number,
    start: number,
    end: number,
    dest: number | null,
    extra: Partial<TransitionRow> = {},
): TransitionRow => ({
    id,
    start,
    end,
    dest,
    slots: 1,
    style: "direct",
    order: "inherit",
    params: null,
    ...extra,
});

/** Builds assignment rows with ids counting up from 1 per fixture. */
export const rowBuilder = () => {
    let id = 1;
    return (
        marcher: number,
        transition: number,
        slot: number,
        start: number,
        end: number,
        layer = 0,
    ): AssignmentRow => ({
        id: id++,
        marcher,
        transition,
        slot,
        start,
        end,
        layer,
    });
};

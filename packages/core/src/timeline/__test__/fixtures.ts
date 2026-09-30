/**
 * Golden vectors G1-G13 and G8b (spec 12.4, ported from ref/golden.mjs) as
 * data, shared by the oracle and resolver tests so both run the same shows
 * against the same expected values.
 */
import type {
    AssignmentRow,
    OrderSource,
    PathParams,
    ShapeRow,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";

let RID = 1;
/** `P(x, y)`: a line shape whose only slot (slot_count 1) is at (x, y). */
export const P = (x: number, y: number): ShapeRow => ({
    kind: "line",
    geometry: {
        points: [
            [x, y],
            [x + 1, y],
        ],
    },
});
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
export const row = (
    marcher: number,
    transition: number,
    slot: number,
    start: number,
    end: number,
    layer = 0,
): AssignmentRow => ({
    id: RID++,
    marcher,
    transition,
    slot,
    start,
    end,
    layer,
});

export type Expected = Array<
    [marcher: number, beat: number, x: number, y: number]
>;

export interface ExpectedEntry {
    transitionId: number;
    members: number[];
    source: OrderSource["kind"];
    endDist: number[];
    /** When set, the whole order source must equal this */
    orderSource?: OrderSource;
}

export interface GoldenCase {
    name: string;
    /** Builds a fresh show, so a test may mutate it */
    db: () => TimelineSnapshot;
    expected: Expected;
    eps?: number;
    entry?: ExpectedEntry;
}

export const oneMarcher = (
    shapes: TimelineSnapshot["shapes"],
    transitions: TimelineSnapshot["transitions"],
    assignments: AssignmentRow[],
): TimelineSnapshot => ({
    marchers: [{ id: 1, home: [0, 0] }],
    shapes,
    transitions,
    assignments,
});

/** G6's show: box (T1) then FTL (T2) with slots deliberately reversed. */
export const g6 = (up: XY[]): TimelineSnapshot => ({
    marchers: [1, 2, 3, 4].map((id, i) => ({
        id,
        home: [2 * i, 0] as XY,
    })),
    shapes: {
        1: { kind: "line", geometry: { points: up } },
        2: {
            kind: "line",
            geometry: {
                points: [
                    [6, 2],
                    [6, 8],
                ],
            },
        },
    },
    transitions: {
        1: tr(1, 0, 4, 1, { slots: 4 }),
        2: tr(2, 4, 12, 2, {
            slots: 4,
            style: "follow_the_leader",
            params: { waypoints: [] },
        }),
    },
    assignments: [1, 2, 3, 4].flatMap((m, i) => [
        row(m, 1, i, 0, 4),
        row(m, 2, 3 - i, 4, 12),
    ]),
});
const g6Flat = () =>
    g6([
        [0, 0],
        [6, 0],
    ]);

const arc = (bulge: number) =>
    oneMarcher(
        { 1: P(8, 0) },
        { 1: tr(1, 0, 8, 1, { style: "arc", params: { bulge } }) },
        [row(1, 1, 0, 0, 8)],
    );

const g13 = (): TimelineSnapshot => {
    const params: PathParams = { bulge: 0.5 };
    return {
        marchers: [1, 2, 3].map((id) => ({ id, home: [0, 0] as XY })),
        shapes: {
            1: {
                kind: "line",
                geometry: {
                    points: [
                        [0, 10],
                        [8, 10],
                    ],
                },
            },
        },
        transitions: {
            1: tr(1, 0, 8, null, {
                points: [
                    [4, 4],
                    [-2, 6],
                    [10, 0],
                ],
                slots: 3,
            }),
            2: tr(2, 8, 16, 1, { slots: 3 }),
            3: tr(3, 16, 24, null, {
                points: [[8, 18]],
                style: "arc",
                params,
            }),
            4: tr(4, 12, 16, null, { points: [[20, 20]] }),
        },
        assignments: [
            row(1, 1, 0, 0, 8),
            row(2, 1, 1, 0, 8),
            row(3, 1, 2, 0, 8),
            row(1, 2, 0, 8, 16),
            row(2, 2, 1, 8, 16),
            row(3, 2, 2, 8, 16),
            row(3, 3, 0, 16, 24),
            row(2, 4, 0, 12, 16, 1),
        ],
    };
};

export const GOLDEN: GoldenCase[] = [
    {
        name: "G1: one direct move, clamped outside",
        db: () =>
            oneMarcher({ 1: P(16, 0) }, { 1: tr(1, 0, 16, 1) }, [
                row(1, 1, 0, 0, 16),
            ]),
        expected: [
            [1, -1, 0, 0],
            [1, 0, 0, 0],
            [1, 4, 4, 0],
            [1, 15.999, 15.999, 0],
            [1, 16, 16, 0],
            [1, 100, 16, 0],
        ],
    },
    {
        name: "G2: a higher layer takes over and rebases",
        db: () =>
            oneMarcher(
                { 1: P(16, 0), 2: P(8, 8) },
                { 1: tr(1, 0, 16, 1), 2: tr(2, 8, 16, 2) },
                [row(1, 1, 0, 0, 16, 0), row(1, 2, 0, 8, 16, 1)],
            ),
        expected: [
            [1, 4, 4, 0],
            [1, 7.999, 7.999, 0],
            [1, 8, 8, 0],
            [1, 12, 8, 4],
            [1, 16, 8, 8],
        ],
    },
    {
        name: "G3: three layers",
        db: () =>
            oneMarcher(
                { 1: P(16, 0), 2: P(4, 8), 3: P(10, 10) },
                {
                    1: tr(1, 0, 16, 1),
                    2: tr(2, 4, 12, 2),
                    3: tr(3, 6, 10, 3),
                },
                [
                    row(1, 1, 0, 0, 16, 0),
                    row(1, 2, 0, 4, 12, 1),
                    row(1, 3, 0, 6, 10, 2),
                ],
            ),
        expected: [
            [1, 2, 2, 0],
            [1, 4, 4, 0],
            [1, 6, 4, 2],
            [1, 8, 7, 6],
            [1, 10, 10, 10],
            [1, 11, 7, 9],
            [1, 12, 4, 8],
            [1, 14, 10, 4],
            [1, 16, 16, 0],
        ],
    },
    {
        name: "G4: a gap holds",
        db: () =>
            oneMarcher(
                { 1: P(8, 0), 2: P(8, 8) },
                { 1: tr(1, 0, 8, 1), 2: tr(2, 12, 20, 2) },
                [row(1, 1, 0, 0, 8), row(1, 2, 0, 12, 20)],
            ),
        expected: [
            [1, 4, 4, 0],
            [1, 8, 8, 0],
            [1, 10, 8, 0],
            [1, 12, 8, 0],
            [1, 16, 8, 4],
            [1, 20, 8, 8],
        ],
    },
    {
        name: "G5: a join rebases from home",
        db: () => ({
            marchers: [{ id: 2, home: [0, 0] }],
            shapes: { 1: P(0, 16) },
            transitions: { 1: tr(1, 0, 16, 1) },
            assignments: [row(2, 1, 0, 8, 16)],
        }),
        expected: [
            [2, 4, 0, 0],
            [2, 8, 0, 0],
            [2, 12, 0, 8],
            [2, 16, 0, 16],
        ],
    },
    {
        name: "G6: FTL inherits its order",
        db: g6Flat,
        expected: [
            [1, 8, 4, 0],
            [2, 8, 6, 0],
            [3, 8, 6, 2],
            [4, 8, 6, 4],
            [1, 12, 6, 2],
            [2, 12, 6, 4],
            [3, 12, 6, 6],
            [4, 12, 6, 8],
        ],
        entry: {
            transitionId: 2,
            members: [1, 2, 3, 4],
            source: "inherit",
            endDist: [8, 10, 12, 14],
        },
    },
    {
        name: "G7: FTL with a longer lead-in",
        db: () =>
            g6([
                [0, -4],
                [6, -4],
            ]),
        expected: [
            [1, 8, 6, -4],
            [2, 8, 6, -2],
            [3, 8, 6, 0],
            [4, 8, 6, 2],
            [1, 12, 6, 2],
            [2, 12, 6, 4],
            [3, 12, 6, 6],
            [4, 12, 6, 8],
        ],
        entry: {
            transitionId: 2,
            members: [1, 2, 3, 4],
            source: "inherit",
            endDist: [12, 14, 16, 18],
        },
    },
    {
        name: "G8: semicircle arc (table rounded to 4 decimals)",
        db: () => arc(0.5),
        expected: [
            [1, 2, 1.1716, 2.8284],
            [1, 4, 4, 4],
            [1, 6, 6.8284, 2.8284],
            [1, 8, 8, 0],
        ],
        eps: 1e-4,
    },
    {
        name: "G8b: negative bulge",
        db: () => arc(-0.125),
        expected: [
            [1, 4, 4, -1],
            [1, 8, 8, 0],
        ],
    },
    {
        name: "G9: FTL with a missing founder",
        db: () => {
            const db = g6Flat();
            db.marchers = db.marchers.slice(1);
            db.assignments = db.assignments.filter((r) => r.marcher !== 1);
            return db;
        },
        expected: [
            [2, 12, 6, 4],
            [3, 12, 6, 6],
            [4, 12, 6, 8],
        ],
        entry: {
            transitionId: 2,
            members: [2, 3, 4],
            source: "inherit",
            endDist: [8, 10, 12],
        },
    },
    {
        name: "G10: FTL falls back to slot order",
        db: () => {
            const db = g6Flat();
            db.transitions[3] = tr(3, 0, 4, 3);
            db.shapes[3] = P(0, 0);
            db.assignments = db.assignments.filter(
                (r) => !(r.marcher === 1 && r.transition === 1),
            );
            db.assignments.push(row(1, 3, 0, 0, 4));
            return db;
        },
        expected: [
            [4, 12, 6, 2],
            [3, 12, 6, 4],
            [2, 12, 6, 6],
            [1, 12, 6, 8],
        ],
        entry: {
            transitionId: 2,
            members: [4, 3, 2, 1],
            source: "slot",
            endDist: [12.3246, 14.3246, 16.3246, 18.3246],
            orderSource: { kind: "slot", fallback: true },
        },
    },
    {
        name: "G11: a late joiner is not a founder",
        db: () => {
            const db = g6Flat();
            db.assignments = db.assignments.map((r) =>
                r.marcher === 1 && r.transition === 2 ? { ...r, start: 8 } : r,
            );
            return db;
        },
        expected: [
            [1, 8, 0, 0],
            [1, 10, 3, 1],
            [1, 12, 6, 2],
            [4, 12, 6, 8],
        ],
        entry: {
            transitionId: 2,
            members: [2, 3, 4],
            source: "inherit",
            endDist: [8, 10, 12],
        },
    },
    {
        name: "G12: FTL resume",
        db: () => {
            const db = g6Flat();
            db.shapes[5] = P(10, 10);
            db.transitions[5] = tr(5, 6, 8, 5);
            db.assignments.push(row(4, 5, 0, 6, 8, 1));
            return db;
        },
        expected: [
            [4, 6, 6, 2],
            [4, 8, 10, 10],
            [4, 10, 8, 9],
            [4, 12, 6, 8],
            [3, 8, 6, 2],
            [3, 12, 6, 6],
        ],
    },
    {
        name: "G13 (D-16): individual moves mixed with a shape",
        db: g13,
        expected: [
            [1, 4, 2, 2],
            [1, 8, 4, 4],
            [1, 12, 2, 7],
            [1, 16, 0, 10],
            [2, 8, -2, 6],
            [2, 12, 1, 8],
            [2, 14, 10.5, 14],
            [2, 16, 20, 20],
            [3, 16, 8, 10],
            [3, 20, 4, 14],
            [3, 24, 8, 18],
        ],
    },
];

// ---------------------------------------------------------------------------
// QA-FL (spec 12.3): shows over G3's three transitions, one marcher
// ---------------------------------------------------------------------------

export const FL_SHAPES = { 1: P(16, 0), 2: P(4, 8), 3: P(10, 10) };
export const FL_TRANSITIONS = {
    1: tr(1, 0, 16, 1),
    2: tr(2, 4, 12, 2),
    3: tr(3, 6, 10, 3),
};
export const flShow = (
    assignments: AssignmentRow[],
    transitions: TimelineSnapshot["transitions"] = FL_TRANSITIONS,
): TimelineSnapshot => ({
    marchers: [{ id: 1, home: [0, 0] }],
    shapes: FL_SHAPES,
    transitions,
    assignments,
});

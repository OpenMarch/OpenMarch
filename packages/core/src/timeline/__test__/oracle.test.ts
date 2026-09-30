// cspell:ignore NONFOUNDING
/**
 * Golden vectors G1-G13 and G8b (spec 12.4, ported from ref/golden.mjs) and
 * QA-FL-01..06 (spec 12.3) against the reference oracle. The fuller suites
 * (QA-DG, QA-REG, properties) are separate work packages (P1.5, P1.6).
 */
import { describe, expect, it } from "vitest";
import { createOracle } from "../oracle";
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
const P = (x: number, y: number): ShapeRow => ({
    kind: "line",
    geometry: {
        points: [
            [x, y],
            [x + 1, y],
        ],
    },
});
const tr = (
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
const row = (
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

type Expected = Array<[marcher: number, beat: number, x: number, y: number]>;

function expectPositions(db: TimelineSnapshot, expected: Expected, eps = 1e-6) {
    const o = createOracle(db);
    for (const [m, b, x, y] of expected) {
        const p = o.positionAt(m, b);
        expect(
            Math.abs(p[0] - x),
            `M${m}@${b}.x = ${p[0]}, expected ${x}`,
        ).toBeLessThan(eps);
        expect(
            Math.abs(p[1] - y),
            `M${m}@${b}.y = ${p[1]}, expected ${y}`,
        ).toBeLessThan(eps);
    }
}

function expectEntry(
    db: TimelineSnapshot,
    tid: number,
    members: number[],
    source: OrderSource["kind"],
    endDist: number[],
) {
    const e = createOracle(db).ftlEntry(tid);
    expect(e.members).toEqual(members);
    expect(e.orderSource.kind).toBe(source);
    e.endDist.forEach((d, i) =>
        expect(Math.abs(d - endDist[i]!)).toBeLessThan(1e-4),
    );
}

const oneMarcher = (
    shapes: TimelineSnapshot["shapes"],
    transitions: TimelineSnapshot["transitions"],
    assignments: AssignmentRow[],
): TimelineSnapshot => ({
    marchers: [{ id: 1, home: [0, 0] }],
    shapes,
    transitions,
    assignments,
});

describe("golden vectors (spec 12.4), oracle", () => {
    it("G1: one direct move, clamped outside", () => {
        expectPositions(
            oneMarcher({ 1: P(16, 0) }, { 1: tr(1, 0, 16, 1) }, [
                row(1, 1, 0, 0, 16),
            ]),
            [
                [1, -1, 0, 0],
                [1, 0, 0, 0],
                [1, 4, 4, 0],
                [1, 15.999, 15.999, 0],
                [1, 16, 16, 0],
                [1, 100, 16, 0],
            ],
        );
    });

    it("G2: a higher layer takes over and rebases", () => {
        expectPositions(
            oneMarcher(
                { 1: P(16, 0), 2: P(8, 8) },
                { 1: tr(1, 0, 16, 1), 2: tr(2, 8, 16, 2) },
                [row(1, 1, 0, 0, 16, 0), row(1, 2, 0, 8, 16, 1)],
            ),
            [
                [1, 4, 4, 0],
                [1, 7.999, 7.999, 0],
                [1, 8, 8, 0],
                [1, 12, 8, 4],
                [1, 16, 8, 8],
            ],
        );
    });

    it("G3: three layers", () => {
        expectPositions(
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
            [
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
        );
    });

    it("G4: a gap holds", () => {
        expectPositions(
            oneMarcher(
                { 1: P(8, 0), 2: P(8, 8) },
                { 1: tr(1, 0, 8, 1), 2: tr(2, 12, 20, 2) },
                [row(1, 1, 0, 0, 8), row(1, 2, 0, 12, 20)],
            ),
            [
                [1, 4, 4, 0],
                [1, 8, 8, 0],
                [1, 10, 8, 0],
                [1, 12, 8, 0],
                [1, 16, 8, 4],
                [1, 20, 8, 8],
            ],
        );
    });

    it("G5: a join rebases from home", () => {
        expectPositions(
            {
                marchers: [{ id: 2, home: [0, 0] }],
                shapes: { 1: P(0, 16) },
                transitions: { 1: tr(1, 0, 16, 1) },
                assignments: [row(2, 1, 0, 8, 16)],
            },
            [
                [2, 4, 0, 0],
                [2, 8, 0, 0],
                [2, 12, 0, 8],
                [2, 16, 0, 16],
            ],
        );
    });

    const g6 = (up: XY[]): TimelineSnapshot => ({
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

    it("G6: FTL inherits its order", () => {
        const db = g6([
            [0, 0],
            [6, 0],
        ]);
        expectPositions(db, [
            [1, 8, 4, 0],
            [2, 8, 6, 0],
            [3, 8, 6, 2],
            [4, 8, 6, 4],
            [1, 12, 6, 2],
            [2, 12, 6, 4],
            [3, 12, 6, 6],
            [4, 12, 6, 8],
        ]);
        expectEntry(db, 2, [1, 2, 3, 4], "inherit", [8, 10, 12, 14]);
    });

    it("G7: FTL with a longer lead-in", () => {
        const db = g6([
            [0, -4],
            [6, -4],
        ]);
        expectPositions(db, [
            [1, 8, 6, -4],
            [2, 8, 6, -2],
            [3, 8, 6, 0],
            [4, 8, 6, 2],
            [1, 12, 6, 2],
            [2, 12, 6, 4],
            [3, 12, 6, 6],
            [4, 12, 6, 8],
        ]);
        expectEntry(db, 2, [1, 2, 3, 4], "inherit", [12, 14, 16, 18]);
    });

    const arc = (bulge: number) =>
        oneMarcher(
            { 1: P(8, 0) },
            { 1: tr(1, 0, 8, 1, { style: "arc", params: { bulge } }) },
            [row(1, 1, 0, 0, 8)],
        );
    it("G8: semicircle arc (table rounded to 4 decimals)", () => {
        expectPositions(
            arc(0.5),
            [
                [1, 2, 1.1716, 2.8284],
                [1, 4, 4, 4],
                [1, 6, 6.8284, 2.8284],
                [1, 8, 8, 0],
            ],
            1e-4,
        );
    });
    it("G8b: negative bulge", () => {
        expectPositions(arc(-0.125), [
            [1, 4, 4, -1],
            [1, 8, 8, 0],
        ]);
    });

    it("G9: FTL with a missing founder", () => {
        const db = g6([
            [0, 0],
            [6, 0],
        ]);
        db.marchers = db.marchers.slice(1);
        db.assignments = db.assignments.filter((r) => r.marcher !== 1);
        expectPositions(db, [
            [2, 12, 6, 4],
            [3, 12, 6, 6],
            [4, 12, 6, 8],
        ]);
        expectEntry(db, 2, [2, 3, 4], "inherit", [8, 10, 12]);
    });

    it("G10: FTL falls back to slot order", () => {
        const db = g6([
            [0, 0],
            [6, 0],
        ]);
        db.transitions[3] = tr(3, 0, 4, 3);
        db.shapes[3] = P(0, 0);
        db.assignments = db.assignments.filter(
            (r) => !(r.marcher === 1 && r.transition === 1),
        );
        db.assignments.push(row(1, 3, 0, 0, 4));
        expectPositions(db, [
            [4, 12, 6, 2],
            [3, 12, 6, 4],
            [2, 12, 6, 6],
            [1, 12, 6, 8],
        ]);
        expectEntry(
            db,
            2,
            [4, 3, 2, 1],
            "slot",
            [12.3246, 14.3246, 16.3246, 18.3246],
        );
        expect(createOracle(db).ftlEntry(2).orderSource).toEqual({
            kind: "slot",
            fallback: true,
        });
    });

    it("G11: a late joiner is not a founder", () => {
        const db = g6([
            [0, 0],
            [6, 0],
        ]);
        db.assignments = db.assignments.map((r) =>
            r.marcher === 1 && r.transition === 2 ? { ...r, start: 8 } : r,
        );
        expectPositions(db, [
            [1, 8, 0, 0],
            [1, 10, 3, 1],
            [1, 12, 6, 2],
            [4, 12, 6, 8],
        ]);
        expectEntry(db, 2, [2, 3, 4], "inherit", [8, 10, 12]);
    });

    it("G12: FTL resume", () => {
        const db = g6([
            [0, 0],
            [6, 0],
        ]);
        db.shapes[5] = P(10, 10);
        db.transitions[5] = tr(5, 6, 8, 5);
        db.assignments.push(row(4, 5, 0, 6, 8, 1));
        expectPositions(db, [
            [4, 6, 6, 2],
            [4, 8, 10, 10],
            [4, 10, 8, 9],
            [4, 12, 6, 8],
            [3, 8, 6, 2],
            [3, 12, 6, 6],
        ]);
    });

    it("G13 (D-16): individual moves mixed with a shape", () => {
        const params: PathParams = { bulge: 0.5 };
        expectPositions(
            {
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
            },
            [
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
        );
    });
});

describe("flattening through the oracle (spec 12.3): QA-FL", () => {
    const shapes = { 1: P(16, 0), 2: P(4, 8), 3: P(10, 10) };
    const transitions = {
        1: tr(1, 0, 16, 1),
        2: tr(2, 4, 12, 2),
        3: tr(3, 6, 10, 3),
    };
    const mk = (assignments: AssignmentRow[], ts = transitions) =>
        createOracle({
            marchers: [{ id: 1, home: [0, 0] }],
            shapes,
            transitions: ts,
            assignments,
        });
    const summary = (o: ReturnType<typeof mk>) =>
        o.spans(1).map((s) => [s.row?.id ?? null, s.start, s.end, o.kind(s)]);

    it("QA-FL-01: no rows gives one hold", () => {
        expect(summary(mk([]))).toEqual([[null, -Infinity, Infinity, "hold"]]);
    });

    it("QA-FL-02: G3 rows give the seven spans with the R-3 kinds", () => {
        const A = row(1, 1, 0, 0, 16, 0);
        const B = row(1, 2, 0, 4, 12, 1);
        const C = row(1, 3, 0, 6, 10, 2);
        expect(summary(mk([A, B, C]))).toEqual([
            [null, -Infinity, 0, "hold"],
            [A.id, 0, 4, "founding"],
            [B.id, 4, 6, "founding"],
            [C.id, 6, 10, "founding"],
            [B.id, 10, 12, "resume"],
            [A.id, 12, 16, "resume"],
            [null, 16, Infinity, "hold"],
        ]);
    });

    it("QA-FL-03: a row overridden at its transition start begins with a join", () => {
        const A = row(1, 1, 0, 0, 16, 0);
        const B = row(1, 2, 0, 0, 4, 1);
        const o = mk([A, B], {
            1: tr(1, 0, 16, 1),
            2: tr(2, 0, 4, 2),
        });
        const s = o.spans(1);
        expect(s.map((x) => [x.row?.id ?? null, x.start, x.end])).toEqual([
            [null, -Infinity, 0],
            [B.id, 0, 4],
            [A.id, 4, 16],
            [null, 16, Infinity],
        ]);
        expect(o.kind(s[1]!)).toBe("founding");
        expect(o.kind(s[2]!)).toBe("join");
    });

    it("QA-FL-04: a lower-layer row does not split adjacent winners", () => {
        const A = row(1, 1, 0, 0, 8, 0);
        const B = row(1, 1, 0, 8, 16, 0);
        const C = row(1, 1, 0, 4, 12, -1);
        const o = mk([A, B, C]);
        expect(
            o.spans(1).map((x) => [x.row?.id ?? null, x.start, x.end]),
        ).toEqual([
            [null, -Infinity, 0],
            [A.id, 0, 8],
            [B.id, 8, 16],
            [null, 16, Infinity],
        ]);
    });

    it("QA-FL-05: spans partition the line, sorted, positive, unmerged", () => {
        const rows = [
            row(1, 1, 0, 0, 16, 0),
            row(1, 2, 0, 4, 12, 1),
            row(1, 3, 0, 6, 10, 2),
            row(1, 1, 0, 20, 24, 0),
        ];
        const s = mk(rows).spans(1);
        expect(s[0]!.start).toBe(-Infinity);
        expect(s[s.length - 1]!.end).toBe(Infinity);
        s.forEach((x, i) => {
            expect(x.end).toBeGreaterThan(x.start);
            if (i > 0) {
                expect(x.start).toBe(s[i - 1]!.end);
                expect(x.row?.id ?? null).not.toBe(s[i - 1]!.row?.id ?? null);
            }
        });
    });

    it("QA-FL-06: row order and ids do not change the spans", () => {
        const make = (ids: [number, number, number]) => [
            { ...row(1, 1, 0, 0, 16, 0), id: ids[0] },
            { ...row(1, 2, 0, 4, 12, 1), id: ids[1] },
            { ...row(1, 3, 0, 6, 10, 2), id: ids[2] },
        ];
        const shape = (rows: AssignmentRow[]) => {
            const o = mk(rows);
            return o
                .spans(1)
                .map((s) => [s.row?.layer ?? null, s.start, s.end, o.kind(s)]);
        };
        const base = shape(make([1, 2, 3]));
        expect(shape(make([90, 40, 70]))).toEqual(base);
        expect(shape(make([1, 2, 3]).reverse())).toEqual(base);
    });
});

describe("diagnostics (8.9)", () => {
    it("raises D-VACANT, D-REBASE, D-FTL-EMPTY, D-FTL-NONFOUNDING and D-ORDER-FALLBACK", () => {
        const db: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 2, home: [1, 0] },
            ],
            shapes: {
                1: P(4, 0),
                2: {
                    kind: "line",
                    geometry: {
                        points: [
                            [0, 5],
                            [4, 5],
                        ],
                    },
                },
            },
            transitions: {
                1: tr(1, 0, 8, 1, { slots: 2 }), // slot 1 vacant
                2: tr(2, 0, 8, 2, {
                    slots: 2,
                    style: "follow_the_leader",
                    params: { waypoints: [] },
                }),
            },
            assignments: [
                row(1, 1, 0, 4, 8), // join, direct: D-REBASE
                row(2, 2, 0, 4, 8), // join, FTL: D-FTL-NONFOUNDING; no founders: D-FTL-EMPTY
            ],
        };
        const codes = createOracle(db)
            .diagnostics()
            .map((d) => d.code)
            .sort();
        expect(codes).toEqual(
            [
                "D-FTL-EMPTY",
                "D-FTL-NONFOUNDING",
                "D-REBASE",
                "D-VACANT",
                "D-VACANT",
            ].sort(),
        );
    });

    it("raises D-ORDER-FALLBACK when inherit finds no single upstream source (G10)", () => {
        const db: TimelineSnapshot = {
            marchers: [1, 2].map((id) => ({ id, home: [id, 0] as XY })),
            shapes: {
                1: P(0, 0),
                2: {
                    kind: "line",
                    geometry: {
                        points: [
                            [0, 2],
                            [0, 8],
                        ],
                    },
                },
            },
            transitions: {
                1: tr(1, 0, 4, 1),
                2: tr(2, 4, 12, 2, {
                    slots: 2,
                    style: "follow_the_leader",
                    params: { waypoints: [] },
                }),
            },
            assignments: [
                row(1, 1, 0, 0, 4),
                row(1, 2, 0, 4, 12),
                row(2, 2, 1, 4, 12), // M2 has no upstream row
            ],
        };
        const d = createOracle(db).diagnostics();
        expect(d.map((x) => x.code)).toContain("D-ORDER-FALLBACK");
    });

    it("a clean show raises nothing", () => {
        const db = oneMarcher({ 1: P(4, 0) }, { 1: tr(1, 0, 4, 1) }, [
            row(1, 1, 0, 0, 4),
        ]);
        expect(createOracle(db).diagnostics()).toEqual([]);
    });
});

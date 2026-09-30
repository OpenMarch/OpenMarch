// cspell:ignore NONFOUNDING
/**
 * The golden vectors G1-G13 and G8b (spec 12.4), QA-FL-01..06 (spec 12.3) and
 * the section 8.9 diagnostics, written once and run against any
 * implementation of spec section 8: the oracle and the cached resolver both
 * call {@link runGoldenSuite}.
 */
import { describe, expect, it } from "vitest";
import type {
    AssignmentRow,
    Beat,
    Diagnostic,
    FtlEntryInfo,
    SpanInfo,
    TimelineSnapshot,
    XY,
} from "../types";
import {
    GOLDEN,
    P,
    flShow,
    oneMarcher,
    row,
    tr,
    type Expected,
    type ExpectedEntry,
} from "./fixtures";

/** What the suite needs from an implementation. */
export interface Subject {
    positionAt(marcherId: number, beat: Beat): XY;
    ftlEntry(transitionId: number): FtlEntryInfo;
    spanInfos(marcherId: number): SpanInfo[];
    diagnostics(): Diagnostic[];
}

export function expectPositions(
    s: Pick<Subject, "positionAt">,
    expected: Expected,
    eps = 1e-6,
) {
    for (const [m, b, x, y] of expected) {
        const p = s.positionAt(m, b);
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

export function expectEntry(s: Pick<Subject, "ftlEntry">, want: ExpectedEntry) {
    const e = s.ftlEntry(want.transitionId);
    expect(e.transitionId).toBe(want.transitionId);
    expect(e.members).toEqual(want.members);
    expect(e.orderSource.kind).toBe(want.source);
    if (want.orderSource) expect(e.orderSource).toEqual(want.orderSource);
    expect(e.endDist).toHaveLength(want.endDist.length);
    e.endDist.forEach((d, i) =>
        expect(Math.abs(d - want.endDist[i]!)).toBeLessThan(1e-4),
    );
}

/**
 * @param after optional extra checks run on the subject after each golden
 * case, such as the resolver's cache closure.
 */
// eslint-disable-next-line max-lines-per-function
export function runGoldenSuite(
    label: string,
    make: (db: TimelineSnapshot) => Subject,
    after?: (s: Subject, db: TimelineSnapshot) => void,
) {
    describe(`golden vectors (spec 12.4), ${label}`, () => {
        for (const g of GOLDEN)
            it(g.name, () => {
                const db = g.db();
                const s = make(db);
                expectPositions(s, g.expected, g.eps);
                if (g.entry) expectEntry(s, g.entry);
                after?.(s, db);
            });
    });

    // eslint-disable-next-line max-lines-per-function
    describe(`flattening (spec 12.3): QA-FL, ${label}`, () => {
        const mk = (
            assignments: AssignmentRow[],
            ts?: TimelineSnapshot["transitions"],
        ) => make(flShow(assignments, ts));
        const summary = (s: Subject) =>
            s.spanInfos(1).map((x) => [x.assignmentId, x.start, x.end, x.kind]);

        it("QA-FL-01: no rows gives one hold", () => {
            expect(summary(mk([]))).toEqual([
                [null, -Infinity, Infinity, "hold"],
            ]);
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
            const s = mk([A, B], {
                1: tr(1, 0, 16, 1),
                2: tr(2, 0, 4, 2),
            });
            expect(summary(s)).toEqual([
                [null, -Infinity, 0, "hold"],
                [B.id, 0, 4, "founding"],
                [A.id, 4, 16, "join"],
                [null, 16, Infinity, "hold"],
            ]);
        });

        it("QA-FL-04: a lower-layer row does not split adjacent winners", () => {
            const A = row(1, 1, 0, 0, 8, 0);
            const B = row(1, 1, 0, 8, 16, 0);
            const C = row(1, 1, 0, 4, 12, -1);
            expect(
                summary(mk([A, B, C])).map(([id, a, b]) => [id, a, b]),
            ).toEqual([
                [null, -Infinity, 0],
                [A.id, 0, 8],
                [B.id, 8, 16],
                [null, 16, Infinity],
            ]);
        });

        it("QA-FL-05: spans partition the line, sorted, positive, unmerged", () => {
            const s = mk([
                row(1, 1, 0, 0, 16, 0),
                row(1, 2, 0, 4, 12, 1),
                row(1, 3, 0, 6, 10, 2),
                row(1, 1, 0, 20, 24, 0),
            ]).spanInfos(1);
            expect(s[0]!.start).toBe(-Infinity);
            expect(s[s.length - 1]!.end).toBe(Infinity);
            s.forEach((x, i) => {
                expect(x.end).toBeGreaterThan(x.start);
                if (i > 0) {
                    expect(x.start).toBe(s[i - 1]!.end);
                    expect(x.assignmentId).not.toBe(s[i - 1]!.assignmentId);
                }
            });
        });

        it("QA-FL-06: row order and ids do not change the spans", () => {
            const make3 = (ids: [number, number, number]) => [
                { ...row(1, 1, 0, 0, 16, 0), id: ids[0] },
                { ...row(1, 2, 0, 4, 12, 1), id: ids[1] },
                { ...row(1, 3, 0, 6, 10, 2), id: ids[2] },
            ];
            // transition ids stand in for the rows, independent of row ids
            const shape = (rows: AssignmentRow[]) =>
                mk(rows)
                    .spanInfos(1)
                    .map((x) => [x.transitionId, x.start, x.end, x.kind]);
            const base = shape(make3([1, 2, 3]));
            expect(shape(make3([90, 40, 70]))).toEqual(base);
            expect(shape(make3([1, 2, 3]).reverse())).toEqual(base);
        });
    });

    // eslint-disable-next-line max-lines-per-function
    describe(`diagnostics (8.9), ${label}`, () => {
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
            const codes = make(db)
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
            const d = make(db).diagnostics();
            expect(d.map((x) => x.code)).toContain("D-ORDER-FALLBACK");
        });

        it("a clean show raises nothing", () => {
            const db = oneMarcher({ 1: P(4, 0) }, { 1: tr(1, 0, 4, 1) }, [
                row(1, 1, 0, 0, 4),
            ]);
            expect(make(db).diagnostics()).toEqual([]);
        });
    });
}

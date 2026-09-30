// cspell:ignore NONFOUNDING goldens
/**
 * Degenerate-geometry goldens QA-DG-1..7 (spec 8.10, 12.4) and the third-review
 * regression QA-REG-5 (spec 12.6, 8.11), against the reference oracle. The
 * expected numbers are the spec's literal values. P-11 (no NaN or infinity) is
 * checked on every fixture over a grid of beats.
 *
 * The oracle is recursive by design (spec 12.1); the 1,000-arc QA-REG-5 case
 * records whether it fits on the stack.
 */
import { describe, expect, it } from "vitest";
import { createOracle } from "../oracle";
import type {
    AssignmentRow,
    DiagnosticCode,
    ShapeRow,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";

let RID = 1;
const line = (...points: XY[]): ShapeRow => ({
    kind: "line",
    geometry: { points },
});
/** `P(x, y)`: a one-slot line shape at (x, y) (spec 12.1). */
const P = (x: number, y: number): ShapeRow => line([x, y], [x + 1, y]);
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
/** An FTL transition over [0, 8) in slot order with no waypoints (spec 12.4 QA-DG preamble). */
const ftl = (extra: Partial<TransitionRow> = {}): TransitionRow =>
    tr(1, 0, 8, 1, {
        style: "follow_the_leader",
        order: "slot",
        params: { waypoints: [] },
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

/** P-11 on a fixture: every marcher is finite at every half beat from -1 to `to`. */
function expectAllFinite(db: TimelineSnapshot, to = 20) {
    const o = createOracle(db);
    for (const m of db.marchers) {
        for (let b = -1; b <= to; b += 0.5) {
            const p = o.positionAt(m.id, b);
            expect(
                Number.isFinite(p[0]) && Number.isFinite(p[1]),
                `M${m.id}@${b} = ${p}`,
            ).toBe(true);
        }
    }
}

function expectPositions(db: TimelineSnapshot, expected: Expected, eps = 1e-6) {
    const o = createOracle(db);
    for (const [m, b, x, y] of expected) {
        const p = o.positionAt(m, b);
        expect(
            Math.abs(p[0] - x),
            `M${m}@${b}.x = ${p[0]}, want ${x}`,
        ).toBeLessThan(eps);
        expect(
            Math.abs(p[1] - y),
            `M${m}@${b}.y = ${p[1]}, want ${y}`,
        ).toBeLessThan(eps);
    }
}

const codes = (db: TimelineSnapshot): DiagnosticCode[] =>
    createOracle(db)
        .diagnostics()
        .map((d) => d.code);

describe("QA-DG degenerate geometry (spec 8.10)", () => {
    it("QA-DG-1: one-slot FTL ends on the entrance point", () => {
        const db: TimelineSnapshot = {
            marchers: [{ id: 1, home: [0, 0] }],
            shapes: { 1: line([4, 0], [4, 6]) },
            transitions: { 1: ftl() },
            assignments: [row(1, 1, 0, 0, 8)],
        };
        expectPositions(db, [
            [1, 4, 2, 0],
            [1, 8, 4, 0],
        ]);
        expectAllFinite(db);
        expect(codes(db)).not.toContain("D-FTL-EMPTY");
    });

    it("QA-DG-2: coincident founders keep their own trail vertices", () => {
        const db: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 2, home: [0, 0] },
            ],
            shapes: { 1: line([2, 0], [2, 4]) },
            transitions: { 1: ftl({ slots: 2 }) },
            assignments: [row(1, 1, 0, 0, 8), row(2, 1, 1, 0, 8)],
        };
        expectPositions(db, [
            [1, 4, 1, 0],
            [2, 4, 2, 1],
            [1, 8, 2, 0],
            [2, 8, 2, 4],
        ]);
        expectAllFinite(db);
    });

    it("QA-DG-3: repeated waypoints with the leader already on the entrance", () => {
        const db: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 2, home: [2, 2] },
            ],
            shapes: { 1: line([2, 2], [2, 6]) },
            transitions: {
                1: ftl({
                    slots: 2,
                    params: {
                        waypoints: [
                            [2, 2],
                            [2, 2],
                        ],
                    },
                }),
            },
            assignments: [row(1, 1, 0, 0, 8), row(2, 1, 1, 0, 8)],
        };
        expectPositions(db, [
            [1, 4, 1, 1],
            [2, 4, 2, 4],
            [1, 8, 2, 2],
            [2, 8, 2, 6],
        ]);
        expectAllFinite(db);
    });

    it("QA-DG-4: no founders raises D-FTL-EMPTY and fills from the far end", () => {
        const db: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 2, home: [0, 2] },
            ],
            shapes: { 1: line([4, 0], [4, 6]) },
            transitions: { 1: ftl({ slots: 2 }) },
            assignments: [row(1, 1, 0, 4, 8), row(2, 1, 1, 4, 8)],
        };
        expectPositions(db, [
            [1, 6, 2, 3],
            [2, 6, 2, 1],
            [1, 8, 4, 6],
            [2, 8, 4, 0],
        ]);
        expectAllFinite(db);
        const empty = createOracle(db)
            .diagnostics()
            .filter((d) => d.code === "D-FTL-EMPTY");
        expect(empty).toHaveLength(1);
        expect(empty[0].transitionId).toBe(1);
        // The trail has no member vertices.
        expect(createOracle(db).ftlEntry(1).members).toEqual([]);
    });

    it("QA-DG-5: coincident samples on a freehand destination are allowed", () => {
        const db: TimelineSnapshot = {
            marchers: [
                { id: 1, home: [0, 0] },
                { id: 2, home: [-2, 0] },
                { id: 3, home: [-4, 0] },
            ],
            shapes: {
                1: {
                    kind: "freehand",
                    geometry: {
                        points: [
                            [0, 2],
                            [0, 2],
                            [4, 2],
                            [4, 2],
                            [0, 2],
                        ],
                    },
                },
            },
            transitions: { 1: ftl({ slots: 3 }) },
            assignments: [
                row(3, 1, 0, 0, 8),
                row(2, 1, 1, 0, 8),
                row(1, 1, 2, 0, 8),
            ],
        };
        expectPositions(db, [
            [1, 8, 0, 2],
            [2, 8, 4, 2],
            [3, 8, 0, 2],
        ]);
        expectAllFinite(db);
        expect(codes(db)).not.toContain("D-FTL-EMPTY");
    });

    it("QA-DG-6: an arc whose origin equals its destination stays put", () => {
        const db: TimelineSnapshot = {
            marchers: [{ id: 1, home: [3, 3] }],
            shapes: { 1: P(3, 3) },
            transitions: {
                1: tr(1, 0, 8, 1, { style: "arc", params: { bulge: 0.5 } }),
            },
            assignments: [row(1, 1, 0, 0, 8)],
        };
        expectPositions(db, [[1, 4, 3, 3]], 1e-4);
        expectAllFinite(db);
    });

    it("QA-DG-7: inherit ignores founder slot numbers but a joiner's slot picks its target", () => {
        const db: TimelineSnapshot = {
            marchers: [1, 2, 3, 4].map((id, i) => ({
                id,
                home: [2 * i, 0] as XY,
            })),
            shapes: { 1: line([0, 0], [4, 0]), 2: line([6, 2], [6, 8]) },
            transitions: {
                1: tr(1, 0, 4, 1, { slots: 3 }),
                2: tr(2, 4, 12, 2, {
                    slots: 4,
                    style: "follow_the_leader",
                    params: { waypoints: [] },
                }),
            },
            assignments: [
                row(1, 1, 0, 0, 4),
                row(2, 1, 1, 0, 4),
                row(3, 1, 2, 0, 4),
                row(1, 2, 3, 4, 12),
                row(2, 2, 1, 4, 12),
                row(3, 2, 2, 4, 12),
                row(4, 2, 0, 8, 12),
            ],
        };
        expectPositions(db, [
            [1, 12, 6, 4],
            [2, 12, 6, 6],
            [3, 12, 6, 8],
            [4, 12, 6, 2],
        ]);
        expectAllFinite(db);
        // The founders come from one upstream transition, so no fallback.
        expect(codes(db)).not.toContain("D-ORDER-FALLBACK");
    });
});

describe("QA-REG-5: chained partial minor arcs (spec 8.11)", () => {
    const BETA = 1e6 + 1;

    /** N arcs from (1e6, 0) toward (0, 0), each stolen halfway, then a direct move to (1, 1). */
    const chain = (n: number, bulge: number): TimelineSnapshot => {
        const transitions: Record<number, TransitionRow> = {};
        const assignments: AssignmentRow[] = [];
        for (let i = 0; i < n; i++) {
            transitions[i + 1] = tr(i + 1, i, i + 2, 1, {
                style: "arc",
                params: { bulge },
            });
            assignments.push(row(1, i + 1, 0, i, i + 1));
        }
        transitions[n + 1] = tr(n + 1, n, n + 4, 2);
        assignments.push(row(1, n + 1, 0, n, n + 4));
        return {
            marchers: [{ id: 1, home: [1e6, 0] }],
            shapes: { 1: P(0, 0), 2: P(1, 1) },
            transitions,
            assignments,
        };
    };

    function check(n: number) {
        const o = createOracle(chain(n, 0.5));
        const bound = BETA * Math.sqrt(1 + n);
        let max = 0;
        for (let b = 0; b <= n; b += 0.5) {
            const p = o.positionAt(1, b);
            expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
            const norm = Math.hypot(p[0], p[1]);
            expect(norm, `|P| at beat ${b}`).toBeLessThanOrEqual(bound);
            max = Math.max(max, norm);
        }
        // In practice the marcher never passes its starting distance (spec 8.11).
        expect(max).toBeLessThanOrEqual(1e6 * (1 + 1e-9));
        // The direct move that follows arrives exactly, bit for bit.
        for (const b of [n + 4, n + 5, n + 100]) {
            const p = o.positionAt(1, b);
            expect(p[0]).toBe(1);
            expect(p[1]).toBe(1);
        }
    }

    it("40 chained arcs stay within the bound and arrive exactly at (1, 1)", () => {
        check(40);
    });

    it("1,000 chained arcs stay within the bound and arrive exactly at (1, 1)", () => {
        // The oracle recurses over the chain; if this overflows the stack on
        // some runtime, the 40-arc case above remains the required one.
        check(1000);
    });
});

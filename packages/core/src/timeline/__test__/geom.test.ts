// cspell:ignore lerp
import { describe, expect, it } from "vitest";
import {
    arcPoint,
    classifySpan,
    clamp01,
    cumOf,
    destPath,
    destinationsOf,
    flatten,
    lerp,
    paramT,
    pointAtDistance,
    sampleDestinations,
} from "../geom";
import type { AssignmentRow, ShapeRow, XY } from "../types";

let RID = 1;
const row = (
    transition: number,
    start: number,
    end: number,
    layer = 0,
): AssignmentRow => ({
    id: RID++,
    marcher: 1,
    transition,
    slot: 0,
    start,
    end,
    layer,
});

describe("lerp", () => {
    it("returns endpoints bit for bit", () => {
        const a: XY = [0.1, 0.2];
        const b: XY = [0.7, 1e-300];
        expect(lerp(a, b, 0)).toBe(a);
        expect(lerp(a, b, -3)).toBe(a);
        expect(lerp(a, b, 1)).toBe(b);
        expect(lerp(a, b, 7)).toBe(b);
    });
    it("interpolates linearly inside", () => {
        expect(lerp([0, 0], [10, -4], 0.25)).toEqual([2.5, -1]);
    });
});

describe("clamp01 / paramT", () => {
    it("clamps", () => {
        expect(clamp01(-1)).toBe(0);
        expect(clamp01(2)).toBe(1);
        expect(clamp01(0.3)).toBe(0.3);
    });
    it("open paths span [0,1], closed paths wrap, n = 1 gives 0", () => {
        expect(paramT(false, 0, 1)).toBe(0);
        expect(paramT(false, 3, 4)).toBe(1);
        expect(paramT(true, 3, 4)).toBe(0.75);
    });
});

describe("pointAtDistance (8.10)", () => {
    const pts: XY[] = [
        [0, 0],
        [4, 0],
        [4, 0], // zero-length segment
        [4, 3],
    ];
    const cum = cumOf(pts);
    it("clamps to the first and last points", () => {
        expect(pointAtDistance(pts, cum, -1)).toBe(pts[0]);
        expect(pointAtDistance(pts, cum, 0)).toBe(pts[0]);
        expect(pointAtDistance(pts, cum, 7)).toBe(pts[3]);
        expect(pointAtDistance(pts, cum, 99)).toBe(pts[3]);
    });
    it("never selects a zero-length segment", () => {
        expect(pointAtDistance(pts, cum, 4)).toEqual([4, 0]);
        expect(pointAtDistance(pts, cum, 5.5)).toEqual([4, 1.5]);
        for (let d = 0; d <= 7; d += 0.25) {
            const p = pointAtDistance(pts, cum, d);
            expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
        }
    });
});

describe("arcPoint (R-8)", () => {
    const A: XY = [0, 0];
    const B: XY = [8, 0];
    it("returns endpoints exactly", () => {
        expect(arcPoint(A, B, 0.5, 0)).toBe(A);
        expect(arcPoint(A, B, 0.5, 1)).toBe(B);
        expect(arcPoint(A, B, 0.5, -1)).toBe(A);
    });
    it("bulge 0.5 is a semicircle through (4, 4)", () => {
        const m = arcPoint(A, B, 0.5, 0.5);
        expect(m[0]).toBeCloseTo(4, 12);
        expect(m[1]).toBeCloseTo(4, 12);
    });
    it("bulge sign picks the side; sagitta is |k| * chord", () => {
        const m = arcPoint(A, B, -0.125, 0.5);
        expect(m[0]).toBeCloseTo(4, 12);
        expect(m[1]).toBeCloseTo(-1, 12);
    });
    it("degenerate chord and zero bulge degrade to a straight line", () => {
        expect(arcPoint([2, 2], [2, 2], 0.5, 0.5)).toEqual([2, 2]);
        expect(arcPoint(A, B, 0, 0.25)).toEqual([2, 0]);
        expect(arcPoint([0, 0], [1e-12, 0], 0.5, 0.5)[0]).toBeCloseTo(
            5e-13,
            20,
        );
    });
    it("stays on the circle at constant angular speed", () => {
        const k = 0.3;
        const c = 8;
        const phi = 2 * Math.atan(2 * k);
        const r = c / 2 / Math.sin(phi);
        const centre: XY = [4, -r * Math.cos(phi)];
        for (const p of [0.1, 0.4, 0.5, 0.9]) {
            const q = arcPoint(A, B, k, p);
            expect(Math.hypot(q[0] - centre[0], q[1] - centre[1])).toBeCloseTo(
                Math.abs(r),
                9,
            );
        }
    });
});

describe("destPath / sampleDestinations (R-13)", () => {
    it("line: open, endpoints exact", () => {
        const s: ShapeRow = {
            kind: "line",
            geometry: {
                points: [
                    [0, 0],
                    [6, 0],
                ],
            },
        };
        const P = destPath(s);
        expect(P.closed).toBe(false);
        expect(P.L).toBe(6);
        expect(sampleDestinations(s, 4)).toEqual([
            [0, 0],
            [2, 0],
            [4, 0],
            [6, 0],
        ]);
        expect(sampleDestinations(s, 1)).toEqual([[0, 0]]);
    });
    it("box: closed, perimeter walk without repeating the start", () => {
        const s: ShapeRow = {
            kind: "box",
            geometry: { origin: [0, 0], width: 4, height: 4 },
        };
        expect(destPath(s).closed).toBe(true);
        expect(sampleDestinations(s, 4)).toEqual([
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
        ]);
    });
    it("circle: exact parameterization, direction and start angle", () => {
        const ccw: ShapeRow = {
            kind: "circle",
            geometry: {
                center: [10, 10],
                radius: 5,
                start_angle: 0,
                clockwise: false,
            },
        };
        const q = sampleDestinations(ccw, 4);
        const want: XY[] = [
            [15, 10],
            [10, 15],
            [5, 10],
            [10, 5],
        ];
        q.forEach((p, i) => {
            expect(p[0]).toBeCloseTo(want[i][0], 12);
            expect(p[1]).toBeCloseTo(want[i][1], 12);
        });
        const cw = sampleDestinations(
            {
                kind: "circle",
                geometry: { ...ccw.geometry, clockwise: true },
            },
            4,
        );
        expect(cw[1][0]).toBeCloseTo(10, 12);
        expect(cw[1][1]).toBeCloseTo(5, 12);
    });
    it("freehand may revisit a point (coincident samples are not an error)", () => {
        const s: ShapeRow = {
            kind: "freehand",
            geometry: {
                points: [
                    [0, 0],
                    [2, 0],
                    [0, 0],
                ],
            },
        };
        const d = sampleDestinations(s, 3);
        expect(d[0]).toEqual([0, 0]);
        expect(d[2]).toEqual([0, 0]);
    });
    it("block: row-major grid", () => {
        const s: ShapeRow = {
            kind: "block",
            geometry: { origin: [1, 1], rows: 2, cols: 2, spacing: [2, 3] },
        };
        expect(sampleDestinations(s, 3)).toEqual([
            [1, 1],
            [3, 1],
            [1, 4],
        ]);
        expect(() => destPath(s)).toThrow();
    });
    it("individual destinations are copied and truncated to slots", () => {
        const pts: XY[] = [
            [1, 2],
            [3, 4],
            [5, 6],
        ];
        const d = destinationsOf({ dest: null, points: pts, slots: 2 }, {});
        expect(d).toEqual([
            [1, 2],
            [3, 4],
        ]);
        expect(d[0]).not.toBe(pts[0]);
    });
});

describe("flatten (R-2) and classifySpan (R-3): QA-FL", () => {
    const start = (t: number) => (t === 1 ? 0 : t === 2 ? 4 : t === 3 ? 6 : 0);
    const kinds = (rows: AssignmentRow[]) => {
        const sp = flatten(rows);
        return sp.map((s) => classifySpan(s, sp, start));
    };

    it("QA-FL-01: no rows gives one hold over the whole line", () => {
        expect(flatten([])).toEqual([
            { row: null, start: -Infinity, end: Infinity },
        ]);
    });

    it("QA-FL-02: G3 rows give the seven spans of R-2", () => {
        const A = row(1, 0, 16, 0);
        const B = row(2, 4, 12, 1);
        const C = row(3, 6, 10, 2);
        const sp = flatten([A, B, C]);
        expect(sp.map((s) => [s.row?.id ?? null, s.start, s.end])).toEqual([
            [null, -Infinity, 0],
            [A.id, 0, 4],
            [B.id, 4, 6],
            [C.id, 6, 10],
            [B.id, 10, 12],
            [A.id, 12, 16],
            [null, 16, Infinity],
        ]);
        expect(kinds([A, B, C])).toEqual([
            "hold",
            "founding",
            "founding",
            "founding",
            "resume",
            "resume",
            "hold",
        ]);
    });

    it("QA-FL-03: a row overridden at its start begins with a join", () => {
        const A = row(1, 0, 16, 0);
        const B = row(1, 0, 4, 1);
        // B is a different row on the same transition start
        const sp = flatten([A, B]);
        expect(sp.map((s) => [s.row?.id ?? null, s.start, s.end])).toEqual([
            [null, -Infinity, 0],
            [B.id, 0, 4],
            [A.id, 4, 16],
            [null, 16, Infinity],
        ]);
        expect(classifySpan(sp[2], sp, () => 0)).toBe("join");
        expect(classifySpan(sp[1], sp, () => 0)).toBe("founding");
    });

    it("QA-FL-04: a lower-layer row does not split winners", () => {
        const A = row(1, 0, 8, 0);
        const B = row(1, 8, 16, 0);
        const C = row(1, 4, 12, -1);
        const sp = flatten([A, B, C]);
        expect(sp.map((s) => [s.row?.id ?? null, s.start, s.end])).toEqual([
            [null, -Infinity, 0],
            [A.id, 0, 8],
            [B.id, 8, 16],
            [null, 16, Infinity],
        ]);
    });

    it("QA-FL-05: spans partition, are sorted, positive, and unmerged", () => {
        const rows = [
            row(1, 0, 16, 0),
            row(2, 4, 12, 1),
            row(3, 6, 10, 2),
            row(1, 20, 24, 0),
        ];
        const sp = flatten(rows);
        expect(sp[0].start).toBe(-Infinity);
        expect(sp[sp.length - 1].end).toBe(Infinity);
        for (let i = 0; i < sp.length; i++) {
            expect(sp[i].end).toBeGreaterThan(sp[i].start);
            if (i > 0) {
                expect(sp[i].start).toBe(sp[i - 1].end);
                expect(sp[i].row?.id ?? null).not.toBe(
                    sp[i - 1].row?.id ?? null,
                );
            }
        }
    });

    it("QA-FL-06: input order and row ids do not change the spans", () => {
        const mk = (ids: number[]) => {
            const rows = [
                { id: ids[0], layer: 0, start: 0, end: 16 },
                { id: ids[1], layer: 1, start: 4, end: 12 },
                { id: ids[2], layer: 2, start: 6, end: 10 },
            ];
            return rows;
        };
        const shape = (rows: ReturnType<typeof mk>) =>
            flatten(rows).map((s) => [
                s.row ? s.row.layer : null,
                s.start,
                s.end,
            ]);
        const base = shape(mk([1, 2, 3]));
        expect(shape(mk([9, 4, 7]))).toEqual(base);
        expect(shape(mk([1, 2, 3]).reverse())).toEqual(base);
        expect(
            shape([mk([1, 2, 3])[1], mk([1, 2, 3])[2], mk([1, 2, 3])[0]]),
        ).toEqual(base);
    });
});

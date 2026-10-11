import { describe, expect, it } from "vitest";
import {
    arc,
    bellProfile,
    bounds,
    colorPieces,
    cylinder,
    frameAt,
    lathe,
    smoothLathe,
    smoothTube,
    transformPiece,
    triangleCount,
    tube,
    uPath,
    PART_METAL,
    type Piece,
} from "../mesh";

/** How many triangles face along their vertex normals (outward) and against them. */
function winding(p: Piece) {
    let out = 0;
    let inward = 0;
    const P = p.positions;
    const N = p.normals;
    for (let t = 0; t < p.indices.length; t += 3) {
        const [a, b, c] = [p.indices[t], p.indices[t + 1], p.indices[t + 2]];
        const e1 = [
            P[b * 3] - P[a * 3],
            P[b * 3 + 1] - P[a * 3 + 1],
            P[b * 3 + 2] - P[a * 3 + 2],
        ];
        const e2 = [
            P[c * 3] - P[a * 3],
            P[c * 3 + 1] - P[a * 3 + 1],
            P[c * 3 + 2] - P[a * 3 + 2],
        ];
        const n = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ];
        const vn = [
            N[a * 3] + N[b * 3] + N[c * 3],
            N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1],
            N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2],
        ];
        if (n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2] >= 0) out++;
        else inward++;
    }
    return { out, inward };
}

describe("lathe", () => {
    it("revolves a profile into a closed, bounded shape", () => {
        // a cone with a flat base: radius 0 at the tip, 0.1 at the base
        const p = lathe(
            [
                [0, 0.2],
                [0.1, 0],
                [0, 0],
            ],
            12,
            PART_METAL,
        );
        expect(triangleCount([p])).toBe(12 + 12); // side fan from the tip + base fan
        const b = bounds([p]);
        expect(b.min[1]).toBeCloseTo(0, 9);
        expect(b.max[1]).toBeCloseTo(0.2, 9);
        expect(b.max[0]).toBeCloseTo(0.1, 9);
        expect(p.positions.length).toBe(p.normals.length);
        expect(p.part).toBe(PART_METAL);
    });

    it("writes unit normals", () => {
        const p = lathe(
            [
                [0.05, 0],
                [0.05, 0.3],
            ],
            8,
            PART_METAL,
        );
        for (let i = 0; i < p.normals.length; i += 3)
            expect(
                Math.hypot(p.normals[i], p.normals[i + 1], p.normals[i + 2]),
            ).toBeCloseTo(1, 6);
    });
});

describe("tube", () => {
    it("sweeps a circle along a bent path with caps", () => {
        const p = tube(
            [
                [0, 0, 0],
                [0, 0, 0.3],
                [0.1, 0, 0.3],
            ],
            0.01,
            8,
            PART_METAL,
        );
        // two segments × 8 quads × 2 + two caps × 8
        expect(triangleCount([p])).toBe(2 * 8 * 2 + 2 * 8);
        const b = bounds([p]);
        expect(b.max[2]).toBeCloseTo(0.31, 2);
        expect(b.max[0]).toBeCloseTo(0.1, 2);
    });

    it("keeps the ring radius through a bend (no pinching)", () => {
        const p = tube(
            [
                [0, 0, 0],
                [0, 0, 0.2],
                [0.2, 0, 0.2],
            ],
            0.02,
            8,
            PART_METAL,
        );
        // the corner ring: every vertex near the corner keeps at least the
        // radius and at most radius / cos(45°) from it (faces own their vertices,
        // so find them by distance rather than by index)
        const near: number[] = [];
        for (let k = 0; k < p.positions.length / 3; k++) {
            const d = Math.hypot(
                p.positions[k * 3] - 0,
                p.positions[k * 3 + 1],
                p.positions[k * 3 + 2] - 0.2,
            );
            if (d < 0.05) near.push(d);
        }
        expect(near.length).toBeGreaterThan(0);
        for (const d of near) {
            expect(d).toBeLessThanOrEqual(0.02 / Math.cos(Math.PI / 4) + 1e-6);
            expect(d).toBeGreaterThanOrEqual(0.02 - 1e-6);
        }
    });
});

describe("cylinder", () => {
    it("runs from one point to another", () => {
        // 8 segments sample 90°, so the ring reaches the full radius on x
        const p = cylinder(0.02, [0, 0, 0], [0, 0.1, 0], 8, PART_METAL);
        const b = bounds([p]);
        expect(b.min[1]).toBeCloseTo(0, 9);
        expect(b.max[1]).toBeCloseTo(0.1, 9);
        expect(b.max[0]).toBeCloseTo(0.02, 6);
    });
});

describe("smooth primitives", () => {
    it("smoothTube shares ring vertices and writes radial unit normals", () => {
        const p = smoothTube(
            [
                [0, 0, 0],
                [0, 0, 0.2],
                [0, 0, 0.4],
            ],
            0.01,
            16,
            PART_METAL,
        );
        // 3 rings × 16 + 2 cap centers
        expect(p.positions.length / 3).toBe(3 * 16 + 2);
        // 2 strips × 16 quads × 2 + 2 caps × 16
        expect(triangleCount([p])).toBe(2 * 16 * 2 + 2 * 16);
        for (let i = 0; i < 3 * 16; i++) {
            const n = [
                p.normals[i * 3],
                p.normals[i * 3 + 1],
                p.normals[i * 3 + 2],
            ];
            expect(Math.hypot(...n)).toBeCloseTo(1, 6);
            expect(Math.abs(n[2])).toBeLessThan(1e-6); // perpendicular to the +Z axis
        }
    });

    it("winds every smooth triangle outward, with its normals", () => {
        const t = smoothTube(
            [
                [0, 0, 0],
                [0, 0, 0.2],
                [0.1, 0, 0.3],
            ],
            0.01,
            12,
            PART_METAL,
        );
        expect(winding(t).inward).toBe(0);
        const l = smoothLathe(
            [
                [0.02, 0],
                [0.05, 0.1],
                [0.05, 0.2],
            ],
            12,
            PART_METAL,
        );
        expect(winding(l).inward).toBe(0);
        const open = smoothTube(
            [
                [0, 0, 0],
                [0, 0, 0.2],
            ],
            0.01,
            8,
            PART_METAL,
            { capStart: false, capEnd: false },
        );
        expect(winding(open).inward).toBe(0);
    });

    it("uPath runs out, around a closed crook and back, with no long jumps", () => {
        for (const dir of [1, -1] as const) {
            const path = uPath(
                [0.1, 0, 0],
                [0, 0, dir],
                [1, 0, 0],
                0.2,
                0.04,
                6,
            );
            expect(path[0]).toEqual([0.1, 0, 0]);
            const last = path[path.length - 1];
            expect(last[0]).toBeCloseTo(0.14, 9);
            expect(last[2]).toBeCloseTo(0, 9);
            // the crook's far point is beyond the legs' ends, on the leg side
            const far = Math.max(...path.map((q) => q[2] * dir));
            expect(far).toBeGreaterThan(0.2);
            for (let i = 1; i < path.length; i++) {
                const d = Math.hypot(
                    path[i][0] - path[i - 1][0],
                    path[i][2] - path[i - 1][2],
                );
                expect(d).toBeLessThanOrEqual(0.2 + 1e-9);
                expect(d).toBeGreaterThan(1e-6);
            }
        }
    });

    it("smoothTube takes a radius per path point for a conical bore", () => {
        const p = smoothTube(
            [
                [0, 0, 0],
                [0, 0, 1],
            ],
            [0.01, 0.05],
            8,
            PART_METAL,
            { capStart: false, capEnd: false },
        );
        expect(p.positions.length / 3).toBe(16);
        const b = bounds([p]);
        expect(b.max[0]).toBeCloseTo(0.05, 6);
        expect(b.max[1]).toBeCloseTo(0.05, 6);
    });

    it("smoothLathe writes outward normals on a cylinder", () => {
        const p = smoothLathe(
            [
                [0.05, 0],
                [0.05, 0.3],
            ],
            12,
            PART_METAL,
        );
        for (let i = 0; i < p.positions.length / 3; i++) {
            const x = p.positions[i * 3];
            const z = p.positions[i * 3 + 2];
            const nx = p.normals[i * 3];
            const nz = p.normals[i * 3 + 2];
            if (Math.hypot(x, z) > 1e-6)
                expect(nx * x + nz * z).toBeGreaterThan(0);
        }
    });

    it("arc runs a quarter circle about an axis", () => {
        const pts = arc([0, 0, 0], 1, 0, 90, 4, "x");
        expect(pts.length).toBe(5);
        expect(pts[0][1]).toBeCloseTo(1, 9); // starts at +Y
        expect(pts[4][2]).toBeCloseTo(1, 9); // ends at +Z
        for (const q of pts) expect(Math.hypot(q[1], q[2])).toBeCloseTo(1, 9);
    });

    it("bellProfile flares monotonically to the rim", () => {
        const prof = bellProfile(0.01, 0.1, 0.3, 14);
        expect(prof[0][0]).toBeCloseTo(0.01, 9);
        // the flare itself ends at the length; the rim bead follows it
        expect(prof[14][1]).toBeCloseTo(0.3, 9);
        expect(prof[14][0]).toBeCloseTo(0.1, 9);
        let r = 0;
        for (const [ri] of prof.slice(0, 15)) {
            expect(ri).toBeGreaterThanOrEqual(r - 1e-9);
            r = ri;
        }
        expect(prof.length).toBeGreaterThan(15);
    });

    it("colorPieces writes one color per vertex", () => {
        const p = cylinder(0.01, [0, 0, 0], [0, 0.1, 0], 6, PART_METAL);
        const [c] = colorPieces([p], (part) =>
            part === PART_METAL ? 0xd9ad4f : 0,
        );
        expect(c.colors!.length).toBe(p.positions.length);
        // linear, as three's vertex colors are: sRGB 0xd9 -> 0.694
        expect(c.colors![0]).toBeCloseTo(
            ((0xd9 / 255 + 0.055) / 1.055) ** 2.4,
            9,
        );
    });
});

describe("frameAt", () => {
    it("turns +Y to the given normal and +Z toward the given heading, then moves to the origin", () => {
        const m = frameAt([1, 2, 3], [0, 0, 2], [0, -1, 0.5]);
        const p = transformPiece(
            {
                part: PART_METAL,
                positions: [0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0],
                normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
                indices: [],
            },
            m,
        );
        const v = (i: number) => p.positions.slice(i * 3, i * 3 + 3);
        const close = (a: number[], b: number[]) =>
            a.forEach((x, k) => expect(x).toBeCloseTo(b[k], 6));
        close(v(0), [1, 2, 3]);
        close(v(1), [1, 2, 4]); // +Y onto the unit normal
        close(v(2), [1, 1, 3]); // +Z toward the heading, made perpendicular
        close(v(3), [2, 2, 3]); // +X = Y × Z, right-handed
        close(p.normals.slice(0, 3), [0, 0, 1]);
    });

    it("picks a heading when the one given is parallel to the normal", () => {
        const m = frameAt([0, 0, 0], [0, 0, 1], [0, 0, 1]);
        const z = [m[8], m[9], m[10]];
        expect(Math.hypot(z[0], z[1], z[2])).toBeCloseTo(1, 6);
        expect(z[2]).toBeCloseTo(0, 6);
    });
});

describe("smoothTube end tangents", () => {
    it("squares its end rings to the tangents it is given", () => {
        // a quarter arc split in two: both halves end on the same ring plane
        const path = arc([0, 0, 0], 1, 0, 90, 4, "y");
        const tangentAt = (deg: number): [number, number, number] => {
            const a = (deg * Math.PI) / 180;
            return [Math.cos(a), 0, -Math.sin(a)];
        };
        const half = smoothTube(path.slice(0, 3), 0.1, 8, PART_METAL, {
            capStart: false,
            capEnd: false,
            startTangent: tangentAt(0),
            endTangent: tangentAt(45),
        });
        // the last ring lies in the plane through path[2] normal to the arc's tangent there
        const t = tangentAt(45);
        const c = path[2];
        for (let k = 0; k < 8; k++) {
            const i = (2 * 8 + k) * 3;
            const d = [0, 1, 2].map((j) => half.positions[i + j] - c[j]);
            expect(d[0] * t[0] + d[1] * t[1] + d[2] * t[2]).toBeCloseTo(0, 6);
            expect(Math.hypot(d[0], d[1], d[2])).toBeCloseTo(0.1, 6);
        }
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { blockKind, type BlockParams } from "../../kinds/block";
import { boxTool } from "../../box/boxTool";
import type { BoxParams } from "../../box/boxGeometry";
import { filesDistribution, rankOffset, type Fraction } from "../distribution";
import { distribute } from "../distribute";
import { rectRegion } from "../region";
import type { ShapeContext } from "../../types";

/**
 * The host's distributor (#386, spec #385), driven with the box: its Files mode is the box's grid
 * moved out of the box, so every box keeps exactly the spots it had.
 */

const ctx: ShapeContext = { stepPx: 10, snapPoint: (p) => p };

/** A box as recipes stored it before the distributor: `pattern: "grid"`, no distribution */
const oldBox = (files: number, over: Partial<BlockParams> = {}): BoxParams =>
    ({
        center: { x: 120, y: 85 },
        rotation: 0,
        files,
        across: 20,
        deep: 15,
        pattern: "grid",
        shortRank: "center",
        shortRankAt: "back",
        ...over,
    }) as BoxParams;

/** Where each spot is, to a billionth (and no −0) */
const xyOf = (spots: readonly { x: number; y: number }[]) =>
    spots.map((s) => [round(s.x), round(s.y)]);
const round = (v: number) => Math.round(v * 1e9) / 1e9 || 0;

describe("Files mode keeps today's box", () => {
    /**
     * The scripted parity check (#386 acceptance): every count from 1 to 120, every file count
     * from 1 to the count, square, turned and flipped, against the block generator the box used
     * until now. Old recipes (no distribution) and new ones (an explicit Files distribution) both.
     */
    it("matches the block generator for every count and file count", () => {
        const poses: Partial<BlockParams>[] = [
            {},
            { rotation: Math.PI / 2 },
            { rotation: 0.7, flipX: true },
            { rotation: -2.1, flipY: true, flipX: true },
        ];
        let boxes = 0;
        let spots = 0;
        let mismatches = 0;
        for (let n = 1; n <= 120; n++) {
            for (let files = 1; files <= n; files++) {
                for (const pose of poses) {
                    const old = oldBox(files, pose);
                    const today = blockKind.generate(
                        old as BlockParams,
                        n,
                        ctx,
                    );
                    const fresh: BoxParams = {
                        ...old,
                        pattern: undefined,
                        shortRank: undefined,
                        shortRankAt: undefined,
                        distribution: filesDistribution(files),
                    };
                    for (const params of [old, fresh]) {
                        const now = boxTool.shape.generate(params, n, ctx);
                        boxes++;
                        spots += now.length;
                        if (JSON.stringify(now) !== JSON.stringify(today))
                            mismatches++;
                    }
                }
            }
        }
        expect({ boxes, spots, mismatches }).toEqual({
            boxes: 58080,
            spots: 4665760,
            mismatches: 0,
        });
    });

    it("lays out 7 in 3 files with the short rank at the back, centered", () => {
        const spots = distribute({
            region: rectRegion(10, 20),
            n: 7,
            distribution: filesDistribution(3),
            across: 10,
            deep: 20,
        });
        expect(spots).toEqual([
            { x: 0, y: -20, row: 0, col: 1 },
            { x: -10, y: 0, row: 1, col: 0 },
            { x: 0, y: 0, row: 1, col: 1 },
            { x: 10, y: 0, row: 1, col: 2 },
            { x: -10, y: 20, row: 2, col: 0 },
            { x: 0, y: 20, row: 2, col: 1 },
            { x: 10, y: 20, row: 2, col: 2 },
        ]);
    });

    it("puts an even short rank half an interval in, between the files", () => {
        const spots = distribute({
            region: rectRegion(15, 5),
            n: 6,
            distribution: filesDistribution(4),
            across: 10,
            deep: 10,
        });
        expect(xyOf(spots.slice(0, 2))).toEqual([
            [-5, -5],
            [5, -5],
        ]);
    });
});

describe("the signed stagger offset", () => {
    const offsets = (s: Fraction, ranks = 7) =>
        Array.from({ length: ranks }, (_, r) => rankOffset(r, s));

    it("moves each rank going back r·s, wrapped to ±½", () => {
        expect(offsets([1, 3])).toEqual([
            0,
            1 / 3,
            -1 / 3,
            0,
            1 / 3,
            -1 / 3,
            0,
        ]);
        expect(offsets([-1, 3])).toEqual([
            0,
            -1 / 3,
            1 / 3,
            0,
            -1 / 3,
            1 / 3,
            0,
        ]);
        expect(offsets([1, 4])).toEqual([0, 0.25, 0.5, -0.25, 0, 0.25, 0.5]);
        expect(offsets([1, 6], 4)).toEqual([0, 1 / 6, 1 / 3, 0.5]);
    });

    it("keeps its sign at exactly ±½", () => {
        expect(offsets([1, 2], 4)).toEqual([0, 0.5, 0, 0.5]);
        expect(offsets([-1, 2], 4)).toEqual([0, -0.5, 0, -0.5]);
        expect(offsets([-1, 4], 3)).toEqual([0, -0.25, -0.5]);
    });

    it("never moves a rank more than half an interval", () => {
        for (let q = 1; q <= 12; q++)
            for (let p = -q; p <= q; p++)
                for (const off of offsets([p, q], 30))
                    expect(Math.abs(off)).toBeLessThanOrEqual(0.5);
    });

    it("lays the ranks out toward the audience's right for +", () => {
        // 3 ranks of 2, stagger ⅓: the front rank stays, the middle one goes ⅓ right, the back
        // one ⅓ left
        const spots = distribute({
            region: rectRegion(15, 15),
            n: 6,
            distribution: { ...filesDistribution(2), stagger: [1, 3] },
            across: 30,
            deep: 15,
        });
        expect(xyOf(spots)).toEqual([
            [-25, -15],
            [5, -15],
            [-5, 0],
            [25, 0],
            [-15, 15],
            [15, 15],
        ]);
    });

    it("staggers a box the same way, turned with it", () => {
        const box: BoxParams = {
            center: { x: 0, y: 0 },
            rotation: Math.PI,
            files: 2,
            across: 30,
            deep: 15,
            distribution: { ...filesDistribution(2), stagger: [1, 2] },
        };
        const spots = boxTool.shape.generate(box, 4, ctx);
        // Turned half round: the back rank, half an interval to the box's right, is now in
        // front and to the field's left
        expect(xyOf(spots)).toEqual([
            [0, 7.5],
            [-30, 7.5],
            [15, -7.5],
            [-15, -7.5],
        ]);
    });
});

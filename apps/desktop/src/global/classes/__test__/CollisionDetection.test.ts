// @vitest-environment node
import { describe, expect, it } from "vitest";
import type Beat from "@/global/classes/Beat";
import type { PositionSource } from "@/timeline/positionBuffer";
import {
    COLLISION_RADIUS,
    collisionWindow,
    detectCollisions,
} from "../CollisionDetection";

type XY = { x: number; y: number };

/**
 * A stand-in resolver: each marcher moves in a straight line between its positions at whole
 * beats, and holds before the first and after the last.
 */
function source(
    paths: Record<number, XY[]>,
): PositionSource & { calls: number[] } {
    const ids = Object.keys(paths)
        .map(Number)
        .sort((a, b) => a - b);
    const calls: number[] = [];
    return {
        calls,
        marcherIds: () => ids,
        positionsAt(beat, out) {
            calls.push(beat);
            ids.forEach((id, i) => {
                const path = paths[id]!;
                const b = Math.min(Math.max(beat, 0), path.length - 1);
                const lo = Math.floor(b);
                const hi = Math.min(lo + 1, path.length - 1);
                const t = b - lo;
                out[2 * i] = path[lo]!.x + (path[hi]!.x - path[lo]!.x) * t;
                out[2 * i + 1] = path[lo]!.y + (path[hi]!.y - path[lo]!.y) * t;
            });
            return true;
        },
    };
}

const at = (x: number, y: number): XY => ({ x, y });
const noLabels = new Map<number, string>();

describe("detectCollisions", () => {
    it("finds two marchers standing on the same spot", () => {
        const found = detectCollisions(
            source({ 1: [at(50, 50)], 2: [at(50, 50)], 3: [at(200, 50)] }),
            0,
            0,
            new Map([
                [1, "T1"],
                [2, "T2"],
            ]),
        );
        expect(found).toEqual([
            {
                marcher1Id: 1,
                marcher2Id: 2,
                label: "T1, T2",
                x: 50,
                y: 50,
                distance: 0,
            },
        ]);
    });

    it("finds nothing when everyone keeps the radius apart", () => {
        const step = COLLISION_RADIUS + 0.5;
        const paths: Record<number, XY[]> = {};
        for (let i = 0; i < 50; i++)
            paths[i + 1] = [
                at((i % 10) * step, Math.floor(i / 10) * step),
                at((i % 10) * step + 30, Math.floor(i / 10) * step + 30),
            ];
        expect(detectCollisions(source(paths), 0, 1, noLabels)).toEqual([]);
    });

    it("counts a pair exactly the radius apart, and reports where they are", () => {
        const found = detectCollisions(
            source({ 4: [at(0, 0)], 9: [at(6, 8)] }),
            0,
            0,
            noLabels,
        );
        expect(found).toEqual([
            {
                marcher1Id: 4,
                marcher2Id: 9,
                label: "4, 9",
                x: 3,
                y: 4,
                distance: COLLISION_RADIUS,
            },
        ]);
    });

    it("catches two fast marchers passing through each other between beats", () => {
        // They swap places 200 units apart in one beat, and are never close on a whole beat
        const found = detectCollisions(
            source({
                1: [at(0, 0), at(200, 3)],
                2: [at(200, 0), at(0, 3)],
            }),
            0,
            1,
            noLabels,
        );
        expect(found).toHaveLength(1);
        expect(found[0]!.distance).toBeLessThanOrEqual(COLLISION_RADIUS);
        expect(Math.abs(found[0]!.x - 100)).toBeLessThanOrEqual(
            COLLISION_RADIUS,
        );
    });

    it("reports a pair once, where it first collides", () => {
        // Together from beat 1 to beat 3
        const found = detectCollisions(
            source({
                1: [at(0, 0), at(0, 0), at(0, 0), at(0, 0)],
                2: [at(100, 0), at(5, 0), at(0, 0), at(5, 0)],
            }),
            0,
            3,
            noLabels,
        );
        expect(found).toHaveLength(1);
        expect(found[0]!.x).toBeCloseTo(5, 5);
        expect(found[0]!.distance).toBeLessThanOrEqual(COLLISION_RADIUS);
    });

    it("only checks the beats asked for", () => {
        // Together at beat 3 only
        const paths = {
            1: [at(0, 0), at(0, 0), at(0, 0), at(0, 0)],
            2: [at(100, 0), at(100, 0), at(100, 0), at(0, 0)],
        };
        expect(detectCollisions(source(paths), 0, 2, noLabels)).toEqual([]);
        expect(detectCollisions(source(paths), 2, 3, noLabels)).toHaveLength(1);
    });

    it("samples a still beat once, and a busy one more finely", () => {
        const still = source({ 1: [at(0, 0), at(0, 0)], 2: [at(50, 0)] });
        detectCollisions(still, 0, 1, noLabels);
        expect(still.calls).toEqual([0, 1]);

        // 20 units in a beat: no one moves more than half the radius between samples
        const busy = source({ 1: [at(0, 0), at(20, 0)], 2: [at(50, 0)] });
        detectCollisions(busy, 0, 1, noLabels);
        expect(busy.calls).toEqual([0, 1, 0.25, 0.5, 0.75]);
    });

    it("finds nothing when the resolver isn't ready", () => {
        const notReady: PositionSource = {
            marcherIds: () => [1, 2],
            positionsAt: () => false,
        };
        expect(detectCollisions(notReady, 0, 4, noLabels)).toEqual([]);
    });

    it("costs little on a 2,000-marcher block", () => {
        // A 40 × 50 block two radii apart, all moving 16 units a beat for 16 beats
        const paths: Record<number, XY[]> = {};
        for (let i = 0; i < 2000; i++) {
            const x = (i % 40) * 2 * COLLISION_RADIUS;
            const y = Math.floor(i / 40) * 2 * COLLISION_RADIUS;
            paths[i + 1] = Array.from({ length: 17 }, (_, b) =>
                at(x + 16 * b, y),
            );
        }
        const start = performance.now();
        expect(detectCollisions(source(paths), 0, 16, noLabels)).toEqual([]);
        // Generous: CI machines vary. Measured on a production build in the PR.
        expect(performance.now() - start).toBeLessThan(2000);
    });
});

const beats = (...indexes: number[]) =>
    indexes.map((index) => ({ index }) as Beat);

describe("collisionWindow", () => {
    const pages = [
        { id: 10, beats: beats(0), nextPageId: 11 },
        { id: 11, beats: beats(1, 2, 3, 4), nextPageId: 12 },
        { id: 12, beats: beats(5, 6), nextPageId: null },
    ];

    it("runs from the selected page's positions through the move to the next page", () => {
        expect(collisionWindow(pages[0]!, pages)).toEqual({
            fromBeat: 1,
            toBeat: 5,
        });
        expect(collisionWindow(pages[1]!, pages)).toEqual({
            fromBeat: 5,
            toBeat: 7,
        });
    });

    it("is only the last page's positions on the last page", () => {
        expect(collisionWindow(pages[2]!, pages)).toEqual({
            fromBeat: 7,
            toBeat: 7,
        });
    });
});

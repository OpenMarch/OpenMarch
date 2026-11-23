import { describe, expect, it } from "vitest";
import {
    isTilt,
    sameTilt,
    tiltQuaternion,
    tipped,
    UPRIGHT,
    type Tilt,
} from "../orientation";
import type { Turn } from "../types";

/** Where a file axis ends up after the tilt and then the turn, as the import applies them */
function placed(tilt: Tilt, turn: Turn, axis: [number, number, number]) {
    const c = Math.round(Math.cos((turn * Math.PI) / 180));
    const s = Math.round(Math.sin((turn * Math.PI) / 180));
    const t = [0, 1, 2].map(
        (row) =>
            tilt[row * 3] * axis[0] +
            tilt[row * 3 + 1] * axis[1] +
            tilt[row * 3 + 2] * axis[2],
    );
    return [c * t[0] + s * t[2], t[1], -s * t[0] + c * t[2]].map((v) =>
        v === 0 ? 0 : v,
    );
}

/** Rotates a vector by a quaternion */
function rotate(q: number[], v: number[]) {
    const [x, y, z, w] = q;
    const u = [x, y, z];
    const cross = (a: number[], b: number[]) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
    const t = cross(u, v).map((n) => 2 * n);
    const ut = cross(u, t);
    return v.map((n, i) => n + w * t[i] + ut[i]);
}

const UP: [number, number, number] = [0, 1, 0];
const FRONT: [number, number, number] = [0, 0, 1];

describe("tipping a model on the review", () => {
    it("brings its top toward the audience with Rotate X", () => {
        const tilt = tipped(UPRIGHT, 0, "x");
        expect(placed(tilt, 0, UP)).toEqual([0, 0, 1]);
    });

    it("lays its top to the right with Rotate Z", () => {
        const tilt = tipped(UPRIGHT, 0, "z");
        expect(placed(tilt, 0, UP)).toEqual([1, 0, 0]);
    });

    it("tips the same way on screen whatever the turn", () => {
        for (const turn of [0, 90, 180, 270] as Turn[]) {
            const forward = tipped(UPRIGHT, turn, "x");
            expect(placed(forward, turn, UP)).toEqual([0, 0, 1]);
            const sideways = tipped(UPRIGHT, turn, "z");
            expect(placed(sideways, turn, UP)).toEqual([1, 0, 0]);
        }
    });

    it("comes back upright after four tips the same way", () => {
        let tilt = UPRIGHT;
        for (let i = 0; i < 4; i++) tilt = tipped(tilt, 90, "z");
        expect(sameTilt(tilt, UPRIGHT)).toBe(true);
    });

    it("keeps the front where it was when tipping forward", () => {
        // Rotate X turns about the left-right axis: what faced right still faces right
        const tilt = tipped(UPRIGHT, 0, "x");
        expect(placed(tilt, 0, [1, 0, 0])).toEqual([1, 0, 0]);
        expect(placed(tilt, 0, FRONT)).toEqual([0, -1, 0]);
    });

    it("reaches all 24 ways a box can sit", () => {
        const seen = new Map<string, Tilt>();
        const queue: Tilt[] = [UPRIGHT];
        while (queue.length) {
            const tilt = queue.pop()!;
            const key = tilt.join(",");
            if (seen.has(key)) continue;
            seen.set(key, tilt);
            queue.push(tipped(tilt, 0, "x"), tipped(tilt, 0, "z"));
        }
        expect(seen.size).toBe(24);
        for (const tilt of seen.values()) expect(isTilt(tilt)).toBe(true);
    });
});

describe("tilt values", () => {
    it("refuses what isn't a quarter-turn rotation", () => {
        expect(isTilt(UPRIGHT)).toBe(true);
        expect(isTilt([1, 0, 0, 0, 1, 0, 0, 0, -1])).toBe(false); // mirrored
        expect(isTilt([1, 1, 0, 0, 1, 0, 0, 0, 1])).toBe(false);
        expect(isTilt([0.5, 0, 0, 0, 1, 0, 0, 0, 1])).toBe(false);
        expect(isTilt([1, 0, 0])).toBe(false);
        expect(isTilt("upright")).toBe(false);
    });

    it("turns into the quaternion that rotates the same way", () => {
        const seen: Tilt[] = [UPRIGHT];
        for (let i = 0; i < 6; i++)
            seen.push(tipped(seen.at(-1)!, 0, i % 2 ? "x" : "z"));
        for (const tilt of seen)
            for (const axis of [[1, 0, 0], [0, 1, 0], FRONT] as [
                number,
                number,
                number,
            ][]) {
                const byMatrix = placed(tilt, 0, axis);
                const byQuat = rotate(tiltQuaternion(tilt), axis);
                byQuat.forEach((v, i) => expect(v).toBeCloseTo(byMatrix[i]));
            }
    });
});

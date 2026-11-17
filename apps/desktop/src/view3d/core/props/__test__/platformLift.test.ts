import { describe, expect, it } from "vitest";
import type { ItemGeometry } from "@openmarch/core";
import type { PropSolid } from "../propLayout";
import { propsAt, type PropInput } from "../propLayout";
import {
    PODIUM_REACH,
    liftAt,
    liftPlatforms,
    liftPodiums,
    writeLifts,
    writeOnPodiums,
    writePodiumStands,
} from "../platformLift";

const square = (
    id: number,
    cx: number,
    half: number,
    base: number,
    height: number,
    surface: PropSolid["surface"] = "platform",
): PropSolid => ({
    id,
    surface,
    center: { x: cx, z: 0 },
    base,
    height,
    outline: [
        { x: cx - half, z: -half },
        { x: cx + half, z: -half },
        { x: cx + half, z: half },
        { x: cx - half, z: half },
    ],
    closed: true,
    geometry: {} as ItemGeometry,
});

/** Half a count at 8 to 5: half of a 22.5 in step */
const RAMP = 0.2858;

describe("liftAt", () => {
    const platforms = liftPlatforms([
        square(1, 0, 2, 0, 0.6),
        square(2, 0, 1, 0.6, 0.4),
    ]);

    it("is the top of the tallest platform under the dot, away from its edges", () => {
        expect(liftAt(platforms, 0, 0, RAMP)).toBeCloseTo(1);
        expect(liftAt(platforms, 1.5, 0, RAMP)).toBeCloseTo(0.6);
        expect(liftAt(platforms, 5, 0, RAMP)).toBe(0);
    });

    it("steps up across an edge over the ramp, halfway on the edge", () => {
        expect(liftAt(platforms, 2, 0, RAMP)).toBeCloseTo(0.3);
        expect(liftAt(platforms, 2 + RAMP / 2, 0, RAMP)).toBeCloseTo(0);
        expect(liftAt(platforms, 2 - RAMP / 2, 0, RAMP)).toBeCloseTo(0.6);
        const quarter = liftAt(platforms, 2 + RAMP / 4, 0, RAMP);
        expect(quarter).toBeGreaterThan(0);
        expect(quarter).toBeLessThan(0.3);
    });

    it("steps from one platform onto the one stacked on it", () => {
        expect(liftAt(platforms, 1, 0, RAMP)).toBeCloseTo(0.8);
    });

    it("never stands a performer on an obstacle or a Floor prop", () => {
        const others = liftPlatforms([
            square(3, 0, 2, 0, 2, "obstacle"),
            square(4, 10, 2, 0, 0, "floor"),
        ]);
        expect(liftAt(others, 0, 0, RAMP)).toBe(0);
        expect(liftAt(others, 10, 0, RAMP)).toBe(0);
    });
});

describe("writeLifts", () => {
    it("writes each placed performer's lift, and 0 for the rest", () => {
        const platforms = liftPlatforms([square(1, 0, 2, 0, 0.6)]);
        const xz = new Float32Array([0, 0, 5, 0, 0, 0]);
        const placed = new Uint8Array([1, 1, 0]);
        const out = new Float32Array(3).fill(9);
        writeLifts(platforms, xz, placed, RAMP, out);
        expect([...out].map((v) => +v.toFixed(3))).toEqual([0.6, 0, 0]);
    });
});

describe("writePodiumStands", () => {
    const CENTER = -21.3;
    /** A 1.2 m square podium centered at (cx, cz), standing at `top` on `base` */
    const podium = (
        id: number,
        cx: number,
        cz: number,
        top = 0.426,
        base = 0,
        standPoint?: { x: number; z: number },
    ): PropSolid => ({
        ...square(id, cx, 0.6, base, top),
        center: { x: cx, z: cz },
        outline: [
            { x: cx - 0.6, z: cz - 0.6 },
            { x: cx + 0.6, z: cz - 0.6 },
            { x: cx + 0.6, z: cz + 0.6 },
            { x: cx - 0.6, z: cz + 0.6 },
        ],
        facesAcross: true,
        ...(standPoint ? { standPoint } : {}),
    });

    /** Stands one placed performer at (x, z) after the ramped lift; returns where they end up. */
    const standAt = (solids: PropSolid[], x: number, z: number) => {
        const xz = new Float32Array([x, z]);
        const placed = new Uint8Array([1]);
        const lift = new Float32Array(1);
        const headings = new Float32Array([0.3]);
        writeLifts(liftPlatforms(solids), xz, placed, RAMP, lift);
        writePodiumStands(
            liftPodiums(solids),
            xz,
            placed,
            CENTER,
            lift,
            headings,
        );
        return { x: xz[0], z: xz[1], lift: lift[0], heading: headings[0] };
    };

    it("stands a performer whose dot is at the center on the deck, facing the band", () => {
        const at = standAt([podium(1, 0, 5)], 0, 5);
        expect(at.x).toBe(0);
        expect(at.z).toBe(5);
        expect(at.lift).toBe(Math.fround(0.426));
        expect(at.heading).toBeCloseTo(Math.PI);
    });

    it("snaps a dot near the edge inside to the stand point at full height, with no ramp", () => {
        const at = standAt([podium(1, 0, 5)], 0.55, 5.5);
        expect([at.x, at.z]).toEqual([0, 5]);
        expect(at.lift).toBe(Math.fround(0.426));
    });

    it("snaps a dot just outside, within a foot, onto the podium", () => {
        const at = standAt([podium(1, 0, 5)], 0.6 + PODIUM_REACH - 0.01, 5);
        expect([at.x, at.z]).toEqual([0, 5]);
        expect(at.lift).toBe(Math.fround(0.426));
        expect(at.heading).toBeCloseTo(Math.PI);
    });

    it("leaves a dot more than a foot outside on the ground, where it is", () => {
        const x = 0.6 + PODIUM_REACH + 0.01;
        const at = standAt([podium(1, 0, 5)], x, 5);
        expect(at.x).toBe(Math.fround(x));
        expect(at.z).toBe(5);
        expect(at.lift).toBe(0);
        expect(at.heading).toBeCloseTo(0.3);
    });

    it("lifts exactly to the podium's base plus its standing height", () => {
        // a podium standing on a 0.6 m riser
        const riser = square(2, 0, 3, 0, 0.6);
        const at = standAt(
            [riser, { ...podium(1, 0, 0, 1.8288, 0.6) }],
            0.5,
            0.5,
        );
        expect(at.lift).toBe(Math.fround(0.6 + 1.8288));
        expect([at.x, at.z]).toEqual([0, 0]);
    });

    it("faces a performer on a podium behind the field toward the audience", () => {
        expect(standAt([podium(1, 0, -48)], 0, -48).heading).toBe(0);
    });

    it("stands a performer between two podiums on the one whose stand point is nearest", () => {
        const solids = [podium(1, 0, 5), podium(2, 1.4, 5)];
        expect(standAt(solids, 0.65, 5).x).toBe(0);
        expect(standAt(solids, 0.75, 5).x).toBe(Math.fround(1.4));
    });

    it("stands a performer on a turned stepladder's step, off its center", () => {
        // The stepladder's step is 0.2 m toward the audience in its own axes; turned 90° the
        // model's +Z turns toward world -X (`writePitModelMatrix`)
        const ladder: PropInput = {
            id: 1,
            surface: "platform",
            changes: [
                {
                    beat: 0,
                    outlineType: "rectangle",
                    width: 0.61,
                    depth: 0.97,
                    height: 0,
                    rotation: 90,
                    customOutline: null,
                    transitionLength: 1,
                    rollsOut: false,
                    leadingEdge: null,
                },
            ],
            standTop: 1.2192,
            facesAcross: true,
            standAt: { x: 0, z: 0.2 },
        };
        const solids = propsAt([ladder], 0, () => ({ x: 10, z: 5 }));
        expect(solids).toHaveLength(1);
        expect(solids[0].standPoint!.x).toBeCloseTo(9.8);
        expect(solids[0].standPoint!.z).toBeCloseTo(5);
        const at = standAt(solids, 10.3, 5.1);
        expect(at.x).toBeCloseTo(9.8);
        expect(at.z).toBeCloseTo(5);
        expect(at.lift).toBe(Math.fround(1.2192));
    });

    it("takes podiums out of the ramp, and leaves a riser's ramp as it was", () => {
        const solids = [podium(1, 0, 5), square(2, 10, 2, 0, 0.6)];
        const platforms = liftPlatforms(solids);
        expect(platforms).toHaveLength(1);
        expect(liftAt(platforms, 0, 5, RAMP)).toBe(0);
        expect(liftAt(platforms, 12, 0, RAMP)).toBeCloseTo(0.3);
        expect(standAt(solids, 12, 0).lift).toBeCloseTo(0.3);
        expect(standAt(solids, 12, 0).x).toBe(12);
    });

    it("leaves a performer who isn't placed alone", () => {
        const xz = new Float32Array([0, 5]);
        const lift = new Float32Array([0]);
        const headings = new Float32Array([0.3]);
        writePodiumStands(
            liftPodiums([podium(1, 0, 5)]),
            xz,
            new Uint8Array([0]),
            CENTER,
            lift,
            headings,
        );
        expect([...xz, ...lift]).toEqual([0, 5, 0]);
        expect(headings[0]).toBeCloseTo(0.3);
    });

    it("marks who stands on a podium, as the stands put them there", () => {
        const podiums = liftPodiums([podium(1, 0, 5)]);
        const outside = 0.6 + PODIUM_REACH + 0.01;
        const xz = new Float32Array([
            0,
            5, // on it
            0.6 + PODIUM_REACH - 0.01,
            5, // within a foot
            outside,
            5, // more than a foot outside
            0,
            5, // on it, not placed
        ]);
        const out = new Uint8Array(4).fill(7);
        writeOnPodiums(podiums, xz, new Uint8Array([1, 1, 1, 0]), out);
        expect([...out]).toEqual([1, 1, 0, 0]);
        writeOnPodiums([], xz, new Uint8Array([1, 1, 1, 1]), out);
        expect([...out]).toEqual([0, 0, 0, 0]);
    });
});

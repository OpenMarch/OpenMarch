import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { RigController } from "../rigController";
import {
    DEFAULT_NEAR,
    MAX_PAN,
    MAX_RADIUS,
    MIN_EYE_Y,
    MIN_ZOOM_DISTANCE,
} from "../rigMath";

function rigAt(
    position: [number, number, number],
    target: [number, number, number],
) {
    const camera = new PerspectiveCamera(45, 1.6, 0.1, 5000);
    const rig = new RigController(camera);
    rig.jumpTo(position, target);
    rig.update(0);
    return { camera, rig };
}

describe("smoothed wheel zoom toward a point", () => {
    it("eases into the zoom over a few frames instead of jumping", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        const r0 = rig.spherical.radius;
        expect(rig.zoomWheelAt(-200, null, 0)).toBe(true);
        rig.update(16);
        const r1 = rig.spherical.radius;
        expect(r1).toBeLessThan(r0);
        for (let t = 32; t <= 1000; t += 16) rig.update(t);
        const rEnd = rig.spherical.radius;
        expect(rEnd).toBeLessThan(r1);
        // the whole step lands: the same total as an immediate zoom
        expect(rEnd).toBeCloseTo(r0 * Math.exp(-200 * 0.0012), 3);
    });

    it("keeps the point under the cursor by moving the target toward it", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        rig.zoomWheelAt(-400, [20, 0, -10], 0);
        for (let t = 16; t <= 1000; t += 16) rig.update(t);
        const k = 1 - Math.exp(-400 * 0.0012);
        expect(rig.target[0]).toBeCloseTo(20 * k, 3);
        expect(rig.target[2]).toBeCloseTo(-10 * k, 3);
    });

    it("doesn't zoom past the closest distance to the point", () => {
        const { camera, rig } = rigAt([0, 3, 3], [0, 0, 0]);
        for (let i = 0; i < 20; i++) rig.zoomWheelAt(-500, [0, 1, 0], i);
        for (let t = 16; t <= 2000; t += 16) rig.update(t);
        const d = camera.position.distanceTo(new Vector3(0, 1, 0));
        expect(d).toBeGreaterThanOrEqual(MIN_ZOOM_DISTANCE - 1e-6);
        expect(d).toBeLessThan(MIN_ZOOM_DISTANCE + 0.05);
    });
});

/** Where `p` lands on screen (normalized device coordinates). */
function ndc(camera: PerspectiveCamera, p: [number, number, number]) {
    camera.updateMatrixWorld();
    const v = new Vector3(...p).project(camera);
    return [v.x, v.y];
}

describe("zooming about the point under the cursor, as CAD tools do", () => {
    it("keeps a point at any height fixed on screen and the view's angle unchanged", () => {
        const { camera, rig } = rigAt([0, 60, 80], [0, 0, 0]);
        const head: [number, number, number] = [12, 1.7, -5];
        const before = ndc(camera, head);
        const look = camera.getWorldDirection(new Vector3());
        for (const ratio of [0.5, 0.3, 0.6, 1.8])
            expect(rig.zoomRatioAt(ratio, head)).toBe(true);
        rig.update(16);
        const after = ndc(camera, head);
        expect(after[0]).toBeCloseTo(before[0], 6);
        expect(after[1]).toBeCloseTo(before[1], 6);
        expect(camera.getWorldDirection(new Vector3()).dot(look)).toBeCloseTo(
            1,
            9,
        );
    });

    it("zooms right up to a marcher, 0.3 m short of the point", () => {
        const { camera, rig } = rigAt([0, 60, 80], [0, 0, 0]);
        const head: [number, number, number] = [12, 1.7, -5];
        for (let i = 0; i < 60; i++) rig.zoomRatioAt(0.6, head);
        rig.update(16);
        const d = camera.position.distanceTo(new Vector3(...head));
        expect(d).toBeCloseTo(MIN_ZOOM_DISTANCE, 6);
        // the orbit center comes with it, so orbiting now turns about the marcher
        expect(
            new Vector3(...rig.target).distanceTo(new Vector3(...head)),
        ).toBeLessThan(0.05);
    });

    it("pulls the near plane in up close so the point isn't clipped, and back out after", () => {
        const { camera, rig } = rigAt([0, 60, 80], [0, 0, 0]);
        const head: [number, number, number] = [12, 1.7, -5];
        for (let i = 0; i < 60; i++) rig.zoomRatioAt(0.6, head);
        rig.update(16);
        expect(camera.near).toBeLessThanOrEqual(MIN_ZOOM_DISTANCE / 3);
        for (let i = 0; i < 60; i++) rig.zoomRatioAt(1.6, head);
        rig.update(32);
        expect(camera.near).toBeCloseTo(DEFAULT_NEAR, 6);
    });

    it("keeps the point fixed while the wheel zoom eases in", () => {
        const { camera, rig } = rigAt([0, 60, 80], [0, 0, 0]);
        const p: [number, number, number] = [-15, 0.9, 10];
        const before = ndc(camera, p);
        rig.zoomWheelAt(-300, p, 0);
        for (let t = 16; t <= 200; t += 16) {
            rig.update(t);
            const now = ndc(camera, p);
            expect(now[0]).toBeCloseTo(before[0], 6);
            expect(now[1]).toBeCloseTo(before[1], 6);
        }
    });

    it("stops before the eye drops below the minimum height", () => {
        const { camera, rig } = rigAt([0, 2, 30], [0, 0, 0]);
        for (let i = 0; i < 80; i++) rig.zoomRatioAt(0.6, [0, 0, -20]);
        rig.update(16);
        expect(camera.position.y).toBeGreaterThanOrEqual(MIN_EYE_Y - 1e-6);
    });

    it("zooms out no further than the farthest radius", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        for (let i = 0; i < 80; i++) rig.zoomRatioAt(1.5, [5, 0, 5]);
        expect(rig.spherical.radius).toBeLessThanOrEqual(MAX_RADIUS + 1e-6);
    });
});

describe("pinch zoom toward a point", () => {
    it("zooms at once and moves the target toward the point", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        const r0 = rig.spherical.radius;
        expect(rig.zoomRatioAt(0.5, [10, 0, 0])).toBe(true);
        expect(rig.spherical.radius).toBeCloseTo(r0 * 0.5, 6);
        expect(rig.target[0]).toBeCloseTo(5, 6);
    });
});

describe("flung orbit", () => {
    it("keeps turning after release and coasts to a stop", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        let t = 0;
        for (let i = 0; i < 6; i++) {
            t += 16;
            rig.orbitDrag(12, 0, t);
            rig.update(t);
        }
        const atRelease = rig.spherical.theta;
        rig.release(t);
        t += 16;
        rig.update(t);
        const after = rig.spherical.theta;
        expect(after).not.toBeCloseTo(atRelease, 6); // still moving
        expect(Math.sign(after - atRelease)).toBe(-1); // same direction as the drag (theta -= dx)
        for (let i = 0; i < 200; i++) rig.update((t += 16));
        const settled = rig.spherical.theta;
        rig.update(t + 16);
        expect(rig.spherical.theta).toBeCloseTo(settled, 6); // stopped
        expect(Math.abs(settled - atRelease)).toBeLessThan(1); // a coast, not a spin
    });

    it("doesn't coast after a drag that paused before release", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        rig.orbitDrag(30, 0, 16);
        rig.update(16);
        const held = rig.spherical.theta;
        rig.release(400); // held still for most of a second
        rig.update(416);
        expect(rig.spherical.theta).toBeCloseTo(held, 9);
    });

    it("stops coasting when the pointer goes down again", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        for (let t = 16; t <= 96; t += 16) {
            rig.orbitDrag(20, 0, t);
            rig.update(t);
        }
        rig.release(96);
        rig.stopMotion();
        const at = rig.spherical.theta;
        rig.update(112);
        expect(rig.spherical.theta).toBeCloseTo(at, 9);
    });
});

describe("grab pan", () => {
    it("moves the target by the ground distance the pointer slid", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        expect(rig.grabPan([10, 0, 5], [4, 0, 2], [0, 0, 0])).toBe(true);
        expect(rig.target).toEqual([6, 0, 3]);
    });

    it("keeps the target within reach of the focus", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        rig.grabPan([MAX_PAN * 3, 0, 0], [0, 0, 0], [0, 0, 0]);
        expect(Math.hypot(rig.target[0], rig.target[2])).toBeCloseTo(
            MAX_PAN,
            6,
        );
    });
});

describe("input while flying", () => {
    it("ignores the new inputs during a fly-to", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        rig.flyTo([50, 20, 40], [0, 0, 0], { nowMs: 0 });
        expect(rig.zoomWheelAt(-100, null, 0)).toBe(false);
        expect(rig.zoomRatioAt(0.5, null)).toBe(false);
        expect(rig.orbitDrag(10, 0, 0)).toBe(false);
        expect(rig.grabPan([1, 0, 0], [0, 0, 0], [0, 0, 0])).toBe(false);
    });
});

describe("moving", () => {
    it("is true while a zoom eases, a fling coasts or a fly-to runs, and false at rest", () => {
        const { rig } = rigAt([0, 60, 80], [0, 0, 0]);
        expect(rig.moving).toBe(false);
        rig.zoomWheelAt(-200, null, 0);
        expect(rig.moving).toBe(true);
        for (let t = 16; t <= 2000; t += 16) rig.update(t);
        expect(rig.moving).toBe(false);
        let t = 2000;
        for (let i = 0; i < 5; i++) rig.orbitDrag(20, 0, (t += 16));
        rig.release(t);
        expect(rig.moving).toBe(true);
        for (let i = 0; i < 400; i++) rig.update((t += 16));
        expect(rig.moving).toBe(false);
        rig.flyTo([50, 20, 40], [0, 0, 0], { nowMs: t });
        expect(rig.moving).toBe(true);
    });
});

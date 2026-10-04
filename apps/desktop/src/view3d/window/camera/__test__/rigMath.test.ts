import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3, type Vector3Tuple } from "three";
import type { CameraSeat } from "@/view3d/core/types";
import { RigController } from "../rigController";
import {
    ARC_LIFT_MAX,
    arcLift,
    cameraIndexForKey,
    defaultCameraId,
    easeInOutCubic,
    FLY_MS,
    horizontalDistance,
    MAX_PAN,
    MAX_PHI,
    MAX_RADIUS,
    maxPhiAboveGround,
    MIN_EYE_Y,
    MIN_PHI,
    MIN_RADIUS,
    orbitPhi,
    panTarget,
    positionFromSpherical,
    PRESS_BOX_FRONT_NDC_Y,
    PRESS_BOX_MAX_LIFT_DEG,
    pressBoxLiftDeg,
    SEAT_FOV_DEG,
    seatAim,
    sphericalFromPose,
    tiltTargetUp,
    tweenPose,
    zoomRadius,
} from "../rigMath";

const seat = (
    id: string,
    kind: CameraSeat["kind"],
    position: Vector3Tuple,
    target: Vector3Tuple,
): CameraSeat => ({
    id,
    labelKey: `view3d.camera.${id}`,
    kind,
    position,
    target,
});

const near = (a: Vector3Tuple, b: Vector3Tuple, digits = 6) =>
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe("easeInOutCubic", () => {
    it("starts, mids and ends right and is symmetric", () => {
        expect(easeInOutCubic(0)).toBe(0);
        expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
        expect(easeInOutCubic(1)).toBe(1);
        expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1);
        expect(easeInOutCubic(-1)).toBe(0);
        expect(easeInOutCubic(2)).toBe(1);
    });

    it("is slow at the ends", () => {
        expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
        expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
    });
});

describe("tweenPose", () => {
    const tween = {
        fromPosition: [0, 10, 0] as Vector3Tuple,
        fromTarget: [0, 0, 0] as Vector3Tuple,
        toPosition: [100, 10, 0] as Vector3Tuple,
        toTarget: [0, 0, -20] as Vector3Tuple,
        durationMs: FLY_MS,
    };

    it("starts at the source and ends exactly at the destination", () => {
        const start = tweenPose(tween, 0);
        near(start.position, [0, 10, 0]);
        expect(start.done).toBe(false);
        const end = tweenPose(tween, FLY_MS);
        expect(end.position).toEqual([100, 10, 0]);
        expect(end.target).toEqual([0, 0, -20]);
        expect(end.done).toBe(true);
        expect(tweenPose(tween, FLY_MS * 3).done).toBe(true);
    });

    it("lifts the path into an arc that peaks halfway", () => {
        const mid = tweenPose(tween, FLY_MS / 2);
        near(mid.position, [50, 10 + arcLift(100), 0]);
        near(mid.target, [0, 0, -10]);
        const quarter = tweenPose(tween, FLY_MS / 4);
        expect(quarter.position[1]).toBeGreaterThan(10);
        expect(quarter.position[1]).toBeLessThan(mid.position[1]);
    });

    it("keeps the arc small: a quarter of the move, at most 36.6 m", () => {
        expect(arcLift(8)).toBeCloseTo(2);
        expect(arcLift(10_000)).toBe(ARC_LIFT_MAX);
    });

    it("jumps when the duration is zero (reduced motion)", () => {
        const pose = tweenPose({ ...tween, durationMs: 0 }, 0);
        expect(pose.done).toBe(true);
        expect(pose.position).toEqual([100, 10, 0]);
    });
});

describe("spherical pose", () => {
    it("round-trips a pose", () => {
        const target: Vector3Tuple = [3, 1, -20];
        const position: Vector3Tuple = [-40, 30, 25];
        const s = sphericalFromPose(position, target);
        near(positionFromSpherical(s, target), position);
    });

    it("treats straight down as theta 0 (the 2D orientation)", () => {
        const s = sphericalFromPose([0, 100, 0], [0, 0, 0]);
        expect(s.phi).toBe(0);
        expect(s.theta).toBe(0);
    });
});

/** Where a world point lands on screen, in normalized device coordinates. */
function project(camera: PerspectiveCamera, p: Vector3Tuple) {
    const v = new Vector3(...p).project(camera);
    return { x: v.x, y: v.y };
}

describe("top-down orientation", () => {
    const focus: Vector3Tuple = [0, 0, -24.4];
    const topDown = seat("topDown", "topDown", [0, 189, -24.4 + 0.15], focus);

    for (const nudge of [0.15, 0]) {
        it(`puts the front at the bottom and side 1 on the left (nudge ${nudge})`, () => {
            const camera = new PerspectiveCamera(45, 16 / 9, 0.3, 3000);
            const rig = new RigController(camera);
            rig.jumpTo([0, 189, focus[2] + nudge], focus);
            camera.updateMatrixWorld();
            const front = project(camera, [0, 0, 0]);
            const back = project(camera, [0, 0, -48.8]);
            const side1 = project(camera, [-50, 0, focus[2]]);
            const side2 = project(camera, [50, 0, focus[2]]);
            expect(front.y).toBeLessThan(back.y);
            expect(side1.x).toBeLessThan(side2.x);
            expect(Math.abs(front.x)).toBeLessThan(1e-3);
        });
    }

    it("stays oriented after a small orbit nudge toward straight down", () => {
        const camera = new PerspectiveCamera(45, 1, 0.3, 3000);
        const rig = new RigController(camera);
        rig.jumpTo(topDown.position, topDown.target);
        rig.orbit(0, 500); // pushes phi toward 0; clamps at MIN_PHI
        rig.update(0);
        expect(rig.spherical.phi).toBeGreaterThanOrEqual(0);
        const front = project(camera, [0, 0, 0]);
        const side1 = project(camera, [-50, 0, focus[2]]);
        expect(front.y).toBeLessThan(0);
        expect(side1.x).toBeLessThan(0);
    });
});

describe("orbit and zoom limits", () => {
    it("keeps the eye above the ground", () => {
        // Target on the ground: the most phi allows is just below level.
        const maxPhi = maxPhiAboveGround(100, 0);
        const eye = positionFromSpherical(
            { radius: 100, phi: maxPhi, theta: 0 },
            [0, 0, 0],
        );
        expect(eye[1]).toBeGreaterThanOrEqual(MIN_EYE_Y - 1e-9);
        expect(maxPhiAboveGround(100, 50)).toBe(MAX_PHI);
        expect(maxPhiAboveGround(0.1, -5)).toBe(MIN_PHI);
    });

    it("clamps orbit steps, but never pushes a pose already outside further out", () => {
        expect(orbitPhi(1, 10, 1.4)).toBe(1.4);
        expect(orbitPhi(1, -10, 1.4)).toBe(MIN_PHI);
        // A seat looking up (phi past the limit) can come back, not go further.
        expect(orbitPhi(1.7, 0.1, 1.4)).toBe(1.7);
        expect(orbitPhi(1.7, -0.1, 1.4)).toBeCloseTo(1.6);
    });

    it("never orbits below ground", () => {
        const camera = new PerspectiveCamera();
        const rig = new RigController(camera);
        rig.jumpTo([0, 20, 40], [0, 0, 0]);
        for (let i = 0; i < 50; i++) rig.orbit(13, -40);
        rig.update(0);
        expect(camera.position.y).toBeGreaterThanOrEqual(MIN_EYE_Y - 1e-6);
    });

    it("clamps zoom", () => {
        expect(zoomRadius(100, 1e6)).toBe(MAX_RADIUS);
        expect(zoomRadius(100, -1e6)).toBe(MIN_RADIUS);
        expect(zoomRadius(100, 100)).toBeGreaterThan(100);
        expect(zoomRadius(100, -100)).toBeLessThan(100);
    });

    it("ignores input while flying", () => {
        const camera = new PerspectiveCamera();
        const rig = new RigController(camera);
        rig.jumpTo([0, 20, 40], [0, 0, 0]);
        rig.flyTo([50, 20, 40], [0, 0, 0], { nowMs: 0 });
        expect(rig.flying).toBe(true);
        expect(rig.orbit(10, 10)).toBe(false);
        expect(rig.zoomWheel(10)).toBe(false);
        rig.update(FLY_MS);
        expect(rig.flying).toBe(false);
        expect(rig.orbit(10, 10)).toBe(true);
    });
});

describe("panTarget", () => {
    it("moves in the ground plane and follows the pointer", () => {
        const s = { radius: 100, phi: 1, theta: 0 };
        const right = panTarget([0, 0, 0], s, 10, 0, [0, 0, 0]);
        // Dragging right pulls the scene right: the target moves to -X.
        expect(right[0]).toBeLessThan(0);
        expect(right[1]).toBe(0);
        const down = panTarget([0, 0, 0], s, 0, 10, [0, 0, 0]);
        // Dragging down pulls the field toward the viewer: target moves back (-Z).
        expect(down[2]).toBeLessThan(0);
    });

    it("stays near the focus", () => {
        const s = { radius: MAX_RADIUS, phi: 1, theta: 0 };
        const far = panTarget([0, 0, 0], s, 1e6, 0, [0, 0, 0]);
        expect(Math.hypot(far[0], far[2])).toBeCloseTo(MAX_PAN);
    });
});

describe("press-box aim", () => {
    it("tilts the look direction up by an angle, keeping distance", () => {
        const pos: Vector3Tuple = [0, 20, 40];
        const tgt: Vector3Tuple = [0, 0, -28];
        const out = tiltTargetUp(pos, tgt, 5);
        const pitch = (p: Vector3Tuple) =>
            Math.atan2(p[1] - pos[1], Math.hypot(p[0] - pos[0], p[2] - pos[2]));
        expect(((pitch(out) - pitch(tgt)) * 180) / Math.PI).toBeCloseTo(5);
        const d = (p: Vector3Tuple) =>
            Math.hypot(p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]);
        expect(d(out)).toBeCloseTo(d(tgt));
        expect(out[0]).toBeCloseTo(0);
    });

    it("puts the front sideline at the set height in the frame", () => {
        // The pro press box from the kit (13.7 m up, 35.2 m back).
        const press = seat(
            "pressBox",
            "seat",
            [0, 13.72, 35.23],
            [0, 0, -28.7],
        );
        const aim = seatAim(press);
        const camera = new PerspectiveCamera(SEAT_FOV_DEG, 16 / 9, 0.3, 3000);
        camera.position.set(...aim.position);
        camera.lookAt(...aim.target);
        camera.updateMatrixWorld();
        const lift = pressBoxLiftDeg(
            press.position,
            press.target,
            SEAT_FOV_DEG,
        );
        expect(lift).toBeGreaterThan(0);
        expect(lift).toBeLessThan(PRESS_BOX_MAX_LIFT_DEG);
        expect(project(camera, [0, 0, 0]).y).toBeCloseTo(
            PRESS_BOX_FRONT_NDC_Y,
            3,
        );
    });

    it("never lowers the view and caps the lift", () => {
        // Already looking high: no change.
        expect(pressBoxLiftDeg([0, 20, 40], [0, 20, -28], 45)).toBe(0);
        // Very steep: capped.
        expect(pressBoxLiftDeg([0, 200, 5], [0, 0, -1], 45)).toBe(
            PRESS_BOX_MAX_LIFT_DEG,
        );
        // Eye over the field: no change.
        expect(pressBoxLiftDeg([0, 20, -5], [0, 0, -28], 45)).toBe(0);
    });

    it("applies only to the press-box seat", () => {
        const press = seat("pressBox", "seat", [0, 20, 40], [0, 0, -28]);
        expect(seatAim(press).target[1]).toBeGreaterThan(0);
        const front = seat("frontRow", "seat", [0, 2, 20], [0, 0, -28]);
        expect(seatAim(front).target).toEqual([0, 0, -28]);
        const top = seat("topDown", "topDown", [0, 100, 0.1], [0, 0, 0]);
        expect(seatAim(top).target).toEqual([0, 0, 0]);
    });
});

describe("defaultCameraId", () => {
    const cams = (...ids: string[]) =>
        ids.map((id) => seat(id, "seat", [0, 1, 0], [0, 0, 0]));

    it("prefers the press box, then the GE judge, then the first", () => {
        expect(defaultCameraId(cams("frontRow", "pressBox"))).toBe("pressBox");
        expect(defaultCameraId(cams("frontRow", "geJudge"))).toBe("geJudge");
        expect(defaultCameraId(cams("blimp", "frontRow"))).toBe("blimp");
        expect(defaultCameraId([])).toBeNull();
    });
});

describe("helpers", () => {
    it("measures horizontal distance", () => {
        expect(horizontalDistance([3, 50, 4], [0, 0, 0])).toBe(5);
    });

    it("maps 1–9 to bar indexes", () => {
        expect(cameraIndexForKey("1")).toBe(0);
        expect(cameraIndexForKey("9")).toBe(8);
        expect(cameraIndexForKey("0")).toBeNull();
        expect(cameraIndexForKey("F")).toBeNull();
        expect(cameraIndexForKey("10")).toBeNull();
    });
});

describe("RigController fly-to", () => {
    it("lands on the seat, sets its field of view and calls onArrive once", () => {
        const camera = new PerspectiveCamera(45);
        const rig = new RigController(camera);
        rig.jumpTo([0, 50, 100], [0, 0, 0]);
        const arrived: Vector3Tuple[] = [];
        rig.flyTo([10, 5, 30], [0, 0, -20], {
            nowMs: 1000,
            fovDeg: 60,
            onArrive: (p) => arrived.push(p),
        });
        rig.update(1000 + FLY_MS / 2);
        expect(camera.fov).toBeGreaterThan(45);
        expect(camera.fov).toBeLessThan(60);
        rig.update(1000 + FLY_MS);
        rig.update(1000 + FLY_MS * 2);
        near(
            [camera.position.x, camera.position.y, camera.position.z],
            [10, 5, 30],
        );
        expect(camera.fov).toBe(60);
        expect(arrived).toEqual([[10, 5, 30]]);
        near(rig.target, [0, 0, -20]);
    });

    it("jumps on the next frame with reduced motion", () => {
        const camera = new PerspectiveCamera(45);
        const rig = new RigController(camera);
        rig.jumpTo([0, 50, 100], [0, 0, 0]);
        rig.flyTo([10, 5, 30], [0, 0, -20], { nowMs: 0, instant: true });
        rig.update(0);
        expect(rig.flying).toBe(false);
        near(
            [camera.position.x, camera.position.y, camera.position.z],
            [10, 5, 30],
        );
    });
});

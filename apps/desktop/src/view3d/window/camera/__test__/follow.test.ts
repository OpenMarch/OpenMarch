// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { RigController } from "../rigController";
import { FLY_MS, MIN_EYE_Y, SEAT_FOV_DEG } from "../rigMath";
import {
    angleDelta,
    clampPitch,
    easeAngle,
    EYE_FORWARD,
    EYE_IN_HEAD,
    EYE_SHARE,
    followTarget,
    pickPerformerIndex,
    POV_DEFAULT_PITCH,
    POV_FOV_DEG,
    POV_FOV_MAX,
    POV_MAX_PITCH,
    povPose,
    THIRD_PERSON_DISTANCE,
    thirdPersonPose,
    type PerformerPose,
} from "../followMath";
import { FollowController } from "../followController";
import { useFollowStore } from "../followStore";

const pose = (over: Partial<PerformerPose> = {}): PerformerPose => ({
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    height: 1.8,
    eye: [0, 0, 0],
    hasEye: false,
    ...over,
});

const close = (a: readonly number[], b: readonly number[], digits = 6) =>
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe("pickPerformerIndex", () => {
    // three performers in a row along x, 2 m apart, the eye 20 m back on +z
    const xz = new Float32Array([-2, 0, 0, 0, 2, 0]);
    const placed = new Uint8Array([1, 1, 1]);
    const origin: [number, number, number] = [0, 1.5, 20];

    const toward = (x: number, y: number, z: number) => {
        const d = new Vector3(x - origin[0], y - origin[1], z - origin[2])
            .normalize()
            .toArray();
        return d as [number, number, number];
    };

    it("picks the performer the ray hits", () => {
        expect(
            pickPerformerIndex(origin, toward(2, 1, 0), xz, placed, null, 3),
        ).toBe(2);
        expect(
            pickPerformerIndex(origin, toward(-2, 1, 0), xz, placed, null, 3),
        ).toBe(0);
    });

    it("forgives a click a little to the side of a distant performer", () => {
        // 0.5 m off at 20 m is about 1.4 degrees
        expect(
            pickPerformerIndex(origin, toward(2.5, 1, 0), xz, placed, null, 3),
        ).toBe(2);
    });

    it("misses when the click is well clear of everyone", () => {
        expect(
            pickPerformerIndex(origin, toward(6, 1, 0), xz, placed, null, 3),
        ).toBeNull();
        expect(
            pickPerformerIndex(origin, toward(0, 30, 0), xz, placed, null, 3),
        ).toBeNull();
    });

    it("skips performers that aren't placed, and those behind the eye", () => {
        expect(
            pickPerformerIndex(
                origin,
                toward(2, 1, 0),
                xz,
                new Uint8Array([1, 1, 0]),
                null,
                3,
            ),
        ).toBeNull();
        expect(
            pickPerformerIndex(
                [0, 1.5, -5],
                [0, 0, 1],
                new Float32Array([0, -10]),
                new Uint8Array([1]),
                null,
                1,
            ),
        ).toBeNull();
    });

    it("finds a performer raised on a platform at their own height", () => {
        const lift = new Float32Array([0, 0, 3]);
        expect(
            pickPerformerIndex(origin, toward(2, 4, 0), xz, placed, lift, 3),
        ).toBe(2);
        expect(
            pickPerformerIndex(origin, toward(2, 0.5, 0), xz, placed, lift, 3),
        ).toBeNull();
    });
});

describe("third person and point of view", () => {
    it("puts the third-person camera behind the performer, looking at them", () => {
        const p = pose({ x: 5, z: 3, heading: 0 });
        const view = thirdPersonPose(p);
        close(view.target, followTarget(p));
        // facing +z, behind is -z
        expect(view.position[2]).toBeLessThan(p.z);
        expect(view.position[0]).toBeCloseTo(p.x);
        expect(view.position[1]).toBeGreaterThan(view.target[1]);
        expect(
            new Vector3(...view.position).distanceTo(
                new Vector3(...view.target),
            ),
        ).toBeCloseTo(THIRD_PERSON_DISTANCE);
        // facing +x, behind is -x
        const turned = thirdPersonPose(pose({ heading: Math.PI / 2 }));
        expect(turned.position[0]).toBeLessThan(0);
        expect(turned.position[2]).toBeCloseTo(0);
    });

    it("looks out of the eyes, the way the performer faces", () => {
        const p = pose({ x: 1, y: 2, z: -4, heading: Math.PI / 2 });
        const view = povPose(p, { yaw: 0, pitch: 0 });
        close(view.position, [1 + EYE_FORWARD, 2 + 1.8 * EYE_SHARE, -4]);
        const dir = new Vector3(...view.target)
            .sub(new Vector3(...view.position))
            .normalize();
        close(dir.toArray(), [1, 0, 0]);
    });

    it("sits in the animated eyes when the pose knows them", () => {
        const p = pose({
            x: 5,
            z: 2,
            eye: [5.1, 1.7, 2.3],
            hasEye: true,
        });
        close(povPose(p, { yaw: 0, pitch: 0 }, true).position, [5.1, 1.7, 2.3]);
        // left out, the view clears the face, ahead of the eyes
        expect(povPose(p, { yaw: 0, pitch: 0 }).position[2]).toBeGreaterThan(
            2.3,
        );
        // without the eyes, a guess from the height
        close(povPose(pose(), { yaw: 0, pitch: 0 }, true).position, [
            0,
            1.8 * EYE_SHARE,
            EYE_IN_HEAD,
        ]);
    });

    it("turns the look by the viewer's yaw and pitch, never past straight up", () => {
        const view = povPose(pose(), { yaw: Math.PI / 2, pitch: Math.PI / 4 });
        const dir = new Vector3(...view.target)
            .sub(new Vector3(...view.position))
            .normalize();
        close(dir.toArray(), [Math.SQRT1_2, Math.SQRT1_2, 0]);
        expect(clampPitch(3)).toBe(POV_MAX_PITCH);
        expect(clampPitch(-3)).toBe(-POV_MAX_PITCH);
    });

    it("turns the short way round", () => {
        expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2);
        expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
        expect(easeAngle(0, 1, 0, 100)).toBeCloseTo(0);
        expect(easeAngle(0, 1, 100, 100)).toBeCloseTo(0.5);
        expect(easeAngle(Number.NaN, 1, 0, 100)).toBe(1);
    });
});

describe("useFollowStore", () => {
    afterEach(() => {
        useFollowStore.setState({
            follow: null,
            picking: false,
            hiddenMarcherId: null,
        });
    });

    it("follows from behind, ending the pick", () => {
        const store = useFollowStore.getState();
        store.setPicking(true);
        store.followMarcher(7);
        expect(useFollowStore.getState().follow).toEqual({
            marcherId: 7,
            mode: "third",
        });
        expect(useFollowStore.getState().picking).toBe(false);
    });

    it("backs out of the point of view, then stops", () => {
        const store = useFollowStore.getState();
        expect(store.backOut()).toBe(false);
        store.followMarcher(7, "pov");
        expect(store.backOut()).toBe(true);
        expect(useFollowStore.getState().follow?.mode).toBe("third");
        expect(store.backOut()).toBe(true);
        expect(useFollowStore.getState().follow).toBeNull();
    });

    it("toggles the point of view only while following", () => {
        const store = useFollowStore.getState();
        store.toggleMode();
        expect(useFollowStore.getState().follow).toBeNull();
        store.followMarcher(3);
        store.toggleMode();
        expect(useFollowStore.getState().follow?.mode).toBe("pov");
        store.toggleMode();
        expect(useFollowStore.getState().follow?.mode).toBe("third");
    });
});

describe("FollowController", () => {
    const setup = (
        start: PerformerPose | null = pose(),
        prefs = { turn: false, body: false },
    ) => {
        const camera = new PerspectiveCamera(SEAT_FOV_DEG, 16 / 9, 0.3, 2000);
        const rig = new RigController(camera);
        rig.jumpTo([0, 40, 80], [0, 0, 0]);
        const state = {
            performer: start,
            hidden: null as number | null,
            headless: null as number | null,
        };
        const follow = new FollowController(rig, camera, {
            poseInto: (_id, out) => {
                if (!state.performer) return false;
                Object.assign(out, state.performer);
                return true;
            },
            setHidden: (id) => {
                state.hidden = id;
            },
            setHeadless: (id) => {
                state.headless = id;
            },
            instant: () => false,
            turnWithPerformer: () => prefs.turn,
            showOwnBody: () => prefs.body,
        });
        /** Runs frames as the rig does: follow, then the rig's update. */
        const run = (fromMs: number, toMs: number) => {
            for (let t = fromMs; t <= toMs; t += 16) {
                follow.apply(t);
                rig.update(t);
            }
        };
        return { camera, rig, follow, state, run };
    };

    it("flies behind the performer and moves on with them", () => {
        const { camera, rig, follow, state, run } = setup();
        expect(follow.change({ marcherId: 1, mode: "third" }, 0)).toBe(true);
        run(0, FLY_MS + 32);
        const view = thirdPersonPose(pose());
        close(camera.position.toArray(), view.position, 4);
        close(rig.lookAt, view.target, 4);
        expect(camera.fov).toBeCloseTo(SEAT_FOV_DEG);

        // the performer marches 3 m to the side: the whole view comes along
        state.performer = pose({ x: 3 });
        run(FLY_MS + 48, FLY_MS + 48);
        close(camera.position.toArray(), [
            view.position[0] + 3,
            view.position[1],
            view.position[2],
        ]);
        close(rig.lookAt, [3, view.target[1], view.target[2]]);
    });

    it("keeps up with a performer who moves during the flight", () => {
        const { camera, follow, state, run } = setup();
        follow.change({ marcherId: 1, mode: "third" }, 0);
        run(0, FLY_MS / 2);
        state.performer = pose({ z: 5 });
        run(FLY_MS / 2 + 16, FLY_MS + 64);
        close(
            camera.position.toArray(),
            thirdPersonPose(pose({ z: 5 })).position,
            4,
        );
    });

    it("looks out of the performer's eyes with their body left out, and turns with them", () => {
        const { camera, follow, state, run } = setup();
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        expect(state.hidden).toBe(4);
        run(0, FLY_MS + 32);
        const eyes = povPose(pose(), { yaw: 0, pitch: POV_DEFAULT_PITCH });
        close(camera.position.toArray(), eyes.position, 4);
        expect(camera.fov).toBeCloseTo(POV_FOV_DEG);

        // a quarter turn eases in, then arrives
        state.performer = pose({ heading: Math.PI / 2 });
        run(FLY_MS + 48, FLY_MS + 48 + 2000);
        const dir = camera.getWorldDirection(new Vector3());
        expect(dir.x).toBeGreaterThan(0.95);
    });

    it("drags to look around and zooms in the point of view", () => {
        const { camera, follow, run } = setup();
        expect(follow.lookDrag(10, 0)).toBe(false);
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        run(0, FLY_MS + 32);
        const before = camera.getWorldDirection(new Vector3());
        // facing +z, dragging right grabs the world and looks left (+x)
        expect(follow.lookDrag(100, 0)).toBe(true);
        const after = camera.getWorldDirection(new Vector3());
        expect(after.x).toBeGreaterThan(before.x);
        expect(follow.zoomRatio(10)).toBe(true);
        expect(camera.fov).toBeCloseTo(POV_FOV_MAX);
    });

    it("backs out of the eyes to behind them before the body comes back", () => {
        const { camera, follow, state, run } = setup();
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        run(0, FLY_MS + 32);
        follow.change({ marcherId: 4, mode: "third" }, 2000);
        expect(state.hidden).toBe(4);
        run(2000, 2000 + FLY_MS + 32);
        expect(state.hidden).toBeNull();
        close(camera.position.toArray(), thirdPersonPose(pose()).position, 4);
        expect(camera.fov).toBeCloseTo(SEAT_FOV_DEG);
    });

    it("stopping in the eyes flies out, then leaves the view where it is", () => {
        const { camera, follow, state, run } = setup();
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        run(0, FLY_MS + 32);
        expect(follow.change(null, 2000)).toBe(true);
        expect(follow.active).toBe(false);
        run(2000, 2000 + FLY_MS + 32);
        expect(state.hidden).toBeNull();
        const parked = camera.position.toArray();
        state.performer = pose({ x: 10 });
        run(4000, 4100);
        close(camera.position.toArray(), parked);
    });

    it("release hands the camera over without moving it", () => {
        const { camera, follow, state, run } = setup();
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        run(0, FLY_MS + 32);
        const at = camera.position.toArray();
        follow.release();
        expect(state.hidden).toBeNull();
        expect(follow.change(null, 2000)).toBe(true);
        run(2000, 2100);
        close(camera.position.toArray(), at);
    });

    it("swings round behind a performer who turns, keeping the viewer's orbit", () => {
        const { camera, rig, follow, state, run } = setup(pose(), {
            turn: true,
            body: false,
        });
        follow.change({ marcherId: 1, mode: "third" }, 0);
        run(0, FLY_MS + 32);
        // the viewer orbits a little to one side
        rig.orbit(-40, 0);
        const side = rig.spherical.theta;
        // the performer turns to face +x: the camera ends up behind them (-x)
        state.performer = pose({ heading: Math.PI / 2 });
        run(FLY_MS + 48, FLY_MS + 48 + 3000);
        expect(rig.spherical.theta).toBeCloseTo(side + Math.PI / 2, 2);
        rig.orbit(40, 0);
        rig.sync();
        expect(camera.position.x).toBeLessThan(-1);
        expect(camera.position.z).toBeCloseTo(0, 1);
    });

    it("keeps its compass direction when turning with the performer is off", () => {
        const { rig, follow, state, run } = setup();
        follow.change({ marcherId: 1, mode: "third" }, 0);
        run(0, FLY_MS + 32);
        const theta = rig.spherical.theta;
        state.performer = pose({ heading: Math.PI / 2 });
        run(FLY_MS + 48, FLY_MS + 48 + 3000);
        expect(rig.spherical.theta).toBeCloseTo(theta);
    });

    it("shows their own arms and instrument from inside the head when asked", () => {
        const { camera, follow, state, run } = setup(pose(), {
            turn: false,
            body: true,
        });
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        expect(state.hidden).toBeNull();
        run(0, FLY_MS + 32);
        close(
            camera.position.toArray(),
            povPose(pose(), { yaw: 0, pitch: POV_DEFAULT_PITCH }, true)
                .position,
            4,
        );
        // near enough to draw a horn held at the face
        expect(camera.near).toBeLessThanOrEqual(0.06);
    });

    it("carries on a turn after a pause instead of jumping, and says when it has finished", () => {
        const { rig, follow, state, run } = setup(pose(), {
            turn: true,
            body: false,
        });
        follow.change({ marcherId: 1, mode: "third" }, 0);
        run(0, FLY_MS + 32);
        expect(follow.easing).toBe(false);
        const theta = rig.spherical.theta;
        // the performer about-faces while nothing is drawing
        state.performer = pose({ heading: Math.PI });
        run(FLY_MS + 5000, FLY_MS + 5000);
        expect(Math.abs(rig.spherical.theta - theta)).toBeLessThan(Math.PI / 3);
        expect(follow.easing).toBe(true);
        run(FLY_MS + 5016, FLY_MS + 9000);
        expect(follow.easing).toBe(false);
    });

    it("flies into the eyes at the heading it set out for, then turns", () => {
        const { camera, follow, state, run } = setup();
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        run(0, FLY_MS / 2);
        state.performer = pose({ heading: Math.PI / 2 });
        run(FLY_MS / 2 + 16, FLY_MS + 32);
        // landed still facing +z rather than snapping a quarter turn
        expect(camera.getWorldDirection(new Vector3()).z).toBeGreaterThan(0.6);
        expect(follow.easing).toBe(true);
        run(FLY_MS + 48, FLY_MS + 3000);
        expect(camera.getWorldDirection(new Vector3()).x).toBeGreaterThan(0.95);
    });

    it("keeps the first body out until the camera has left their head for someone else", () => {
        const { follow, state, run } = setup();
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        run(0, FLY_MS + 32);
        follow.change({ marcherId: 5, mode: "third" }, 2000);
        expect(state.hidden).toBe(4);
        run(2000, 2000 + FLY_MS + 32);
        expect(state.hidden).toBeNull();
    });

    it("drops a scroll zoom still easing in when the camera is placed", () => {
        const { camera, rig, run } = setup();
        rig.zoomWheel(-400);
        rig.jumpTo([0, 2, 10], [0, 1.5, 9.8]);
        run(0, 500);
        close(camera.position.toArray(), [0, 2, 10], 4);
    });

    it("never takes the camera under the ground when the performer steps down", () => {
        const { camera, rig } = setup();
        rig.jumpTo([0, 1.2, 10], [0, 1, 0]);
        rig.shift(0, -1, 0);
        expect(camera.position.y).toBeGreaterThanOrEqual(MIN_EYE_Y - 1e-6);
    });

    it("leaves out their head near the eyes when their body shows, and brings it back once clear", () => {
        const { follow, state, run } = setup(pose(), {
            turn: false,
            body: true,
        });
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        run(0, 16);
        // still far off: the head shows as the camera flies in
        expect(state.headless).toBeNull();
        run(32, FLY_MS + 32);
        expect(state.headless).toBe(4);
        follow.change({ marcherId: 4, mode: "third" }, 2000);
        run(2000, 2016);
        expect(state.headless).toBe(4);
        run(2032, 2000 + FLY_MS + 32);
        expect(state.headless).toBeNull();
    });

    it("leaves the head alone when the whole body is left out", () => {
        const { follow, state, run } = setup();
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        run(0, FLY_MS + 32);
        expect(state.hidden).toBe(4);
        expect(state.headless).toBeNull();
    });

    it("brings the head back when something else takes the camera", () => {
        const { follow, state, run } = setup(pose(), {
            turn: false,
            body: true,
        });
        follow.change({ marcherId: 4, mode: "pov" }, 0);
        run(0, FLY_MS + 32);
        expect(state.headless).toBe(4);
        follow.release();
        expect(state.headless).toBeNull();
    });

    it("refuses a performer who isn't drawn", () => {
        const { follow } = setup(null);
        expect(follow.change({ marcherId: 9, mode: "third" }, 0)).toBe(false);
        expect(follow.active).toBe(false);
    });
});

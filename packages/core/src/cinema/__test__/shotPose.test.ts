import { describe, expect, it } from "vitest";
import {
    BUILTIN_RIGS,
    applyMove,
    basePose,
    rigEye,
    shotPoseAt,
    type BuiltinRigId,
    type CameraPose,
    type CinemaContext,
    type CinemaShot,
    type MoveId,
    type Vec3,
    type WorldPoint,
} from "../../index";

const footprint = { minX: -54.86, maxX: 54.86, minZ: -48.77, maxZ: 0 };
const aspect = 16 / 9;

/** A block of marchers around (0, -20) that never moves. */
const block: WorldPoint[] = [
    { x: -5, z: -15 },
    { x: 5, z: -15 },
    { x: -5, z: -25 },
    { x: 5, z: -25 },
    { x: 0, z: -20 },
];

const contextOf = (points: readonly WorldPoint[]): CinemaContext => ({
    footprint,
    stepMeters: 0.5715,
    aspect,
    subjectPoints: () => points,
});
const ctx = contextOf(block);

const shotOf = (
    rig: BuiltinRigId,
    overrides: Partial<CinemaShot> = {},
): CinemaShot => ({
    id: rig,
    startMs: 0,
    rig: { kind: "builtin", id: rig },
    subject: { kind: "band" },
    tightness: "medium",
    move: "hold",
    transition: "cut",
    ...overrides,
});

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => {
    const length = Math.hypot(...a);
    return [a[0] / length, a[1] / length, a[2] / length];
};
const length = (a: Vec3) => Math.hypot(...a);

/** The camera's right, up and forward axes, with world +Y as up. */
const axesOf = (pose: CameraPose) => {
    const forward = unit(sub(pose.target, pose.position));
    const right = unit(cross(forward, [0, 1, 0]));
    return { forward, right, up: cross(right, forward) };
};

/** Whether a ground point is inside the frame on both axes. */
const inFrame = (pose: CameraPose, point: WorldPoint): boolean => {
    const { forward, right, up } = axesOf(pose);
    const v = sub([point.x, 0, point.z], pose.position);
    const depth = dot(v, forward);
    if (depth <= 0) return false;
    const halfV = ((pose.fovDeg / 2) * Math.PI) / 180;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    return (
        Math.abs(Math.atan(dot(v, right) / depth)) <= halfH &&
        Math.abs(Math.atan(dot(v, up) / depth)) <= halfV
    );
};

const finite = (pose: CameraPose) =>
    [...pose.position, ...pose.target, pose.fovDeg].every(Number.isFinite);

describe("basePose", () => {
    it("keeps the press box eye and aims at the subject", () => {
        const pose = basePose(shotOf("pressBox"), 1000, ctx);
        expect(pose.position).toEqual(
            rigEye(BUILTIN_RIGS.pressBox, undefined, ctx),
        );
        expect(pose.target[0]).toBeCloseTo(0, 6);
        expect(pose.target[1]).toBe(0);
        expect(pose.target[2]).toBeCloseTo(-20, 6);
        expect(pose.fovDeg).toBeGreaterThanOrEqual(8);
        expect(pose.fovDeg).toBeLessThanOrEqual(65);
    });

    it.each(["pressBox", "yard25", "endZone", "topDown", "aerial", "follow"])(
        "keeps every marcher in frame from the %s rig at medium",
        (rig) => {
            const pose = basePose(shotOf(rig as BuiltinRigId), 1000, ctx);
            for (const point of block) expect(inFrame(pose, point)).toBe(true);
        },
    );

    it("honors the shot's rig settings", () => {
        const pose = basePose(
            shotOf("yard25", { rigSettings: { side: 2 } }),
            0,
            ctx,
        );
        expect(pose.position[0]).toBeCloseTo(22.86, 2);
    });

    it("looks straight down from the top down rig with the back sideline at the top", () => {
        const pose = basePose(shotOf("topDown"), 1000, ctx);
        expect(pose.position[0]).toBeCloseTo(0, 6);
        expect(pose.position[1]).toBeGreaterThanOrEqual(70);
        expect(pose.target[0]).toBeCloseTo(0, 6);
        expect(pose.target[2]).toBeCloseTo(-20, 6);
        const { forward, up } = axesOf(pose);
        expect(forward[1]).toBeLessThan(-0.999);
        expect(up[2]).toBeLessThan(-0.999);
    });

    it("rises above the top down rig's height when the subject needs it", () => {
        const pose = basePose(
            shotOf("topDown", { tightness: "wide" }),
            0,
            contextOf([]),
        );
        expect(pose.position[1]).toBeGreaterThan(70);
        expect(pose.fovDeg).toBeCloseTo(40, 6);
    });

    it("places free rigs on the audience side of the subject", () => {
        const pose = basePose(shotOf("follow"), 0, ctx);
        expect(pose.position[0]).toBeCloseTo(0, 6);
        expect(pose.position[2]).toBeGreaterThan(-20);
        expect(pose.position[1]).toBeGreaterThan(0.5);
        expect(pose.fovDeg).toBe(40);
        const offset = sub(pose.position, pose.target);
        expect(
            (Math.atan2(offset[1], Math.hypot(offset[0], offset[2])) * 180) /
                Math.PI,
        ).toBeCloseTo(35, 6);
    });

    it("frames one marcher's head and torso in a close-up", () => {
        const one = contextOf([{ x: 3, z: -12 }]);
        const pose = basePose(
            shotOf("closeUp", {
                subject: { kind: "marcher", marcherId: 4 },
                tightness: "closeUp",
            }),
            0,
            one,
        );
        expect(pose.target[0]).toBeCloseTo(3, 6);
        expect(pose.target[1]).toBe(1.3);
        expect(pose.target[2]).toBeCloseTo(-12, 6);
        expect(length(sub(pose.position, [3, 0, -12]))).toBeLessThan(8);
        // far enough back that the frame runs from the knees to the headgear
        const range = length(sub(pose.position, pose.target));
        const halfFrame = range * Math.tan(((pose.fovDeg / 2) * Math.PI) / 180);
        expect(pose.target[1] + halfFrame).toBeGreaterThan(2.3);
        expect(pose.target[1] - halfFrame).toBeLessThan(0.6);
        expect(pose.position[1]).toBeGreaterThanOrEqual(0.5);
    });

    it("aims at the chest for a close-up on more than one marcher too", () => {
        const pose = basePose(
            shotOf("closeUp", { tightness: "closeUp" }),
            0,
            ctx,
        );
        expect(pose.target[1]).toBe(1.3);
    });

    it("aims at the ground for a close-up on a place on the field", () => {
        const spot = basePose(
            shotOf("closeUp", {
                tightness: "closeUp",
                subject: { kind: "spot", x: 2, z: -9 },
            }),
            0,
            ctx,
        );
        expect(spot.target).toEqual([2, 0, -9]);
        const medium = basePose(shotOf("closeUp"), 0, ctx);
        expect(medium.target[1]).toBe(0);
    });

    it("never frames less than a marcher's height, however tight", () => {
        const one = contextOf([{ x: 3, z: -12 }]);
        const pose = basePose(
            shotOf("follow", {
                subject: { kind: "marcher", marcherId: 4 },
                tightness: "closeUp",
            }),
            0,
            one,
        );
        const range = length(sub(pose.position, pose.target));
        // 1.5 m × 0.45 would be a 0.675 m frame; the floor is 1.1 m
        expect(range * Math.sin((20 * Math.PI) / 180)).toBeCloseTo(1.1, 6);
    });

    it("returns a pose rig as it is, above the minimum eye height", () => {
        const saved: CameraPose = {
            position: [10, 6, 20],
            target: [0, 1, -10],
            fovDeg: 35,
        };
        expect(
            basePose(
                { ...shotOf("pressBox"), rig: { kind: "pose", pose: saved } },
                500,
                ctx,
            ),
        ).toEqual(saved);
        const buried: CameraPose = { ...saved, position: [10, -2, 20] };
        expect(
            basePose(
                { ...shotOf("pressBox"), rig: { kind: "pose", pose: buried } },
                500,
                ctx,
            ).position,
        ).toEqual([10, 0.5, 20]);
    });

    it("frames the whole field when nobody matches the subject", () => {
        const empty = contextOf([]);
        for (const rig of Object.keys(BUILTIN_RIGS) as BuiltinRigId[]) {
            const pose = basePose(
                shotOf(rig, { subject: { kind: "section", section: "Tuba" } }),
                0,
                empty,
            );
            expect(finite(pose)).toBe(true);
            expect(pose.target[0]).toBeCloseTo(0, 6);
            expect(pose.target[2]).toBeCloseTo(-24.385, 6);
        }
    });
});

describe("applyMove", () => {
    const pose: CameraPose = {
        position: [0, 10, 30],
        target: [0, 0, -10],
        fovDeg: 30,
    };
    const moveOf = (
        move: MoveId,
        moveSettings?: Record<string, number>,
    ): CinemaShot => shotOf("pressBox", { move, moveSettings });
    const range = length(sub(pose.position, pose.target));

    it("leaves a hold alone", () => {
        expect(applyMove(pose, moveOf("hold"), 0.7, 4000)).toEqual(pose);
    });

    it("starts every timed move on the base pose", () => {
        for (const move of [
            "pushIn",
            "pullOut",
            "boomUp",
            "boomDown",
            "track",
            "orbit",
            "craneOver",
        ] as MoveId[]) {
            const start = applyMove(pose, moveOf(move), 0, 0);
            start.position.forEach((value, i) =>
                expect(value).toBeCloseTo(pose.position[i]!, 9),
            );
            expect(start.target).toEqual(pose.target);
        }
    });

    it("pushes in and pulls out along the line of sight", () => {
        const pushed = applyMove(pose, moveOf("pushIn"), 1, 0);
        expect(length(sub(pushed.position, pose.target))).toBeCloseTo(
            range * (1 - 0.35),
            9,
        );
        const more = applyMove(pose, moveOf("pushIn", { amount: 0.5 }), 1, 0);
        expect(length(sub(more.position, pose.target))).toBeCloseTo(
            range * 0.5,
            9,
        );
        const pulled = applyMove(pose, moveOf("pullOut"), 1, 0);
        expect(length(sub(pulled.position, pose.target))).toBeCloseTo(
            range * 1.35,
            9,
        );
        expect(pushed.target).toEqual(pose.target);
    });

    it("never pushes through the subject", () => {
        const through = applyMove(pose, moveOf("pushIn", { amount: 5 }), 1, 0);
        expect(length(sub(through.position, pose.target))).toBeGreaterThan(0);
        expect(through.position[2]).toBeGreaterThan(pose.target[2]);
    });

    it("eases a move in and out", () => {
        const half = applyMove(pose, moveOf("boomUp"), 0.5, 0);
        const early = applyMove(pose, moveOf("boomUp"), 0.1, 0);
        expect(half.position[1]).toBeCloseTo(14, 9);
        expect(early.position[1] - 10).toBeLessThan(0.8);
    });

    it("booms up and down", () => {
        expect(applyMove(pose, moveOf("boomUp"), 1, 0).position).toEqual([
            0, 18, 30,
        ]);
        expect(
            applyMove(pose, moveOf("boomDown", { meters: 4 }), 1, 0).position,
        ).toEqual([0, 6, 30]);
    });

    it("tracks along the sideline", () => {
        expect(applyMove(pose, moveOf("track"), 1, 0).position).toEqual([
            20, 10, 30,
        ]);
        expect(
            applyMove(
                pose,
                moveOf("track", { meters: 40, direction: -1 }),
                1,
                0,
            ).position,
        ).toEqual([-40, 10, 30]);
    });

    it("orbits around the subject at the same distance and height", () => {
        const orbited = applyMove(pose, moveOf("orbit", { degrees: 90 }), 1, 0);
        // From the audience side, a positive orbit goes toward side 2.
        expect(orbited.position[0]).toBeCloseTo(40, 9);
        expect(orbited.position[1]).toBeCloseTo(10, 9);
        expect(orbited.position[2]).toBeCloseTo(-10, 9);
        const other = applyMove(
            pose,
            moveOf("orbit", { degrees: 90, direction: -1 }),
            1,
            0,
        );
        expect(other.position[0]).toBeCloseTo(-40, 9);
        const byDefault = applyMove(pose, moveOf("orbit"), 1, 0);
        expect(
            Math.hypot(
                byDefault.position[0] - pose.target[0],
                byDefault.position[2] - pose.target[2],
            ),
        ).toBeCloseTo(40, 9);
        expect(byDefault.position[0]).toBeCloseTo(
            40 * Math.sin(Math.PI / 6),
            9,
        );
    });

    it("cranes over the subject, keeping its distance", () => {
        const craned = applyMove(pose, moveOf("craneOver"), 1, 0);
        const offset = sub(craned.position, pose.target);
        expect(length(offset)).toBeCloseTo(range, 9);
        expect(
            (Math.atan2(offset[1], Math.hypot(offset[0], offset[2])) * 180) /
                Math.PI,
        ).toBeCloseTo(80, 9);
        expect(craned.position[0]).toBeCloseTo(0, 9);
        expect(craned.position[2]).toBeGreaterThan(pose.target[2]);
    });

    it("drifts a little, from the time in the shot alone", () => {
        const drift = moveOf("drift");
        expect(applyMove(pose, drift, 0, 0).position).toEqual(pose.position);
        let moved = false;
        for (let ms = 0; ms <= 20_000; ms += 250) {
            const at = applyMove(pose, drift, 0.3, ms);
            expect(Math.abs(at.position[0] - 0)).toBeLessThanOrEqual(0.4);
            expect(Math.abs(at.position[1] - 10)).toBeLessThanOrEqual(0.4);
            expect(at.position[2]).toBe(30);
            expect(at).toEqual(applyMove(pose, drift, 0.9, ms));
            if (Math.abs(at.position[0]) > 0.1) moved = true;
        }
        expect(moved).toBe(true);
        const strong = applyMove(
            pose,
            moveOf("drift", { intensity: 2 }),
            0,
            1700,
        );
        const normal = applyMove(pose, drift, 0, 1700);
        expect(strong.position[0]).toBeCloseTo(normal.position[0] * 2, 9);
    });

    it("never takes the camera below the minimum eye height", () => {
        const low: CameraPose = {
            position: [0, 1.6, 6],
            target: [0, 0, -20],
            fovDeg: 30,
        };
        for (const move of [
            "hold",
            "pushIn",
            "pullOut",
            "boomUp",
            "boomDown",
            "track",
            "orbit",
            "craneOver",
            "drift",
        ] as MoveId[])
            for (const p of [0, 0.5, 1]) {
                const moved = applyMove(low, moveOf(move), p, p * 8000);
                expect(finite(moved)).toBe(true);
                expect(moved.position[1]).toBeGreaterThanOrEqual(0.5);
            }
        expect(applyMove(low, moveOf("boomDown"), 1, 0).position[1]).toBe(0.5);
    });

    it("falls back to the default for a setting that is not a number", () => {
        const moved = applyMove(
            pose,
            moveOf("boomUp", { meters: Number.NaN }),
            1,
            0,
        );
        expect(moved.position[1]).toBe(18);
    });
});

describe("shotPoseAt", () => {
    const boom = shotOf("pressBox", { move: "boomUp", startMs: 2000 });
    const base = (ms: number) => basePose(boom, ms, ctx);

    it("runs the move over the shot's length", () => {
        expect(shotPoseAt(boom, 2000, 6000, ctx)).toEqual(base(2000));
        expect(shotPoseAt(boom, 4000, 6000, ctx).position[1]).toBeCloseTo(
            base(4000).position[1] + 4,
            9,
        );
        expect(shotPoseAt(boom, 6000, 6000, ctx).position[1]).toBeCloseTo(
            base(6000).position[1] + 8,
            9,
        );
    });

    it("holds the end of the move after the shot's end and its start before it", () => {
        expect(shotPoseAt(boom, 9000, 6000, ctx).position[1]).toBeCloseTo(
            base(9000).position[1] + 8,
            9,
        );
        expect(shotPoseAt(boom, 500, 6000, ctx)).toEqual(base(500));
    });

    it("runs the move over 16 seconds when the shot has no end", () => {
        expect(shotPoseAt(boom, 10_000, Infinity, ctx).position[1]).toBeCloseTo(
            base(10_000).position[1] + 4,
            9,
        );
        expect(shotPoseAt(boom, 60_000, Infinity, ctx).position[1]).toBeCloseTo(
            base(60_000).position[1] + 8,
            9,
        );
    });

    it("stays finite for a shot with no length", () => {
        expect(finite(shotPoseAt(boom, 2000, 2000, ctx))).toBe(true);
    });

    it("follows a subject that moves", () => {
        const moving: CinemaContext = {
            ...ctx,
            subjectPoints: (_subject, ms) => [{ x: ms / 1000, z: -20 }],
        };
        const hold = shotOf("pressBox");
        // The camera leads the subject by a quarter second.
        expect(shotPoseAt(hold, 4000, 8000, moving).target[0]).toBeCloseTo(
            4.25,
            9,
        );
        expect(shotPoseAt(hold, 30_000, 8000, moving).target[0]).toBeCloseTo(
            30.25,
            9,
        );
    });
});

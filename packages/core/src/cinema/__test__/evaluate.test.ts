import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    BUILTIN_PRESETS,
    BUILTIN_RIGS,
    DEFAULT_TRANSITION_MS,
    cameraAt,
    lerpPose,
    shotPoseAt,
    shotsFromCounts,
    type BuiltinRigId,
    type CameraPose,
    type CinemaContext,
    type CinemaShot,
} from "../../index";

const footprint = { minX: -54.86, maxX: 54.86, minZ: -48.77, maxZ: 0 };

/** A block of four marchers that walks toward side 2 at 1.5 m/s and breathes. */
const ctx: CinemaContext = {
    footprint,
    stepMeters: 0.5715,
    aspect: 16 / 9,
    subjectPoints: (_subject, ms) => {
        const x = -30 + (ms / 1000) * 1.5;
        const half = 4 + 2 * Math.sin(ms / 3000);
        return [
            { x: x - half, z: -20 - half },
            { x: x + half, z: -20 - half },
            { x: x - half, z: -20 + half },
            { x: x + half, z: -20 + half },
        ];
    },
};

const shotOf = (
    id: string,
    startMs: number,
    rig: BuiltinRigId,
    overrides: Partial<CinemaShot> = {},
): CinemaShot => ({
    id,
    startMs,
    rig: { kind: "builtin", id: rig },
    subject: { kind: "band" },
    tightness: "medium",
    move: "hold",
    transition: "cut",
    ...overrides,
});

const numbers = (pose: CameraPose) => [
    ...pose.position,
    ...pose.target,
    pose.fovDeg,
];
const expectClose = (actual: CameraPose, expected: CameraPose) => {
    const want = numbers(expected);
    numbers(actual).forEach((value, i) =>
        expect(value).toBeCloseTo(want[i]!, 6),
    );
};

const box = shotOf("box", 0, "pressBox");
const side = shotOf("side", 8000, "yard25", { transition: "smooth" });
const low = shotOf("low", 16_000, "lowSideline");
const track = [box, side, low];

describe("cameraAt", () => {
    it("frames the band from the press box when there are no shots", () => {
        const frame = cameraAt(3000, [], ctx);
        expect(frame.shotId).toBeNull();
        expect(frame.inTransition).toBe(false);
        expect(numbers(frame.pose).every(Number.isFinite)).toBe(true);
        expect(frame.pose.position).toEqual([0, 28, 45]);
    });

    it("treats a time that is negative or not a number as the start", () => {
        const start = cameraAt(0, track, ctx);
        expect(start.shotId).toBe("box");
        expect(cameraAt(Number.NaN, track, ctx)).toEqual(start);
        expect(cameraAt(-5, track, ctx)).toEqual(start);
        expect(cameraAt(-Infinity, track, ctx)).toEqual(start);
    });

    it("shows the first shot before it starts", () => {
        const late = [side, low];
        const frame = cameraAt(1000, late, ctx);
        expect(frame.shotId).toBe("side");
        expect(frame.inTransition).toBe(false);
        expect(frame.pose).toEqual(shotPoseAt(side, 1000, 16_000, ctx));
    });

    it("keeps the last shot going after the track ends", () => {
        const frame = cameraAt(500_000, track, ctx);
        expect(frame.shotId).toBe("low");
        expect(frame.pose).toEqual(shotPoseAt(low, 500_000, Infinity, ctx));
    });

    it("lets the later of two shots on one start time win", () => {
        const tied = [
            box,
            shotOf("first", 8000, "yard25"),
            shotOf("second", 8000, "endZone"),
        ];
        expect(cameraAt(8000, tied, ctx).shotId).toBe("second");
        expect(cameraAt(12_000, tied, ctx).shotId).toBe("second");
        expect(cameraAt(7999, tied, ctx).shotId).toBe("box");
    });

    it("gives unsorted shots the same frames as sorted ones, and leaves the input alone", () => {
        const unsorted = [low, box, side];
        for (let ms = 0; ms <= 20_000; ms += 700)
            expect(cameraAt(ms, unsorted, ctx)).toEqual(
                cameraAt(ms, track, ctx),
            );
        expect(unsorted.map((shot) => shot.id)).toEqual(["low", "box", "side"]);
    });

    it("cuts on the shot's start", () => {
        expect(cameraAt(15_999, track, ctx).shotId).toBe("side");
        const frame = cameraAt(16_000, track, ctx);
        expect(frame.shotId).toBe("low");
        expect(frame.inTransition).toBe(false);
        expect(frame.pose).toEqual(shotPoseAt(low, 16_000, Infinity, ctx));
    });

    it("blends from the previous shot through a smooth transition", () => {
        expect(DEFAULT_TRANSITION_MS).toEqual({
            cut: 0,
            smooth: 1200,
            whip: 350,
            craneThrough: 2000,
        });
        const start = cameraAt(8000, track, ctx);
        expect(start.shotId).toBe("side");
        expect(start.inTransition).toBe(true);
        expectClose(start.pose, shotPoseAt(box, 8000, 8000, ctx));

        const mid = cameraAt(8600, track, ctx);
        const from = shotPoseAt(box, 8600, 8000, ctx);
        const to = shotPoseAt(side, 8600, 16_000, ctx);
        expect(mid.inTransition).toBe(true);
        expectClose(mid.pose, lerpPose(from, to, 0.5));
        // Strictly between the two shots' poses.
        for (const axis of [0, 1, 2] as const) {
            const [lo, hi] = [from.position[axis], to.position[axis]].sort(
                (a, b) => a - b,
            ) as [number, number];
            expect(mid.pose.position[axis]).toBeGreaterThan(lo);
            expect(mid.pose.position[axis]).toBeLessThan(hi);
        }

        const end = cameraAt(9200, track, ctx);
        expect(end.inTransition).toBe(false);
        expectClose(end.pose, shotPoseAt(side, 9200, 16_000, ctx));
    });

    it("uses the shot's own transition length", () => {
        const slow = [box, { ...side, transitionMs: 4000 }];
        expect(cameraAt(11_000, slow, ctx).inTransition).toBe(true);
        expect(cameraAt(12_000, slow, ctx).inTransition).toBe(false);
        const none = [box, { ...side, transitionMs: 0 }];
        expect(cameraAt(8000, none, ctx).inTransition).toBe(false);
    });

    it("ends a transition when the next shot starts", () => {
        const quick = [box, side, shotOf("low", 8500, "lowSideline")];
        expect(cameraAt(8499, quick, ctx).inTransition).toBe(true);
        const frame = cameraAt(8500, quick, ctx);
        expect(frame.shotId).toBe("low");
        expect(frame.inTransition).toBe(false);
        // The transition was squeezed into the half second, so it had arrived.
        expectClose(
            cameraAt(8499.999, quick, ctx).pose,
            shotPoseAt(side, 8499.999, 8500, ctx),
        );
    });

    it("has nothing to blend from on the first shot", () => {
        const first = [{ ...box, transition: "smooth" as const }];
        const frame = cameraAt(100, first, ctx);
        expect(frame.inTransition).toBe(false);
        expect(frame.pose).toEqual(shotPoseAt(first[0]!, 100, Infinity, ctx));
    });

    it("swings the aim ahead of the camera in a whip", () => {
        const whip = [box, { ...side, transition: "whip" as const }];
        const ms = 8000 + 350 * 0.3;
        const frame = cameraAt(ms, whip, ctx);
        const from = shotPoseAt(box, ms, 8000, ctx);
        const to = shotPoseAt(side, ms, Infinity, ctx);
        const along = (value: number, a: number, b: number) =>
            (value - a) / (b - a);
        expect(frame.inTransition).toBe(true);
        expect(
            along(frame.pose.position[0], from.position[0], to.position[0]),
        ).toBeCloseTo(4 * 0.3 ** 3, 6);
        expect(along(frame.pose.fovDeg, from.fovDeg, to.fovDeg)).toBeCloseTo(
            0.3 ** 0.35,
            6,
        );
        expect(cameraAt(8350, whip, ctx).inTransition).toBe(false);
    });

    it("rises through the middle of a crane-through", () => {
        const crane = [box, { ...side, transition: "craneThrough" as const }];
        const mid = cameraAt(9000, crane, ctx);
        const from = shotPoseAt(box, 9000, 8000, ctx);
        const to = shotPoseAt(side, 9000, Infinity, ctx);
        expect(mid.inTransition).toBe(true);
        expect(mid.pose.position[1]).toBeCloseTo(
            (from.position[1] + to.position[1]) / 2 + 10,
            6,
        );
        expect(mid.pose.position[0]).toBeCloseTo(
            (from.position[0] + to.position[0]) / 2,
            6,
        );

        // A long trip rises by 0.3 of the distance traveled.
        const far = [
            shotOf("left", 0, "endZone", { rigSettings: { side: 1 } }),
            shotOf("right", 8000, "endZone", {
                rigSettings: { side: 2 },
                transition: "craneThrough",
            }),
        ];
        const travel = 2 * (54.86 + 25);
        expect(cameraAt(9000, far, ctx).pose.position[1]).toBeCloseTo(
            14 + 0.3 * travel,
            6,
        );
    });

    it("gives the same frame for a time however the show is scrubbed", () => {
        const shots = [
            box,
            side,
            shotOf("orbit", 12_000, "aerial", {
                move: "orbit",
                transition: "craneThrough",
            }),
            shotOf("close", 16_000, "closeUp", {
                subject: { kind: "marcher", marcherId: 1 },
                tightness: "closeUp",
                move: "drift",
                transition: "whip",
            }),
        ];
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: -1000, max: 30_000, noNaN: true }), {
                    minLength: 1,
                    maxLength: 25,
                }),
                fc.integer(),
                (times, seed) => {
                    const forward = [...times].sort((a, b) => a - b);
                    const expected = forward.map((ms) =>
                        cameraAt(ms, shots, ctx),
                    );
                    const backward = [...forward]
                        .reverse()
                        .map((ms) => cameraAt(ms, shots, ctx))
                        .reverse();
                    expect(backward).toEqual(expected);
                    const order = forward
                        .map((_, i) => ({
                            i,
                            key: Math.sin(seed + i * 12.9898) * 43758.5453,
                        }))
                        .sort((a, b) => a.key - b.key);
                    for (const { i } of order)
                        expect(cameraAt(forward[i]!, shots, ctx)).toEqual(
                            expected[i],
                        );
                },
            ),
            { numRuns: 50 },
        );
    });

    it("keeps every built-in preset finite and above the ground over a whole track", () => {
        const shots: CinemaShot[] = BUILTIN_PRESETS.map((preset, i) => ({
            ...preset.shot,
            id: preset.id,
            startMs: i * 4000,
        }));
        const seen = new Set<string | null>();
        for (let ms = 0; ms <= shots.length * 4000 + 20_000; ms += 50) {
            const frame = cameraAt(ms, shots, ctx);
            seen.add(frame.shotId);
            expect(numbers(frame.pose).every(Number.isFinite)).toBe(true);
            expect(frame.pose.position[1]).toBeGreaterThanOrEqual(0.5);
            expect(frame.pose.fovDeg).toBeGreaterThanOrEqual(8);
            expect(frame.pose.fovDeg).toBeLessThanOrEqual(65);
        }
        expect(seen).toEqual(
            new Set(BUILTIN_PRESETS.map((preset) => preset.id)),
        );
    });

    it("stays finite when the show has no marchers", () => {
        const empty: CinemaContext = { ...ctx, subjectPoints: () => [] };
        const shots: CinemaShot[] = BUILTIN_PRESETS.map((preset, i) => ({
            ...preset.shot,
            id: preset.id,
            startMs: i * 2000,
        }));
        for (let ms = 0; ms <= shots.length * 2000; ms += 250) {
            const { pose } = cameraAt(ms, shots, empty);
            expect(numbers(pose).every(Number.isFinite)).toBe(true);
            expect(pose.position[1]).toBeGreaterThanOrEqual(0.5);
        }
        expect(
            numbers(cameraAt(0, [], empty).pose).every(Number.isFinite),
        ).toBe(true);
    });
});

describe("shotsFromCounts", () => {
    it("converts starts and transition lengths from counts", () => {
        const { startMs: _startMs, ...rest } = side;
        const shots = shotsFromCounts(
            [
                { ...rest, startCount: 8, transitionCounts: 2 },
                { ...rest, id: "plain", startCount: 0 },
            ],
            (count) => count * 500,
        );
        expect(shots[0]).toEqual({
            ...side,
            startMs: 4000,
            transitionMs: 1000,
        });
        expect(shots[1]).toEqual({ ...side, id: "plain", startMs: 0 });
        expect("transitionMs" in shots[1]!).toBe(false);
        expect("startCount" in shots[0]!).toBe(false);
    });

    it("measures a transition from the shot's start when the tempo changes", () => {
        const { startMs: _startMs, ...rest } = side;
        // 500 ms counts, then 250 ms counts from count 8 on.
        const countToMs = (count: number) =>
            count <= 8 ? count * 500 : 4000 + (count - 8) * 250;
        const [shot] = shotsFromCounts(
            [{ ...rest, startCount: 8, transitionCounts: 4 }],
            countToMs,
        );
        expect(shot!.startMs).toBe(4000);
        expect(shot!.transitionMs).toBe(1000);
    });
});

describe("BUILTIN_PRESETS", () => {
    it("lists the presets in menu order", () => {
        expect(BUILTIN_PRESETS.map((preset) => preset.id)).toEqual([
            "box",
            "yard25L",
            "yard25R",
            "topDown",
            "endZone",
            "lowSideline",
            "closeUp",
            "follow",
            "craneOver",
            "cableCam",
            "pushIn",
        ]);
    });

    it("builds every preset from a built-in rig and gives it a label", () => {
        for (const preset of BUILTIN_PRESETS) {
            expect(preset.label.length).toBeGreaterThan(0);
            expect(preset.shot.rig.kind).toBe("builtin");
            if (preset.shot.rig.kind === "builtin")
                expect(BUILTIN_RIGS[preset.shot.rig.id]).toBeDefined();
        }
    });

    it("sets up the presets the plan names", () => {
        const byId = Object.fromEntries(
            BUILTIN_PRESETS.map((preset) => [preset.id, preset.shot]),
        );
        expect(byId.box).toEqual({
            rig: { kind: "builtin", id: "pressBox" },
            subject: { kind: "band" },
            tightness: "medium",
            move: "hold",
            transition: "smooth",
        });
        expect(byId.yard25L!.rigSettings).toEqual({ side: 1 });
        expect(byId.yard25R!.rigSettings).toEqual({ side: 2 });
        expect(byId.lowSideline!.move).toBe("track");
        expect(byId.closeUp!.tightness).toBe("closeUp");
        expect(byId.follow!.subject).toEqual({ kind: "center" });
        expect(byId.craneOver!.move).toBe("craneOver");
        expect(byId.cableCam!.moveSettings).toMatchObject({ meters: 40 });
        expect(byId.pushIn!.move).toBe("pushIn");
    });
});

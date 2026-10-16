import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Manifest } from "../../../render/step-blend.js";
import {
    bodyAt,
    crossfadeWeight,
    eventIndexAt,
    eventRows,
    headingAt,
    prepName,
    planMarcher,
    plannedClips,
    type DotMode,
    type FeetSettings,
    type MarcherPlan,
    type PlanInput,
} from "../planner";
import type { HeightClass } from "../looks";

const manifest = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, "../../../assets/om-pose/manifest.json"),
        "utf8",
    ),
) as Manifest;

/** 8-to-5: 22.5 in per count. */
const STEP = 0.5715;

type Count = [dx: number, dz: number] | "hold";

/** Drill from a start point and per-count moves (+x side 2, +z toward the audience). */
function input(
    counts: Count[],
    {
        bpm = 120,
        h = 1,
        x0 = 0,
        feet,
        heading = 0,
        dotMode,
    }: {
        bpm?: number;
        h?: HeightClass;
        /** Start x: 0 is the 50 yard line. */
        x0?: number;
        /** Feet settings for every count, or per count. */
        feet?: Partial<FeetSettings> | ((k: number) => Partial<FeetSettings>);
        /** Heading per count boundary, or one for all. */
        heading?: number | number[];
        dotMode?: DotMode | DotMode[];
    } = {},
): PlanInput {
    const positions = new Float64Array((counts.length + 1) * 2);
    let x = x0;
    let z = -20;
    positions[0] = x;
    positions[1] = z;
    counts.forEach((c, k) => {
        if (c !== "hold") {
            x += c[0];
            z += c[1];
        }
        positions[(k + 1) * 2] = x;
        positions[(k + 1) * 2 + 1] = z;
    });
    return {
        manifest,
        heightClass: h,
        heading:
            typeof heading === "number" ? heading : Float64Array.from(heading),
        positions,
        bpm: new Float64Array(counts.length).fill(bpm),
        feet:
            feet === undefined
                ? undefined
                : counts.map((_, k) => ({
                      ...FEET,
                      ...(typeof feet === "function" ? feet(k) : feet),
                  })),
        dotMode,
    };
}

/** The Feet defaults (performer-behavior.md section 3). */
const FEET: FeetSettings = {
    pace: "single",
    moving: "straightLeg",
    onHolds: "stand",
    stepOffFoot: "left",
};

const repeat = <T>(n: number, v: T): T[] => Array.from({ length: n }, () => v);

/** Mark time on holds for counts before `end`, then stand. */
const markTimeUntil = (end: number) => (k: number) =>
    k < end ? { onHolds: "markTime" as const } : {};

/** The clip playing on each count (the event covering it). */
function clipPerCount(plan: MarcherPlan): string[] {
    const out: string[] = [];
    for (let k = 0; k < plan.counts - 1; k++)
        out.push(plan.events[eventIndexAt(plan, k + 0.5)].clip);
    return out;
}

/** Body position at count clock c. */
function body(plan: MarcherPlan, inp: PlanInput, c: number) {
    const k = Math.min(Math.floor(c), plan.counts - 2);
    const u = c - k;
    const p = inp.positions;
    const dx = p[k * 2] + (p[(k + 1) * 2] - p[k * 2]) * u;
    const dz = p[k * 2 + 1] + (p[(k + 1) * 2 + 1] - p[k * 2 + 1]) * u;
    const out = { x: 0, z: 0 };
    bodyAt(manifest, plan, eventIndexAt(plan, c), c, dx, dz, out);
    return { ...out, drillX: dx, drillZ: dz };
}

describe("a move from dot to dot", () => {
    // 2 holds, 16 counts forward at 8-to-5 (toward the audience), 4 holds
    const counts: Count[] = [
        ...repeat(2, "hold" as const),
        ...repeat<Count>(16, [0, STEP]),
        ...repeat(4, "hold" as const),
    ];
    const inp = input(counts);
    const plan = planMarcher(inp);
    const clips = clipPerCount(plan);

    it("steps off on count 1, loops 15 counts, halts on the first hold count", () => {
        expect(clips.slice(0, 2)).toEqual(["attention", "attention"]);
        expect(clips[2]).toBe("stepoff_8to5");
        expect(clips.slice(3, 18)).toEqual(repeat(15, "8to5"));
        // N = 16 is even: the loop is at 0.5 s on the halt count
        expect(clips[18]).toBe("halt2_8to5");
        expect(clips.slice(19)).toEqual(repeat(3, "attention"));
    });

    it("starts the loop at its time 0 on the count after the step-off", () => {
        const loop = plan.events.find((e) => e.clip === "8to5")!;
        expect(loop.count).toBe(3);
        expect(loop.phaseStart % 2).toBe(1); // (3 - 3) mod 2 = 0: time 0 at count 3
        expect((3 - loop.phaseStart) % 2).toBe(0);
    });

    it("lands exactly on the dot and stays within 30 cm of it on the way", () => {
        const end = body(plan, inp, 19);
        expect(end.x).toBeCloseTo(end.drillX, 9);
        expect(end.z).toBeCloseTo(end.drillZ, 9);
        let worst = 0;
        for (let c = 0; c <= 22; c += 0.05) {
            const b = body(plan, inp, c);
            worst = Math.max(worst, Math.hypot(b.x - b.drillX, b.z - b.drillZ));
        }
        expect(worst).toBeLessThan(0.3);
        expect(worst).toBeGreaterThan(0.1); // the step-off covers less than a step
    });

    it("would end off the dot by the spec's residuals before the correction", () => {
        // openmarch-3d.md, "Landing exactly on B": 8-to-5, N even (halt2_):
        // along +1.8 to +2.5 cm, across (field x, + = performer's left) -9.0 to -10.2 cm
        const halt = plan.events.find((e) => e.clip === "halt2_8to5")!;
        expect(halt.obZ * 100).toBeGreaterThanOrEqual(1.75);
        expect(halt.obZ * 100).toBeLessThanOrEqual(2.55);
        expect(halt.obX * 100).toBeLessThanOrEqual(-8.95); // the doc rounds to 0.1 cm
        expect(halt.obX * 100).toBeGreaterThanOrEqual(-10.25);
    });

    it("moves the body continuously (no jumps between frames)", () => {
        let prev = body(plan, inp, 0);
        for (let c = 0.01; c <= 22; c += 0.01) {
            const b = body(plan, inp, c);
            expect(Math.hypot(b.x - prev.x, b.z - prev.z)).toBeLessThan(0.03);
            prev = b;
        }
    });
});

describe("the close", () => {
    it("keeps a turned leg on its line and turns it out only at the end of the halt", () => {
        // a diagonal, then a halt: the halt clip is built at 45 and the
        // residual turn must wait until the foot has closed
        const s = STEP / Math.SQRT2;
        const plan = planMarcher(
            input([...repeat<Count>(4, [s * 1.2, s * 0.8]), "hold", "hold"]),
        );
        const halt = plan.events.find(
            (e) => e.kind === "transition" && e.clip.startsWith("halt"),
        )!;
        const yaw = halt.legYaw as [number, number, number, number];
        expect(Math.abs(yaw[0])).toBeGreaterThan(0.01); // there is a residual to undo
        expect(yaw[1]).toBe(0);
        expect(yaw[2]).toBeGreaterThanOrEqual(0.8);
        expect(yaw[3]).toBe(1);
        // the body placement uses the same window
        expect((halt.root as { legYaw: number[] }).legYaw[2]).toBe(yaw[2]);
    });
});

describe("halt parity", () => {
    it("uses halt_ after an odd number of counts (loop back at time 0)", () => {
        const plan = planMarcher(
            input([...repeat<Count>(7, [0, STEP]), "hold", "hold"]),
        );
        const clips = clipPerCount(plan);
        expect(clips[0]).toBe("stepoff_8to5");
        expect(clips[7]).toBe("halt_8to5");
    });

    it("uses halt2_ after an even number of counts", () => {
        const plan = planMarcher(
            input([...repeat<Count>(8, [0, STEP]), "hold", "hold"]),
        );
        expect(clipPerCount(plan)[8]).toBe("halt2_8to5");
    });

    it("halts a one-count move with halt_ and a two-count move with halt2_", () => {
        expect(clipPerCount(planMarcher(input([[0, STEP], "hold"])))).toEqual([
            "stepoff_8to5",
            "halt_8to5",
        ]);
        expect(
            clipPerCount(planMarcher(input([[0, STEP], [0, STEP], "hold"]))),
        ).toEqual(["stepoff_8to5", "8to5", "halt2_8to5"]);
    });
});

describe("direction", () => {
    it("marches backward toward the back sideline", () => {
        const clips = clipPerCount(
            planMarcher(input([...repeat<Count>(4, [0, -STEP]), "hold"])),
        );
        expect(clips).toEqual([
            "stepoff_back8to5",
            "back8to5",
            "back8to5",
            "back8to5",
            "halt2_back8to5",
        ]);
    });

    it("slides to the performer's left toward side 2 and right toward side 1", () => {
        // both start 10 m off the 50 and slide toward it
        expect(
            clipPerCount(
                planMarcher(
                    input([...repeat<Count>(2, [STEP, 0]), "hold"], {
                        x0: -10,
                    }),
                ),
            ),
        ).toEqual(["stepoff_slideL8to5", "slideL8to5", "halt2_slideL8to5"]);
        expect(
            clipPerCount(
                planMarcher(
                    input([...repeat<Count>(2, [-STEP, 0]), "hold"], {
                        x0: 10,
                    }),
                ),
            ),
        ).toEqual(["stepoff_slideR8to5", "slideR8to5", "halt2_slideR8to5"]);
    });

    it("turns the legs 45 degrees on a diagonal and uses the turned step-off", () => {
        const s = STEP / Math.SQRT2;
        const plan = planMarcher(input([...repeat<Count>(4, [s, s]), "hold"]));
        const loop = plan.events.find((e) => e.kind === "loop")!;
        expect(loop.clip).toBe("8to5");
        expect(((loop.legYaw as number) * 180) / Math.PI).toBeCloseTo(45, 6);
        expect(clipPerCount(plan)[0]).toBe("stepoff_8to5_L45");
        expect(clipPerCount(plan)[4]).toBe("halt2_8to5_L45");
    });
});

describe("slides and the 50", () => {
    it("slides forward toward the 50 and backward away from it", () => {
        const toward = planMarcher(
            input([...repeat<Count>(4, [-STEP, 0]), "hold"], { x0: 10 }),
        );
        expect(clipPerCount(toward)).toEqual([
            "stepoff_slideR8to5",
            "slideR8to5",
            "slideR8to5",
            "slideR8to5",
            "halt2_slideR8to5",
        ]);
        const away = planMarcher(
            input([...repeat<Count>(4, [STEP, 0]), "hold"], { x0: 10 }),
        );
        // the legs face the 50 (the performer's right) while the body travels left
        expect(clipPerCount(away)).toEqual([
            "stepoff_back8to5_R45",
            "back8to5",
            "back8to5",
            "back8to5",
            "halt2_back8to5_R45",
        ]);
        const loop = away.events.find((e) => e.kind === "loop")!;
        expect(((loop.legYaw as number) * 180) / Math.PI).toBeCloseTo(-90, 6);
    });

    it("keeps one gait through a slide that crosses the 50", () => {
        // from 3 m on side 2 to 1.6 m on side 1: nearer the 50 at the end
        const plan = planMarcher(
            input([...repeat<Count>(8, [-STEP, 0]), "hold"], { x0: 3 }),
        );
        const clips = clipPerCount(plan);
        expect(clips.slice(1, 8)).toEqual(repeat(7, "slideR8to5"));
        expect(clips.some((c) => c.includes("back"))).toBe(false);
    });

    it("keeps the forward slide on the 50 or along it", () => {
        // ends exactly as far from the 50 as it started: no answer, forward slide
        const plan = planMarcher(
            input([...repeat<Count>(4, [STEP, 0]), "hold"], { x0: -2 * STEP }),
        );
        expect(clipPerCount(plan)[1]).toBe("slideL8to5");
    });

    it("decides per run: a slide out and back changes gait where it turns", () => {
        const plan = planMarcher(
            input(
                [
                    ...repeat<Count>(4, [STEP, 0]),
                    ...repeat<Count>(4, [-STEP, 0]),
                    "hold",
                ],
                { x0: 10 },
            ),
        );
        const clips = clipPerCount(plan);
        expect(clips[1]).toBe("back8to5");
        // the backward slide's legs are turned 90 degrees, so the unturned
        // change clip doesn't fit: the gaits crossfade
        const turn = plan.events[eventIndexAt(plan, 4.5)];
        expect(turn.kind).toBe("crossfade");
        expect([turn.clip, turn.clip2]).toEqual(["back8to5", "slideR8to5"]);
        expect(clips[5]).toBe("slideR8to5");
    });

    it("leaves diagonals outside the band alone", () => {
        // 60 degrees from the front, away from the 50: a forward march, legs turned
        const dx = STEP * Math.sin(Math.PI / 3);
        const dz = STEP * Math.cos(Math.PI / 3);
        const plan = planMarcher(
            input([...repeat<Count>(4, [dx, dz]), "hold"], { x0: 10 }),
        );
        const loop = plan.events.find((e) => e.kind === "loop")!;
        expect(loop.clip).toBe("8to5");
        expect(((loop.legYaw as number) * 180) / Math.PI).toBeCloseTo(60, 6);
    });
});

describe("in-between step sizes", () => {
    it("blends the two neighboring sizes so the body travels the drill distance", () => {
        const d = 0.5; // between 10-to-5 (0.457) and 8-to-5 (0.572)
        const plan = planMarcher(input([...repeat<Count>(6, [0, d]), "hold"]));
        const loop = plan.events.find((e) => e.kind === "loop")!;
        expect([loop.clip, loop.clip2]).toEqual(["10to5", "8to5"]);
        expect(loop.weight).toBeCloseTo(
            (d - 4.572 / 10) / (4.572 / 8 - 4.572 / 10),
            3,
        );
        const so = plan.events[0];
        expect([so.clip, so.clip2]).toEqual(["stepoff_10to5", "stepoff_8to5"]);
        expect(so.weight).toBeCloseTo(loop.weight, 9);
    });

    it("clamps a tiny step to 16-to-5 and still lands on the dot", () => {
        const counts: Count[] = [
            ...repeat<Count>(8, [0, 0.05]),
            "hold",
            "hold",
        ];
        const inp = input(counts);
        const plan = planMarcher(inp);
        expect(plan.events.find((e) => e.kind === "loop")!.clip).toBe("16to5");
        const end = body(plan, inp, 9.5);
        expect(end.z).toBeCloseTo(end.drillZ, 9);
    });

    it("plays 6-to-5 fast at 168 bpm and the walk at 120", () => {
        const at = (bpm: number) =>
            planMarcher(
                input([...repeat<Count>(4, [0, 0.762]), "hold"], { bpm }),
            ).events.find((e) => e.kind === "loop")!.clip;
        expect(at(120)).toBe("6to5");
        expect(at(168)).toBe("6to5_fast");
    });
});

describe("moves back to back", () => {
    it("centers a move-to-move change on the page boundary", () => {
        // 8 forward then 8 slide left toward the 50: the fade runs from the
        // middle of count 7 (the last of the old move) to the middle of count 8
        const plan = planMarcher(
            input(
                [
                    ...repeat<Count>(8, [0, STEP]),
                    ...repeat<Count>(8, [STEP, 0]),
                    "hold",
                ],
                { x0: -10 },
            ),
        );
        const fade = plan.events[eventIndexAt(plan, 7.5)];
        expect(fade.kind).toBe("crossfade");
        expect(fade.count).toBe(7);
        expect(fade.fadeStart).toBe(7.5);
        expect(fade.fadeEnd).toBe(8.5);
        expect([fade.clip, fade.clip2]).toEqual(["8to5", "slideL8to5"]);
        // the same fade covers both counts (the second may carry its own
        // body placement span, for the swing to the new direction)
        const second = plan.events[eventIndexAt(plan, 8.9)];
        expect(second.kind).toBe("crossfade");
        expect([second.fadeStart, second.fadeEnd]).toEqual([7.5, 8.5]);
        expect([second.clip, second.clip2]).toEqual(["8to5", "slideL8to5"]);
        expect(second.phaseStart).toBe(fade.phaseStart);
        const clips = clipPerCount(plan);
        expect(clips[6]).toBe("8to5");
        expect(clips.slice(9, 16)).toEqual(repeat(7, "slideL8to5"));
        // the loops stay in phase across the fade
        const fwd = plan.events.find(
            (e) => e.kind === "loop" && e.clip === "8to5",
        )!;
        const side = plan.events.find(
            (e) => e.kind === "loop" && e.clip === "slideL8to5",
        )!;
        expect(Math.abs(fwd.phaseStart - side.phaseStart) % 2).toBe(0);
        expect(Math.abs(fwd.phaseStart - fade.phaseStart) % 2).toBe(0);
    });

    it("falls back to a one-count fade when the change follows the step-off", () => {
        const plan = planMarcher(
            input([[0, STEP], ...repeat<Count>(4, [STEP, 0]), "hold"], {
                x0: -10,
            }),
        );
        expect(clipPerCount(plan)[0]).toBe("stepoff_8to5");
        const fade = plan.events[eventIndexAt(plan, 1.5)];
        expect(fade.kind).toBe("crossfade");
        expect(fade.count).toBe(1);
        expect(fade.fadeStart).toBe(1);
        expect(fade.fadeEnd).toBe(2);
    });

    it("fades a size change the same way", () => {
        const plan = planMarcher(
            input([
                ...repeat<Count>(4, [0, STEP]),
                ...repeat<Count>(4, [0, 4.572 / 6]),
                "hold",
            ]),
        );
        const fade = plan.events[eventIndexAt(plan, 3.5)];
        expect(fade.kind).toBe("crossfade");
        expect([fade.clip, fade.clip2]).toEqual(["8to5", "6to5"]);
        expect(fade.fadeStart).toBe(3.5);
    });

    it("crossfades between loops when no change clip exists, keeping the loop time", () => {
        // 12-to-5 forward into a slide toward the 50: there is no change_12to5__slideR… clip
        const plan = planMarcher(
            input(
                [
                    ...repeat<Count>(4, [0, 4.572 / 12]),
                    ...repeat<Count>(4, [-4.572 / 12, 0]),
                    "hold",
                ],
                { x0: 10 },
            ),
        );
        const clips = clipPerCount(plan);
        const fade = plan.events[eventIndexAt(plan, 3.5)];
        expect(fade.kind).toBe("crossfade");
        expect(fade.count).toBe(3);
        const second = plan.events[eventIndexAt(plan, 4.5)];
        expect([second.kind, second.clip, second.clip2]).toEqual([
            "crossfade",
            "12to5",
            "slideR12to5",
        ]);
        expect([second.fadeStart, second.fadeEnd]).toEqual([
            fade.fadeStart,
            fade.fadeEnd,
        ]);
        expect(fade.clip).toBe("12to5");
        expect(fade.clip2).toBe("slideR12to5");
        expect(clips[5]).toBe("slideR12to5");
        const fwd = plan.events.find((e) => e.clip === "12to5")!;
        const side = plan.events.find((e) => e.clip === "slideR12to5")!;
        expect(Math.abs(fwd.phaseStart - fade.phaseStart) % 2).toBe(0);
        expect(Math.abs(fwd.phaseStart - side.phaseStart) % 2).toBe(0);
    });

    it("eases the legs from the old travel to the new one through the crossfade", () => {
        // a 12-to-5 diagonal, forward and to the performer's right, into straight backward
        const s = 4.572 / 12 / Math.SQRT2;
        const plan = planMarcher(
            input(
                [
                    ...repeat<Count>(4, [-s, s]),
                    ...repeat<Count>(4, [0, -4.572 / 12]),
                    "hold",
                ],
                { x0: 10 },
            ),
        );
        const fade = plan.events[eventIndexAt(plan, 4.5)];
        expect(fade.kind).toBe("crossfade");
        expect(fade.clip).toBe("12to5");
        expect(fade.clip2).toBe("back12to5");
        const [y0, y1, u0, u1] = fade.legYaw as [
            number,
            number,
            number,
            number,
        ];
        expect((y0 * 180) / Math.PI).toBeCloseTo(-45, 6);
        expect(y1).toBeCloseTo(0, 9);
        expect([u0, u1]).toEqual([0, 1]);
        // the body stays on the drill through the fade
        const inp = input(
            [
                ...repeat<Count>(4, [-s, s]),
                ...repeat<Count>(4, [0, -4.572 / 12]),
                "hold",
            ],
            { x0: 10 },
        );
        for (const c of [4, 4.5, 5]) {
            const b = body(plan, inp, c);
            expect(Math.hypot(b.x - b.drillX, b.z - b.drillZ)).toBeLessThan(
                0.3,
            );
        }
    });

    it("widens the fade for a sharp turn within one family, with no second clip", () => {
        const s = STEP / Math.SQRT2;
        // forward and left 45°, then forward and right 45°: same loop, 90° of leg turn
        const plan = planMarcher(
            input([
                ...repeat<Count>(4, [s, s]),
                ...repeat<Count>(4, [-s, s]),
                "hold",
            ]),
        );
        const fade = plan.events[eventIndexAt(plan, 3.5)];
        expect(fade.kind).toBe("crossfade");
        expect(fade.clip).toBe("8to5");
        expect(fade.clip2).toBeNull();
        const [y0, y1] = fade.legYaw as [number, number, number, number];
        expect((y0 * 180) / Math.PI).toBeCloseTo(45, 6);
        expect((y1 * 180) / Math.PI).toBeCloseTo(-45, 6);
        expect(fade.fadeStart).toBe(3.5);
        expect(fade.fadeEnd).toBe(4.5);
    });

    it("keeps the hand-made change clips for mark time", () => {
        const plan = planMarcher(
            input(
                [
                    ...repeat<Count>(4, [0, STEP]),
                    ...repeat<Count>(2, "hold"),
                    "hold",
                ],
                { feet: markTimeUntil(6) },
            ),
        );
        expect(clipPerCount(plan)[4]).toBe("change2_8to5__marktime");
    });

    it("crossfades into and out of mark time when no change clip exists", () => {
        const plan = planMarcher(
            input(
                [
                    ...repeat<Count>(4, [0, 4.572 / 12]),
                    ...repeat<Count>(2, "hold"),
                    ...repeat<Count>(4, [0, 4.572 / 12]),
                    "hold",
                ],
                { feet: markTimeUntil(10) },
            ),
        );
        const into = plan.events[eventIndexAt(plan, 4.5)];
        expect(into.kind).toBe("crossfade");
        expect([into.clip, into.clip2]).toEqual(["12to5", "marktime"]);
        const out = plan.events[eventIndexAt(plan, 6.5)];
        expect(out.kind).toBe("crossfade");
        expect([out.clip, out.clip2]).toEqual(["marktime", "12to5"]);
    });

    it("lands on the dot after a continuous run of moves", () => {
        const counts: Count[] = [
            ...repeat<Count>(8, [0, STEP]),
            ...repeat<Count>(8, [STEP, 0]),
            ...repeat<Count>(8, [0, -STEP]),
            "hold",
            "hold",
        ];
        const inp = input(counts);
        const plan = planMarcher(inp);
        const end = body(plan, inp, 25.5);
        expect(end.x).toBeCloseTo(end.drillX, 9);
        expect(end.z).toBeCloseTo(end.drillZ, 9);
    });
});

describe("a curved path", () => {
    it("follows a new direction every count, easing the leg turn", () => {
        // a quarter circle of radius 5 m over 16 counts
        const counts: Count[] = [];
        const r = 5;
        for (let k = 0; k < 16; k++) {
            const a0 = (k / 16) * (Math.PI / 2);
            const a1 = ((k + 1) / 16) * (Math.PI / 2);
            // starts toward the audience and curves toward side 2
            counts.push([
                r * (Math.cos(a0) - Math.cos(a1)),
                r * (Math.sin(a1) - Math.sin(a0)),
            ]);
        }
        counts.push("hold");
        const inp = input(counts);
        const plan = planMarcher(inp);
        const clips = clipPerCount(plan);
        expect(clips[0]).toBe("stepoff_10to5"); // 0.49 m per count: 10-to-5 / 8-to-5 blend
        const eased = plan.events.filter((e) => Array.isArray(e.legYaw));
        expect(eased.length).toBeGreaterThan(10);
        const end = body(plan, inp, 17);
        expect(end.x).toBeCloseTo(end.drillX, 9);
    });
});

describe("rests", () => {
    // performer-behavior.md section 3: "Stand" on holds replaces the old
    // automatic mark time while the band moves. These tests used to pass
    // `bandMoving` and expect mark time; mark time is now a chosen technique.
    it("stands on a hold by default, even while the band moves", () => {
        const clips = clipPerCount(planMarcher(input(repeat(12, "hold"))));
        expect(clips).toEqual(repeat(12, "attention"));
    });

    it("marks time on holds when the technique says so, and stands again after", () => {
        const counts: Count[] = repeat(12, "hold" as const);
        const clips = clipPerCount(
            planMarcher(input(counts, { feet: markTimeUntil(8) })),
        );
        expect(clips[0]).toBe("stepoff_marktime");
        expect(clips.slice(1, 8)).toEqual(repeat(7, "marktime"));
        // 7 mark time counts: back at time 0.5 on count 8
        expect(clips[8]).toBe("halt2_marktime");
        expect(clips.slice(9)).toEqual(repeat(3, "attention"));
    });

    it("plays high mark time as mark time for now", () => {
        const clips = clipPerCount(
            planMarcher(
                input(repeat(4, "hold" as const), {
                    feet: { onHolds: "highMarkTime" },
                }),
            ),
        );
        expect(clips).toEqual([
            "stepoff_marktime",
            "marktime",
            "marktime",
            "marktime",
        ]);
    });

    it("goes from mark time into a move with the change clip", () => {
        const counts: Count[] = [
            ...repeat(4, "hold" as const),
            ...repeat<Count>(4, [0, STEP]),
            "hold",
        ];
        const clips = clipPerCount(
            planMarcher(input(counts, { feet: markTimeUntil(8) })),
        );
        expect(clips[0]).toBe("stepoff_marktime");
        expect(clips[4]).toMatch(/^change2?_marktime__8to5$/);
    });
});

describe("height classes", () => {
    it("plays the class's own clips", () => {
        const plan = planMarcher(
            input([...repeat<Count>(4, [0, STEP]), "hold"], { h: 1.05 }),
        );
        expect(clipPerCount(plan)).toEqual([
            "stepoff_8to5-h105",
            "8to5-h105",
            "8to5-h105",
            "8to5-h105",
            "halt2_8to5-h105",
        ]);
    });
});

describe("the bake set", () => {
    it("lists every clip a plan plays", () => {
        const plan = planMarcher(
            input([...repeat<Count>(4, [0, 0.5]), "hold", "hold"]),
        );
        expect([...plannedClips([plan])].sort()).toEqual(
            [
                "10to5",
                "8to5",
                "attention",
                "halt2_10to5",
                "halt2_8to5",
                "stepoff_10to5",
                "stepoff_8to5",
            ].sort(),
        );
    });
});

/** Body minus drill at count boundary k. */
function offsetAt(plan: MarcherPlan, inp: PlanInput, k: number) {
    const b = body(plan, inp, k);
    return { x: b.x - b.drillX, z: b.z - b.drillZ };
}

describe("foot on the dot (the default)", () => {
    // 2 holds, 8 counts forward toward the audience, 4 holds
    const inp = input([
        ...repeat(2, "hold" as const),
        ...repeat<Count>(8, [0, STEP]),
        ...repeat(4, "hold" as const),
    ]);
    const plan = planMarcher(inp);

    it("puts the ankle on the dot each count: the body half a step behind it", () => {
        // boundaries 3..10 end counts 1..8 of the move
        for (let k = 3; k <= 10; k++) {
            const o = offsetAt(plan, inp, k);
            expect(o.z).toBeCloseTo(-STEP / 2, 1);
            expect(Math.abs(o.z + STEP / 2)).toBeLessThan(0.03);
            expect(Math.abs(o.x)).toBeLessThan(0.1);
        }
    });

    it("resolves onto the dot as the feet close, between count 8 and count 1 of the hold", () => {
        const o = offsetAt(plan, inp, 11);
        expect(o.x).toBeCloseTo(0, 9);
        expect(o.z).toBeCloseTo(0, 9);
        // still on the dot before the step-off
        const s = offsetAt(plan, inp, 2);
        expect(s.z).toBeCloseTo(0, 9);
    });
});

describe("foot on the dot through a change of direction", () => {
    // 2 holds, 8 forward, 8 toward side 1 (−x), 4 holds
    const inp = input([
        ...repeat(2, "hold" as const),
        ...repeat<Count>(8, [0, STEP]),
        ...repeat<Count>(8, [-STEP, 0]),
        ...repeat(4, "hold" as const),
    ]);
    const plan = planMarcher(inp);

    it("keeps the old direction's half step on count 8 and swings to the new one by count 1", () => {
        // boundary 10 ends count 8 of the forward move
        const c8 = offsetAt(plan, inp, 10);
        expect(Math.abs(c8.z + STEP / 2)).toBeLessThan(0.03);
        expect(Math.abs(c8.x)).toBeLessThan(0.1);
        // boundary 11 ends count 1 of the new move: half a step behind toward +x
        const c1 = offsetAt(plan, inp, 11);
        expect(Math.abs(c1.x - STEP / 2)).toBeLessThan(0.03);
        expect(Math.abs(c1.z)).toBeLessThan(0.03);
        // and holds it to count 8 of the new move
        const end = offsetAt(plan, inp, 18);
        expect(Math.abs(end.x - STEP / 2)).toBeLessThan(0.03);
        expect(Math.abs(end.z)).toBeLessThan(0.1);
        // never jumps: at most a fast step's travel in a fiftieth of a count
        let prev = body(plan, inp, 0);
        for (let c = 0.02; c <= 22; c += 0.02) {
            const b = body(plan, inp, c);
            expect(Math.hypot(b.x - prev.x, b.z - prev.z)).toBeLessThan(0.04);
            prev = b;
        }
        // then onto the dot
        const hold = offsetAt(plan, inp, 19);
        expect(hold.x).toBeCloseTo(0, 9);
        expect(hold.z).toBeCloseTo(0, 9);
    });
});

describe("body center (an option for later)", () => {
    const counts: Count[] = [
        ...repeat(2, "hold" as const),
        ...repeat<Count>(8, [0, STEP]),
        ...repeat<Count>(8, [-STEP, 0]),
        ...repeat(4, "hold" as const),
    ];
    const inp = { ...input(counts), dotMode: "body" as const };
    const plan = planMarcher(inp);

    it("keeps the body's center over the dot on every count", () => {
        for (let k = 0; k <= counts.length; k++) {
            const o = offsetAt(plan, inp, k);
            expect(Math.hypot(o.x, o.z)).toBeLessThan(1e-6);
        }
    });
});

describe("prep steps at the end of a move", () => {
    /** 8 counts forward toward the audience, then 8 counts of `next`, then holds. */
    const plan2 = (next: Count) => {
        const inp = input(
            [
                ...repeat(2, "hold" as const),
                ...repeat<Count>(8, [0, STEP]),
                ...repeat<Count>(8, next),
                ...repeat(4, "hold" as const),
            ],
            { x0: -10 },
        );
        return { inp, plan: planMarcher(inp) };
    };
    // the boundary between the moves: the last landing of the forward move
    const B = 10;

    it("lands the last step of the old move on the platform, at the loop time of that landing", () => {
        const { plan } = plan2([STEP, 0]); // a slide toward the 50
        const fade = plan.events[eventIndexAt(plan, B - 0.25)];
        expect(fade.kind).toBe("crossfade");
        expect(typeof fade.prep).toBe("number");
        expect((((B - fade.phaseStart) % 2) + 2) % 2).toBe(fade.prep);
        // the second count of the fade keeps it
        expect(plan.events[eventIndexAt(plan, B + 0.75)].prep).toBe(fade.prep);
        // loops away from the change carry none
        expect(plan.events[eventIndexAt(plan, 5.5)].prep ?? null).toBeNull();
    });

    it("is halfway into the new direction on the prep landing", () => {
        const { plan } = plan2([STEP, 0]);
        const fade = plan.events[eventIndexAt(plan, B - 0.25)];
        // the slide's leg turn lives in its clip: halfway is a 50-50 blend
        // of the old gait and the new one, plus half of any residual leg turn
        const u = (B - fade.fadeStart) / (fade.fadeEnd - fade.fadeStart);
        expect(crossfadeWeight(u)).toBeCloseTo(0.5, 9);
        const [y0, y1] = fade.legYaw as [number, number, number, number];
        const yaw = y0 + (y1 - y0) * crossfadeWeight(u);
        expect(yaw).toBeCloseTo((y0 + y1) / 2, 9);
    });

    it("preps a 15 degree change, but not one under 10 degrees", () => {
        const turn = (deg: number): Count => {
            const a = (deg * Math.PI) / 180;
            return [STEP * Math.sin(a), STEP * Math.cos(a)];
        };
        const at15 = plan2(turn(15)).plan;
        expect(typeof at15.events[eventIndexAt(at15, B - 0.25)].prep).toBe(
            "number",
        );
        const at8 = plan2(turn(8)).plan;
        expect(
            at8.events.some((e) => e.prep !== null && e.prep !== undefined),
        ).toBe(false);
    });

    it("bakes the prep landings as their own rows", () => {
        const { plan } = plan2([STEP, 0]);
        const fade = plan.events[eventIndexAt(plan, B - 0.25)];
        const clips = plannedClips([plan]);
        expect(clips.has(prepName(fade.clip, fade.prep!))).toBe(true);
        expect(clips.has(prepName(fade.clip2!, fade.prep!))).toBe(true);
    });
});

/** The event covering each count's middle: [count, clip, rate]. */
function steps(plan: MarcherPlan) {
    return plan.events.map((e) => [e.count, e.clip, e.rate]);
}

describe("pace", () => {
    // performer-behavior.md section 3: pace sets the stride and the step
    // rate; the dots set the distance.
    it("steps every other count in half time, a stride covering two counts of dots", () => {
        // 16-to-5 dots in half time are 8-to-5 strides
        const counts: Count[] = [
            ...repeat(2, "hold" as const),
            ...repeat<Count>(8, [0, 4.572 / 16]),
            ...repeat(4, "hold" as const),
        ];
        const inp = input(counts, { feet: { pace: "half" } });
        const plan = planMarcher(inp);
        expect(steps(plan)).toEqual([
            [0, "attention", 0.5],
            [2, "stepoff_8to5", 0.5],
            [4, "8to5", 0.5],
            // four strides, an even number: the loop is at its time 1 on the close
            [10, "halt2_8to5", 0.5],
            [12, "attention", 0.5],
        ]);
        // the loop is at its time 0 on the click after the step-off
        const loop = plan.events[2];
        expect((((4 - loop.phaseStart) * loop.rate) % 2) + 0).toBeCloseTo(0, 9);
        // and the body closes onto the dot
        const end = body(plan, inp, 12);
        expect(end.x).toBeCloseTo(end.drillX, 9);
        expect(end.z).toBeCloseTo(end.drillZ, 9);
    });

    it("takes 4-to-5 strides on 8-to-5 dots in half time", () => {
        const plan = planMarcher(
            input([...repeat<Count>(8, [0, STEP]), "hold", "hold"], {
                feet: { pace: "half" },
            }),
        );
        expect(plan.events.find((e) => e.kind === "loop")!.clip).toBe("4to5");
    });

    it("steps twice a count in double time, a stride covering half a count of dots", () => {
        // 8-to-5 dots in double time are 16-to-5 strides
        const counts: Count[] = [
            ...repeat(2, "hold" as const),
            ...repeat<Count>(4, [0, STEP]),
            ...repeat(2, "hold" as const),
        ];
        const inp = input(counts, { feet: { pace: "double" } });
        const plan = planMarcher(inp);
        expect(steps(plan)).toEqual([
            [0, "attention", 2],
            [2, "stepoff_16to5", 2],
            [2.5, "16to5", 2],
            // eight strides: the close is halt2_ and takes half a count
            [6, "halt2_16to5", 2],
            [6.5, "attention", 2],
        ]);
        const end = body(plan, inp, 7);
        expect(end.z).toBeCloseTo(end.drillZ, 9);
    });

    it("keeps single time as one step a count", () => {
        const plan = planMarcher(
            input([...repeat<Count>(4, [0, STEP]), "hold"], {
                feet: { pace: "single" },
            }),
        );
        expect(plan.events.every((e) => e.rate === 1)).toBe(true);
    });

    it("changes pace inside a move with a fade, keeping the loop's time", () => {
        // 4 counts single, then 4 counts half time on 16-to-5 dots: 8-to-5 strides
        const plan = planMarcher(
            input(
                [
                    ...repeat<Count>(4, [0, STEP]),
                    ...repeat<Count>(4, [0, 4.572 / 16]),
                    "hold",
                    "hold",
                ],
                { feet: (k) => ({ pace: k < 4 ? "single" : "half" }) },
            ),
        );
        const fade = plan.events[eventIndexAt(plan, 4.5)];
        expect(fade.kind).toBe("crossfade");
        expect(fade.rate).toBe(0.5);
        // no jump in the clip's time at the change: the old loop's time on
        // count 4's click is what the new event plays there
        const before = plan.events[eventIndexAt(plan, 3.5)];
        const t = (e: typeof fade, c: number) =>
            ((((c - e.phaseStart) * e.rate) % 2) + 2) % 2;
        expect(t(fade, 4)).toBeCloseTo(t(before, 4), 9);
    });
});

describe("on holds", () => {
    it("stands still at attention while others move: no automatic mark time", () => {
        const plan = planMarcher(input(repeat(8, "hold" as const)));
        expect(plan.events.map((e) => e.clip)).toEqual(["attention"]);
    });
});

describe("step-off foot per move", () => {
    // two moves: the first off the left foot, the second off the right
    const counts: Count[] = [
        ...repeat<Count>(4, [0, STEP]),
        "hold",
        "hold",
        ...repeat<Count>(4, [0, STEP]),
        "hold",
        "hold",
    ];
    const plan = planMarcher(
        input(counts, {
            feet: (k) => ({ stepOffFoot: k < 6 ? "left" : "right" }),
        }),
    );

    it("plays each move off the foot set at its step-off", () => {
        const first = plan.events.filter((e) => e.count < 5);
        const second = plan.events.filter((e) => e.count >= 6 && e.count < 11);
        expect(first.every((e) => e.foot === "left")).toBe(true);
        expect(second.every((e) => e.foot === "right")).toBe(true);
    });

    it("plays a right-foot move from mirrored rows", () => {
        const loop = plan.events.find(
            (e) => e.kind === "loop" && e.foot === "right",
        )!;
        const [row] = eventRows(loop);
        expect(row).not.toBe(loop.clip);
        expect(row.startsWith(loop.clip)).toBe(true);
        const rows = plannedClips([plan]);
        expect(rows.has("8to5")).toBe(true);
        expect(rows.has(row)).toBe(true);
    });

    it("keeps the foot through a move when the setting changes mid-move", () => {
        const mid = planMarcher(
            input([...repeat<Count>(8, [0, STEP]), "hold"], {
                feet: (k) => ({ stepOffFoot: k < 4 ? "left" : "right" }),
            }),
        );
        expect(mid.events.every((e) => e.foot === "left")).toBe(true);
    });
});

describe("dot mode per set", () => {
    // 8 forward with the body on the dot, a hold, 8 forward with the foot on it
    const counts: Count[] = [
        ...repeat<Count>(8, [0, STEP]),
        "hold",
        ...repeat<Count>(8, [0, STEP]),
        "hold",
    ];
    const inp = input(counts, {
        dotMode: counts.map((_, k) => (k < 9 ? "body" : "foot")),
    });
    const plan = planMarcher(inp);

    it("keeps the body on the dot through the body-center set", () => {
        for (let k = 1; k <= 8; k++)
            expect(
                Math.hypot(offsetAt(plan, inp, k).x, offsetAt(plan, inp, k).z),
            ).toBeLessThan(1e-6);
    });

    it("puts the ankle on the dot through the foot set: the body half a step behind", () => {
        for (let k = 11; k <= 17; k++)
            expect(Math.abs(offsetAt(plan, inp, k).z + STEP / 2)).toBeLessThan(
                0.03,
            );
    });
});

describe("facing", () => {
    const BACK = Math.PI;
    const SIDE2 = Math.PI / 2;

    it("turns the whole performer at rest", () => {
        const plan = planMarcher(
            input(repeat(4, "hold" as const), { heading: BACK }),
        );
        expect(plan.events.map((e) => e.clip)).toEqual(["attention"]);
        expect(headingAt(plan, 2)).toBeCloseTo(BACK, 9);
    });

    it("marches forward when facing the backfield and moving back", () => {
        const plan = planMarcher(
            input([...repeat<Count>(4, [0, -STEP]), "hold"], { heading: BACK }),
        );
        expect(clipPerCount(plan)).toEqual([
            "stepoff_8to5",
            "8to5",
            "8to5",
            "8to5",
            "halt2_8to5",
        ]);
    });

    it("marches forward when facing side 2 and moving toward it", () => {
        const plan = planMarcher(
            input([...repeat<Count>(4, [STEP, 0]), "hold"], {
                heading: SIDE2,
                x0: -10,
            }),
        );
        expect(clipPerCount(plan)[1]).toBe("8to5");
    });

    it("slides with the upper body held when the travel is across the facing", () => {
        // facing the backfield, travel toward side 2: to the performer's right
        const plan = planMarcher(
            input([...repeat<Count>(4, [STEP, 0]), "hold"], {
                heading: BACK,
                x0: 10,
            }),
        );
        // away from the 50, but the 50 rule is for the front facing only
        expect(clipPerCount(plan)[1]).toBe("slideR8to5");
    });

    it("lands on the dot facing the backfield", () => {
        const inp = input([...repeat<Count>(8, [0, -STEP]), "hold", "hold"], {
            heading: BACK,
        });
        const plan = planMarcher(inp);
        const end = body(plan, inp, 9.5);
        expect(end.x).toBeCloseTo(end.drillX, 9);
        expect(end.z).toBeCloseTo(end.drillZ, 9);
        let worst = 0;
        for (let c = 0; c <= 10; c += 0.05) {
            const b = body(plan, inp, c);
            worst = Math.max(worst, Math.hypot(b.x - b.drillX, b.z - b.drillZ));
        }
        expect(worst).toBeLessThan(0.3);
    });

    it("eases the turn between count boundaries, the short way round", () => {
        const plan = planMarcher(
            input(repeat(4, "hold" as const), {
                heading: [0, 0, SIDE2, SIDE2, SIDE2],
            }),
        );
        expect(headingAt(plan, 1)).toBeCloseTo(0, 9);
        expect(headingAt(plan, 1.5)).toBeCloseTo(SIDE2 / 2, 9);
        expect(headingAt(plan, 2)).toBeCloseTo(SIDE2, 9);
        const wrap = planMarcher(
            input(repeat(2, "hold" as const), {
                heading: [(170 * Math.PI) / 180, (-170 * Math.PI) / 180, 0],
            }),
        );
        // 170 to -170 degrees passes through 180, not through 0
        expect(Math.abs(headingAt(wrap, 0.5))).toBeCloseTo(Math.PI, 9);
    });

    it("keeps the slide-to-the-50 rule with the front facing", () => {
        const plan = planMarcher(
            input([...repeat<Count>(4, [STEP, 0]), "hold"], {
                heading: 0,
                x0: 10,
            }),
        );
        expect(clipPerCount(plan)[1]).toBe("back8to5");
    });
});

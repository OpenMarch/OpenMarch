import { describe, expect, it } from "vitest";
import { compileCues, type CueInput } from "@openmarch/core";
import { marcherCueInputs } from "../cueInputs";
import { headingAt, type MarcherPlan } from "../planner";

const DEG = Math.PI / 180;

/** Drill from a start point and per-count moves (+x side 2, +z toward the audience). */
function drill(
    counts: ([dx: number, dz: number] | "hold")[],
    x0 = 0,
    z0 = -20,
): Float64Array {
    const p = new Float64Array((counts.length + 1) * 2);
    let x = x0;
    let z = z0;
    p[0] = x;
    p[1] = z;
    counts.forEach((c, k) => {
        if (c !== "hold") {
            x += c[0];
            z += c[1];
        }
        p[(k + 1) * 2] = x;
        p[(k + 1) * 2 + 1] = z;
    });
    return p;
}

const holds = (n: number) => Array.from({ length: n }, () => "hold" as const);

/** Compiles `cues` for one marcher (id 1) over as many counts as the drill has. */
function inputs(
    positions: Float64Array,
    cues: Omit<CueInput, "target" | "kind">[] = [],
    stepOffFoot?: "left" | "right",
) {
    const K = positions.length / 2 - 1;
    const compiled = compileCues({
        beats: Array.from({ length: K }, (_, i) => ({
            id: 100 + i,
            duration: 0.5,
        })),
        marchers: [
            {
                id: 1,
                section: "Trumpet",
                tagIds: [],
                drillOrder: 0,
                carries: "winds",
            },
        ],
        cues: cues.map((c) => ({
            kind: "state" as const,
            target: { kind: "band" as const },
            ...c,
        })),
        showDefaults: stepOffFoot ? { stepOffFoot } : undefined,
    });
    return marcherCueInputs(compiled, 1, positions);
}

/** A cue on show count `count`. */
const on = (
    id: number,
    count: number,
    value: string,
    extra: Partial<CueInput> = {},
) => ({
    id,
    channel: value.startsWith("builtin:feet")
        ? ("feet" as const)
        : value.startsWith("builtin:body")
          ? ("body" as const)
          : ("facing" as const),
    beatId: 100 + count,
    value,
    ...extra,
});

describe("with no cues", () => {
    const out = inputs(drill(holds(8)));

    it("steps in single time, straight leg, standing on holds, off the left foot", () => {
        expect(out.feet).toHaveLength(8);
        for (const f of out.feet)
            expect(f).toEqual({
                pace: "single",
                moving: "straightLeg",
                onHolds: "stand",
                stepOffFoot: "left",
            });
    });

    it("faces the audience at every count boundary", () => {
        expect(out.heading).toHaveLength(9);
        expect([...out.heading]).toEqual(Array(9).fill(0));
    });

    it("steps off on the show's foot", () => {
        const right = inputs(drill(holds(4)), [], "right");
        expect(right.feet.every((f) => f.stepOffFoot === "right")).toBe(true);
    });
});

describe("Feet cues", () => {
    it("change the pace from the step that lands on the cue's click", () => {
        // performer-behavior.md 2.2: a cue's instant is its count's click,
        // where that count's step lands (planner count 4)
        const out = inputs(drill(holds(8)), [
            on(1, 4, "builtin:feet.step", { settings: { pace: "half" } }),
        ]);
        expect(out.feet.map((f) => f.pace)).toEqual([
            "single",
            "single",
            "single",
            "single",
            "half",
            "half",
            "half",
            "half",
        ]);
    });

    it("carry the techniques and the step-off foot", () => {
        const out = inputs(drill(holds(4)), [
            on(1, 0, "builtin:feet.step", {
                settings: {
                    moving: "highStep",
                    onHolds: "highMarkTime",
                    stepOffFoot: "right",
                },
            }),
        ]);
        expect(out.feet[2]).toEqual({
            pace: "single",
            moving: "highStep",
            onHolds: "highMarkTime",
            stepOffFoot: "right",
        });
    });

    it("stand while a kneel takes the feet over", () => {
        const out = inputs(drill(holds(8)), [
            on(1, 0, "builtin:feet.step", {
                settings: { onHolds: "markTime" },
            }),
            on(2, 4, "builtin:body.kneel"),
        ]);
        expect(out.feet[1].onHolds).toBe("markTime");
        // kneel takes 3 counts, landing on 4: the feet are its from count 2
        expect(out.feet[6].onHolds).toBe("stand");
    });
});

describe("Facing cues", () => {
    // The marchers run a count ahead of the show (STEP_AHEAD): the body at
    // plan boundary b is what the show draws at count b - 1.
    it("turn to the back over the transition, landing on the cue's click", () => {
        // "back on 6", 2 counts: turning from the click of 5 to the click of 6
        const out = inputs(drill(holds(10)), [on(1, 6, "builtin:facing.back")]);
        const h = [...out.heading];
        expect(h.slice(0, 7)).toEqual(Array(7).fill(0)); // show clicks -1..5
        expect(Math.abs(h[7])).toBeCloseTo(Math.PI, 9); // show click 6
        expect(Math.abs(h[10])).toBeCloseTo(Math.PI, 9);
    });

    it("snap in fixed time: 0.2 s before the click, not over the count", () => {
        // "back on 6" as a snap, at 120 bpm: 0.2 s is 0.4 of a count
        const out = inputs(drill(holds(10)), [
            on(1, 6, "builtin:facing.back", { transitionLength: 1 }),
        ]);
        expect(out.turnSpan[7]).toBeCloseTo(0.4, 9); // into show click 6
        expect(out.turnSpan[6]).toBe(1);
        const plan = {
            events: [],
            counts: 11,
            headings: out.heading,
            turnSpan: out.turnSpan,
        } as MarcherPlan;
        // plan boundary 7 is show click 6: still front at show count 5.5
        expect(headingAt(plan, 6.5)).toBeCloseTo(0, 9);
        expect(headingAt(plan, 6.6)).toBeCloseTo(0, 9);
        // halfway through the 0.4 counts, halfway round
        expect(Math.abs(headingAt(plan, 6.8))).toBeCloseTo(Math.PI / 2, 9);
        expect(Math.abs(headingAt(plan, 7))).toBeCloseTo(Math.PI, 9);
    });

    it("ease through a longer transition, halfway at its middle", () => {
        // side 2 on 6 over 5 counts: from the click of 2 to the click of 6
        const out = inputs(drill(holds(10)), [
            on(1, 6, "builtin:facing.side2", { transitionLength: 5 }),
        ]);
        expect(out.heading[3]).toBeCloseTo(0, 9); // show click 2
        expect(out.heading[5]).toBeCloseTo(45 * DEG, 9); // show click 4
        expect(out.heading[7]).toBeCloseTo(90 * DEG, 9); // show click 6
        // and in between the clicks it only moves forward
        for (let b = 3; b < 7; b++)
            expect(out.heading[b + 1]).toBeGreaterThan(out.heading[b]);
    });

    it("face side 1, side 2, and an angle", () => {
        const at = (value: string, settings?: Record<string, unknown>) =>
            inputs(drill(holds(4)), [on(1, 0, value, { settings })]).heading[2];
        expect(at("builtin:facing.side1")).toBeCloseTo(-90 * DEG, 9);
        expect(at("builtin:facing.side2")).toBeCloseTo(90 * DEG, 9);
        // degrees: 0 the audience, 90 side 2, 180 the backfield
        expect(at("builtin:facing.angle", { degrees: 45 })).toBeCloseTo(
            45 * DEG,
            9,
        );
        expect(at("builtin:facing.angle", { degrees: 270 })).toBeCloseTo(
            -90 * DEG,
            9,
        );
    });

    it("face a point on the field from wherever the marcher stands", () => {
        // standing at (0, -20); the point is 10 m toward side 2
        const out = inputs(drill(holds(4)), [
            on(1, 0, "builtin:facing.point", { settings: { x: 10, y: -20 } }),
        ]);
        expect(out.heading[2]).toBeCloseTo(90 * DEG, 9);
    });

    it("face the direction of travel, and keep it on a hold", () => {
        // 4 counts toward the backfield (-z), then a hold
        const out = inputs(
            drill([...Array(4).fill([0, -0.5715]), ...holds(4)]),
            [on(1, 0, "builtin:facing.travel")],
        );
        for (let b = 1; b <= 8; b++)
            expect(Math.abs(out.heading[b])).toBeCloseTo(Math.PI, 9);
    });
});

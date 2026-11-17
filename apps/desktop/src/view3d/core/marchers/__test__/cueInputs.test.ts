// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compileCues, type CompileInput, type CueInput } from "@openmarch/core";
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
    cues: Omit<CueInput, "marcherIds">[] = [],
    stepOffFoot?: "left" | "right",
    extra: Partial<CompileInput> = {},
) {
    const K = positions.length / 2 - 1;
    const compiled = compileCues({
        beats: Array.from({ length: K }, (_, i) => ({
            id: 100 + i,
            duration: 0.5,
        })),
        marchers: [{ id: 1, section: "Trumpet", carries: "winds" }],
        cues: cues.map((c) => ({ marcherIds: [1], ...c })),
        ...extra,
    });
    return marcherCueInputs(compiled, 1, positions, { stepOffFoot });
}

/** A cue on show count `count`. */
const on = (
    id: number,
    count: number,
    value: string,
    extra: Partial<CueInput> = {},
) => ({
    id,
    type: value.startsWith("builtin:posture") ? "posture" : "facing",
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

describe("the hold style", () => {
    // the band travels on counts 2-5
    const bandTravels = (c: number) => c >= 2 && c < 6;

    /** The show set to mark time on holds (Show settings). */
    const markTime = {
        showDefaults: { holdWhileBandMoves: "markTime" },
    } as const;

    it("stands by default, though the band moves (ADR 0015 D-5)", () => {
        const out = inputs(drill(holds(8)), [], undefined, { bandTravels });
        expect(out.feet.every((f) => f.onHolds === "stand")).toBe(true);
    });

    it("marks time on the counts the band moves when the show asks, from the compile's hold style", () => {
        const out = inputs(drill(holds(8)), [], undefined, {
            bandTravels,
            ...markTime,
        });
        expect(out.feet.map((f) => f.onHolds)).toEqual([
            "stand",
            "stand",
            "markTime",
            "markTime",
            "markTime",
            "markTime",
            "stand",
            "stand",
        ]);
    });

    it("takes the show's own style", () => {
        const out = inputs(drill(holds(8)), [], undefined, {
            bandTravels,
            showDefaults: { holdWhileBandMoves: "highMarkTime" },
        });
        expect(out.feet[3].onHolds).toBe("highMarkTime");
    });

    it("takes a hold's own style over the show's, for its counts", () => {
        const out = inputs(drill(holds(8)), [], undefined, {
            bandTravels,
            ...markTime,
            holdStyles: [
                { marcherId: 1, from: 3, to: 5, style: "stand" },
                { marcherId: 1, from: 6, to: 8, style: "highMarkTime" },
            ],
        });
        expect(out.feet.map((f) => f.onHolds)).toEqual([
            "stand",
            "stand",
            "markTime",
            "stand",
            "stand",
            "markTime",
            "highMarkTime",
            "highMarkTime",
        ]);
    });

    it("stands under a kneel, from the count it starts going down", () => {
        const out = inputs(
            drill(holds(8)),
            [on(2, 5, "builtin:posture.kneel")],
            undefined,
            { bandTravels: () => true, ...markTime },
        );
        expect(out.feet[1].onHolds).toBe("markTime");
        // kneel takes 3 counts, landing on 5: the feet are its from count 3
        expect(out.feet[2].onHolds).toBe("markTime");
        expect(out.feet[3].onHolds).toBe("stand");
        expect(out.feet[7].onHolds).toBe("stand");
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
            on(1, 6, "builtin:facing.back", { transition: 1 }),
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
            on(1, 6, "builtin:facing.side2", { transition: 5 }),
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

    it("turn back when a momentary cue ends", () => {
        // back for counts 4 and 5, as a snap
        const out = inputs(drill(holds(10)), [
            on(1, 4, "builtin:facing.back", { length: 2, transition: 1 }),
        ]);
        const h = [...out.heading];
        expect(h[4]).toBeCloseTo(0, 9); // show click 3
        expect(Math.abs(h[5])).toBeCloseTo(Math.PI, 9); // show click 4
        expect(Math.abs(h[6])).toBeCloseTo(Math.PI, 9);
        expect(h[7]).toBeCloseTo(0, 9); // show click 6: the front again
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

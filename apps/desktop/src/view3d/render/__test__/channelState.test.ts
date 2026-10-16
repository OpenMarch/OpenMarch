import { describe, expect, it } from "vitest";
import { compileCues, type CueInput } from "@openmarch/core";
import {
    STATE_TEXELS,
    emptyState,
    writeChannelState,
    writeFeetState,
} from "../channelState";
import {
    hornEventAt,
    planHornChannel,
} from "@/view3d/core/marchers/hornChannel";
import { hornPlay } from "@/view3d/window/performers/marchers/hornRows";

// 16 counts; count 11 (the one before the click of 12) is twice as slow
const beats = Array.from({ length: 16 }, (_, i) => ({
    id: 100 + i,
    duration: i === 11 ? 1.0 : 0.5,
}));
const secondsPerCount = (k: number) => beats[k].duration;

function hornSegments(cues: CueInput[]) {
    const compiled = compileCues({
        beats,
        marchers: [
            {
                id: 7,
                section: "Trumpet",
                tagIds: [],
                drillOrder: 0,
                carries: "winds",
            },
        ],
        cues,
    });
    return compiled.segments(7, "horn_equipment");
}

const band = { kind: "band" } as const;
const down8: CueInput = {
    id: 1,
    channel: "horn_equipment",
    kind: "state",
    target: band,
    beatId: 108, // count 8
    value: "builtin:horn.down",
    transitionLength: 3,
};
const upSnap12: CueInput = {
    id: 2,
    channel: "horn_equipment",
    kind: "state",
    target: band,
    beatId: 112, // count 12, the library default: a snap
    value: "builtin:horn.up",
};

// The bake's rows, as bakeLayout lays them out: holds are one sample (1/30
// of a count), transitions 30 samples (one count) that the rate stretches.
const rows = {
    "hold:brass:up": { row: 400, frames: 1, counts: 1 / 30 },
    "hold:brass:carry": { row: 402, frames: 1, counts: 1 / 30 },
    "trans:brass:up>carry": { row: 404, frames: 30, counts: 1 },
    "trans:brass:carry>up": { row: 435, frames: 30, counts: 1 },
};

/** The horn texels slot 3 gets at count `c`. */
function hornTexelsAt(cues: CueInput[], c: number) {
    const events = planHornChannel(hornSegments(cues), {
        defaultState: "up",
        secondsPerCount,
    });
    const play = hornPlay(events[hornEventAt(events, c)], "brass", rows);
    const state = emptyState(4);
    writeChannelState(state, 3, "horn", play);
    const o = 3 * STATE_TEXELS * 4;
    return {
        body: Array.from(state.subarray(o + 12, o + 20)),
        horn: Array.from(state.subarray(o + 20, o + 28)),
    };
}

describe("the Horn/Equipment channel state from compiled cues", () => {
    it("plays the default hold, looping, before any cue", () => {
        // (row, samples, counts, phase), (rate, once, prop in body space, -)
        expect(hornTexelsAt([down8], 2).horn).toEqual([
            400,
            1,
            Math.fround(1 / 30),
            0,
            1,
            0,
            0,
            0,
        ]);
    });

    it("plays the transition row once over the counts before the cue's click", () => {
        // 3 counts ending on 8: from the click of 6 to the click of 8. The
        // one-count row at rate 1/2 starts at its time 0 on count 6:
        // phase = -6 x 1/2.
        expect(hornTexelsAt([down8], 7).horn).toEqual([
            404, 30, 1, -3, 0.5, 1, 0, 0,
        ]);
    });

    it("holds the new state from the cue's click", () => {
        expect(hornTexelsAt([down8], 8).horn).toEqual([
            402,
            1,
            Math.fround(1 / 30),
            0,
            1,
            0,
            0,
            0,
        ]);
    });

    it("keys a snap in fixed time: 0.2 s before the click, whatever the tempo", () => {
        // count 11 lasts 1.0 s, so 0.2 s is 0.2 counts: from 11.8 to 12,
        // rate 5, phase -11.8 x 5 = -59
        const at = hornTexelsAt([down8, upSnap12], 11.9).horn;
        expect(at.slice(0, 3)).toEqual([435, 30, 1]);
        expect(at[3]).toBeCloseTo(-59, 4);
        expect(at[4]).toBeCloseTo(5, 6);
        expect(at[5]).toBe(1);
        // just before the snap starts, still the hold before it
        expect(hornTexelsAt([down8, upSnap12], 11.7).horn[0]).toBe(402);
        expect(hornTexelsAt([down8, upSnap12], 12).horn[0]).toBe(400);
    });

    it("leaves the Body channel off (it follows the Feet) while nothing drives it", () => {
        expect(hornTexelsAt([down8], 7).body).toEqual([
            -1, 0, 0, 0, 0, 0, 0, 0,
        ]);
    });
});

describe("the Feet channel state", () => {
    it("writes a clip, its blend partner and its leg turn", () => {
        const state = emptyState(2);
        writeFeetState(state, 1, {
            row: { row: 31, frames: 30, counts: 1 },
            row2: { row: 62, frames: 30, counts: 1 },
            weight: 0.25,
            phase: -4,
            rate: 0.5,
            legYaw: [0, 1.5, 0.25, 0.75],
        });
        const o = STATE_TEXELS * 4;
        expect(Array.from(state.subarray(o, o + 12))).toEqual([
            31, 30, 1, -4, 0.5, 62, 0.25, 0, 0, 1.5, 0.25, 0.75,
        ]);
    });
});

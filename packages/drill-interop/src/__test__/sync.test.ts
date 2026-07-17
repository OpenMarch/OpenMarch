import { describe, expect, it } from "vitest";
import {
    audioOffsetSecondsFromSync,
    beatDurationsFromSyncTimestamps,
    readAudioSync,
} from "../sync";

/** Minimal SYNC payload: path "a.wav" (5 units) + 3 timestamps. */
function buildSyncPayload(timestamps: number[]): Uint8Array {
    const path = "a.wav";
    const bytes = new Uint8Array(
        2 + path.length * 2 + 2 + timestamps.length * 8,
    );
    const view = new DataView(bytes.buffer);
    let o = 0;
    view.setUint16(o, path.length, false);
    o += 2;
    for (const ch of path) {
        view.setUint16(o, ch.charCodeAt(0), false);
        o += 2;
    }
    view.setUint16(o, timestamps.length, false);
    o += 2;
    for (const t of timestamps) {
        view.setFloat64(o, t, false);
        o += 8;
    }
    return bytes;
}

describe("readAudioSync", () => {
    it("reads path and timestamps", () => {
        const sync = readAudioSync(buildSyncPayload([8.061, 8.511, 8.959]));
        expect(sync?.path).toBe("a.wav");
        expect(sync?.timestamps).toEqual([8.061, 8.511, 8.959]);
    });
});

describe("beatDurationsFromSyncTimestamps", () => {
    it("uses deltas between timestamps", () => {
        const durations = beatDurationsFromSyncTimestamps({
            timestamps: [8, 8.5, 9.0, 9.5],
            totalCounts: 3,
            fallbackDuration: 0.5,
        });
        expect(durations).toEqual([0.5, 0.5, 0.5]);
    });

    it("extends the last delta when counts outnumber timestamps", () => {
        expect(
            beatDurationsFromSyncTimestamps({
                timestamps: [0, 0.4, 0.8],
                totalCounts: 5,
                fallbackDuration: 0.5,
            }),
        ).toEqual([0.4, 0.4, 0.4, 0.4, 0.4]);
    });

    it("falls back when sync is missing", () => {
        expect(
            beatDurationsFromSyncTimestamps({
                timestamps: undefined,
                totalCounts: 3,
                fallbackDuration: 0.5,
            }),
        ).toEqual([0.5, 0.5, 0.5]);
    });
});

describe("audioOffsetSecondsFromSync", () => {
    it("returns negative lead-in so count 0 aligns after trim", () => {
        expect(audioOffsetSecondsFromSync([8.061, 8.5])).toBeCloseTo(-8.061);
    });

    it("returns 0 when there is no lead-in", () => {
        expect(audioOffsetSecondsFromSync([0, 0.5])).toBe(0);
        expect(audioOffsetSecondsFromSync(undefined)).toBe(0);
    });
});

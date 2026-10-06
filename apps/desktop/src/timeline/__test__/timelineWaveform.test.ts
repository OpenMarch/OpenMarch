import { describe, expect, it } from "vitest";
import { audioEnvelope, peaksByBeat } from "../timelineWaveform";

/** A one-channel buffer of `seconds` at `sampleRate`, loud (0.5) only in `[from, to)` seconds */
const burst = (
    seconds: number,
    from: number,
    to: number,
    sampleRate = 1000,
) => {
    const data = new Float32Array(seconds * sampleRate);
    for (let i = from * sampleRate; i < to * sampleRate; i++)
        data[i] = i % 2 ? 0.5 : -0.5;
    return {
        numberOfChannels: 1,
        sampleRate,
        length: data.length,
        getChannelData: () => data,
    };
};

describe("the timeline waveform (UI-12)", () => {
    it("keeps the loudest sample of each window, across channels", () => {
        const left = new Float32Array([0.1, -0.4, 0.2, 0]);
        const right = new Float32Array([0, 0, -0.9, 0.3]);
        const envelope = audioEnvelope(
            {
                numberOfChannels: 2,
                sampleRate: 4,
                length: 4,
                getChannelData: (c) => (c === 0 ? left : right),
            },
            2,
        );
        expect(envelope.rate).toBe(2);
        expect([...envelope.peaks].map((p) => +p.toFixed(2))).toEqual([
            0.4, 0.9,
        ]);
    });

    it("matches a sample-by-sample envelope, including a short last window", () => {
        // 2 channels of 1003 samples at 1000 Hz, 7-sample windows: the last holds 2 samples
        let seed = 7;
        const noise = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647 - 0.5;
        };
        const channels = [0, 1].map(() =>
            Float32Array.from({ length: 1003 }, noise),
        );
        const buffer = {
            numberOfChannels: 2,
            sampleRate: 1000,
            length: 1003,
            getChannelData: (c: number) => channels[c]!,
        };
        const window = Math.round(1000 / 140);
        const expected = new Float32Array(Math.ceil(1003 / window));
        for (const data of channels)
            data.forEach((sample, i) => {
                const slot = Math.floor(i / window);
                expected[slot] = Math.max(expected[slot]!, Math.abs(sample));
            });
        const envelope = audioEnvelope(buffer, 140);
        expect(envelope.rate).toBe(1000 / window);
        expect([...envelope.peaks]).toEqual([...expected]);
    });

    it("puts the audio under the beats it plays in, scaled to the loudest moment, after the hidden beat 0", () => {
        // Beat 0 has no time; beats 1-4 are a second each. Sound only during beat 3 (2s to 3s)
        const beats = [
            { timestamp: 0, duration: 0 },
            ...[0, 1, 2, 3].map((t) => ({ timestamp: t, duration: 1 })),
        ];
        const peaks = peaksByBeat(
            audioEnvelope(burst(4, 2, 3), 100),
            beats,
            1,
            4,
        );
        expect(peaks).toHaveLength(4);
        expect(peaks[0]).toEqual([0, 0, 0, 0]);
        expect(peaks[2]).toEqual([1, 1, 1, 1]);
        expect(peaks[3]).toEqual([0, 0, 0, 0]);
    });

    it("gives beats past the end of the audio no peaks", () => {
        const beats = [0, 1, 2].map((t) => ({ timestamp: t, duration: 1 }));
        const peaks = peaksByBeat(
            audioEnvelope(burst(1, 0, 1), 100),
            beats,
            0,
            2,
        );
        expect(peaks[0]).toEqual([1, 1]);
        expect(peaks[1]).toEqual([]);
        expect(peaks[2]).toEqual([]);
    });
});

describe("the waveform's scale (UI-12)", () => {
    it("draws loudness in decibels, so a quiet passage stays visible next to a loud one", () => {
        // One beat a second: beat 0 at full level, beat 1 at a tenth of it (-20 dB)
        const data = new Float32Array(2000);
        for (let i = 0; i < 1000; i++) data[i] = i % 2 ? 1 : -1;
        for (let i = 1000; i < 2000; i++) data[i] = i % 2 ? 0.1 : -0.1;
        const envelope = audioEnvelope(
            {
                numberOfChannels: 1,
                sampleRate: 1000,
                length: data.length,
                getChannelData: () => data,
            },
            100,
        );
        const beats = [0, 1].map((t) => ({ timestamp: t, duration: 1 }));
        const [loud, quiet] = peaksByBeat(envelope, beats, 0, 1);
        expect(loud![0]).toBeCloseTo(1);
        // (-20 + 42) / 42, where a linear scale would give 0.1
        expect(quiet![0]).toBeCloseTo(22 / 42);
    });
});

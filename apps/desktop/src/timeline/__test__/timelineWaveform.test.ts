import { describe, expect, it } from "vitest";
import {
    audioEnvelope,
    forEachWaveformBar,
    parseWaveformStyle,
    peaksByBeat,
    WAVEFORM_PEAKS_PER_BEAT,
    WAVEFORM_PRECISE_BARS_PER_BEAT,
    waveformBarLevel,
    waveformLevelDb,
    type WaveformStyle,
} from "../timelineWaveform";

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

describe("the waveform's scale", () => {
    it("draws loudness linearly against the loudest moment, as the old WaveSurfer waveform did", () => {
        // One beat a second: beat 0 at full level, beat 1 at a tenth of it
        const data = new Float32Array(2000);
        for (let i = 0; i < 1000; i++) data[i] = i % 2 ? 0.8 : -0.8;
        for (let i = 1000; i < 2000; i++) data[i] = i % 2 ? 0.08 : -0.08;
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
        expect(quiet![0]).toBeCloseTo(0.1);
    });
});

describe("the waveform's bars", () => {
    const peaks = [[0.1, 0.2, 0.3, 0.4], [0.9, 0, 0, 0], []];

    it("takes the loudest peak a bar covers, across a beat boundary", () => {
        expect(waveformBarLevel(peaks, 0.5, 0.75)).toBeCloseTo(0.3);
        expect(waveformBarLevel(peaks, 0.6, 1.1)).toBeCloseTo(0.9);
        expect(waveformBarLevel(peaks, 1.25, 1.9)).toBe(0);
    });

    it("takes the peak under a bar narrower than a slice", () => {
        expect(waveformBarLevel(peaks, 0.26, 0.27)).toBeCloseTo(0.2);
    });

    it("stops at a bar edge that float math puts just past a beat line", () => {
        // 0.7 + 0.3 is 0.9999999999999999 and 0.1 * 3 is 0.30000000000000004
        expect(waveformBarLevel(peaks, 0.75, 0.1 * 3 + 0.7)).toBeCloseTo(0.4);
        expect(waveformBarLevel(peaks, 0, 0.1 * 3 + 0.7)).toBeCloseTo(0.4);
        expect(waveformBarLevel(peaks, 0.5, 1 + 1e-12)).toBeCloseTo(0.4);
    });

    it("is silent past the audio and past the show", () => {
        expect(waveformBarLevel(peaks, 2, 2.5)).toBe(0);
        expect(waveformBarLevel(peaks, 5, 6)).toBe(0);
    });
});

describe("the precise waveform style", () => {
    it("draws loudness in decibels, so a quiet passage stays visible next to a loud one", () => {
        expect(waveformLevelDb(1)).toBeCloseTo(1);
        // A tenth of the loudest moment is -20 dB: (-20 + 42) / 42, where linear gives 0.1
        expect(waveformLevelDb(0.1)).toBeCloseTo(22 / 42);
        expect(waveformLevelDb(0.001)).toBe(0);
        expect(waveformLevelDb(0)).toBe(0);
    });

    it("gives each of a beat's bars the loudest of the peaks in its slice", () => {
        const perBar = WAVEFORM_PEAKS_PER_BEAT / WAVEFORM_PRECISE_BARS_PER_BEAT;
        const beat = Array.from({ length: WAVEFORM_PEAKS_PER_BEAT }, (_, i) =>
            i === perBar ? 0.7 : 0.1,
        );
        const bar = (index: number) =>
            waveformBarLevel(
                [beat],
                index / WAVEFORM_PRECISE_BARS_PER_BEAT,
                (index + 1) / WAVEFORM_PRECISE_BARS_PER_BEAT,
            );
        expect(bar(0)).toBeCloseTo(0.1);
        expect(bar(1)).toBeCloseTo(0.7);
        expect(bar(2)).toBeCloseTo(0.1);
    });
});

describe("the waveform style setting", () => {
    it("keeps a known style and falls back to simplified otherwise", () => {
        expect(parseWaveformStyle("precise")).toBe("precise");
        expect(parseWaveformStyle("simplified")).toBe("simplified");
        expect(parseWaveformStyle("hidden")).toBe("hidden");
        expect(parseWaveformStyle(undefined)).toBe("simplified");
        expect(parseWaveformStyle("fancy")).toBe("simplified");
    });
});

describe("the waveform's bar layout", () => {
    // Two beats: a full-level beat, then a beat at a tenth of it
    const peaks = [
        Array<number>(WAVEFORM_PEAKS_PER_BEAT).fill(1),
        Array<number>(WAVEFORM_PEAKS_PER_BEAT).fill(0.1),
    ];
    const layout = (style: WaveformStyle, from = 0, to = 64) => {
        const bars: [number, number, number][] = [];
        forEachWaveformBar(peaks, style, 32, from, to, (x, width, level) =>
            bars.push([x, width, level]),
        );
        return bars;
    };

    it("puts simplified bars every 3px, 2px wide, on a linear scale", () => {
        const bars = layout("simplified");
        expect(bars.slice(0, 2).map(([x, width]) => [x, width])).toEqual([
            [0, 2],
            [3, 2],
        ]);
        expect(bars[0]![2]).toBeCloseTo(1);
        expect(bars.find(([x]) => x >= 33)![2]).toBeCloseTo(0.1);
    });

    it("puts precise bars on each beat's slices, on the decibel scale", () => {
        const bars = layout("precise");
        expect(bars).toHaveLength(2 * WAVEFORM_PRECISE_BARS_PER_BEAT);
        // 32px a beat: 4px slices, each a 3px bar and a 1px gap
        expect(bars.slice(0, 2).map(([x, width]) => [x, width])).toEqual([
            [0, 3],
            [4, 3],
        ]);
        expect(bars[WAVEFORM_PRECISE_BARS_PER_BEAT]![0]).toBe(32);
        expect(bars[WAVEFORM_PRECISE_BARS_PER_BEAT]![2]).toBeCloseTo(22 / 42);
    });

    it("lays out only the bars in the span asked for, and none past the audio", () => {
        expect(layout("simplified", 30, 36).map(([x]) => x)).toEqual([30, 33]);
        expect(layout("simplified", 66, 96)).toEqual([]);
        expect(layout("precise", 64, 96)).toEqual([]);
    });

    it("lays out no bars when the waveform is hidden", () => {
        expect(layout("hidden")).toEqual([]);
    });
});

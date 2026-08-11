import { describe, expect, it } from "vitest";
import { prepareAudioChannels, sliceAudioChannels } from "../videoExportAudio";

const SAMPLE_RATE = 1000; // 1 sample per millisecond keeps the math readable

/** Audio ramp [1, 2, 3, ...] so positions are easy to assert */
const ramp = (length: number) => Float32Array.from({ length }, (_, i) => i + 1);

describe("prepareAudioChannels", () => {
    it("pads short audio with trailing silence to the exact duration", () => {
        const [result] = prepareAudioChannels([ramp(500)], SAMPLE_RATE, 0, 2);

        expect(result?.length).toBe(2000);
        expect(result?.[0]).toBe(1);
        expect(result?.[499]).toBe(500);
        expect(result?.[500]).toBe(0);
        expect(result?.[1999]).toBe(0);
    });

    it("trims long audio to the exact duration", () => {
        const [result] = prepareAudioChannels([ramp(5000)], SAMPLE_RATE, 0, 2);

        expect(result?.length).toBe(2000);
        expect(result?.[1999]).toBe(2000);
    });

    it("pads silence at the start for a positive offset", () => {
        const [result] = prepareAudioChannels(
            [ramp(1000)],
            SAMPLE_RATE,
            0.5,
            2,
        );

        expect(result?.length).toBe(2000);
        // First 500 samples are silence, then the audio starts
        expect(result?.[499]).toBe(0);
        expect(result?.[500]).toBe(1);
        expect(result?.[1499]).toBe(1000);
        expect(result?.[1500]).toBe(0);
    });

    it("trims from the start for a negative offset", () => {
        const [result] = prepareAudioChannels(
            [ramp(1000)],
            SAMPLE_RATE,
            -0.5,
            2,
        );

        expect(result?.length).toBe(2000);
        // Audio starts 500 samples in
        expect(result?.[0]).toBe(501);
        expect(result?.[499]).toBe(1000);
        expect(result?.[500]).toBe(0);
    });

    it("processes every channel identically", () => {
        const channels = prepareAudioChannels(
            [ramp(100), ramp(100)],
            SAMPLE_RATE,
            0,
            1,
        );

        expect(channels).toHaveLength(2);
        expect(channels[0]).toEqual(channels[1]);
    });
});

describe("sliceAudioChannels", () => {
    it("splits audio into one-second slices with a partial final slice", () => {
        const slices = sliceAudioChannels([ramp(2500)], SAMPLE_RATE, 1);

        expect(slices).toHaveLength(3);
        expect(slices?.[0]?.[0]?.length).toBe(1000);
        expect(slices?.[1]?.[0]?.length).toBe(1000);
        expect(slices?.[2]?.[0]?.length).toBe(500);
        // Slices are consecutive views over the source data
        expect(slices?.[0]?.[0]?.[999]).toBe(1000);
        expect(slices?.[1]?.[0]?.[0]).toBe(1001);
        expect(slices?.[2]?.[0]?.[499]).toBe(2500);
    });

    it("keeps channels aligned across slices", () => {
        const slices = sliceAudioChannels(
            [ramp(1500), ramp(1500)],
            SAMPLE_RATE,
            1,
        );

        for (const slice of slices) {
            expect(slice).toHaveLength(2);
            expect(slice?.[0]?.length).toBe(slice?.[1]?.length);
        }
    });

    it("returns no slices for empty audio", () => {
        expect(sliceAudioChannels([], SAMPLE_RATE)).toHaveLength(0);
        expect(
            sliceAudioChannels([new Float32Array(0)], SAMPLE_RATE),
        ).toHaveLength(0);
    });
});

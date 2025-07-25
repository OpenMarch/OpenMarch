import fs from "fs";
import wav from "node-wav";
import type { Measure, Beat } from "./utils.ts";
import { SAMPLE_RATE, padSamples } from "./tone_creator.ts";
import {
    beatClickDefault,
    measureClickDefault,
    sharpBeatClick,
    sharpMeasureClick,
    smoothBeatClick,
    smoothMeasureClick,
} from "./tones.ts";

/**
 * Generate a metronome .wav file for a given list of Measure objects.
 *
 * @param measures Array of Measure objects
 * @param filename Output WAV file path
 */
export function createMetronomeWav(measures: Measure[], filename: string) {
    const beats: Beat[] = measures.flatMap((m) => m.beats);
    if (beats.length === 0) throw new Error("No beats provided.");

    // Sort beats by timestamp to ensure order
    beats
        .filter((b) => b.duration > 0)
        .sort((a, b) => a.timestamp - b.timestamp);
    const click = beatClickDefault();

    const lastBeat = beats[beats.length - 1];
    const totalDuration = lastBeat!.timestamp + 1;
    const totalSamples = Math.ceil(totalDuration * SAMPLE_RATE);
    const output = new Float32Array(totalSamples);

    // Add click sound at each beat's timestamp
    for (const beat of beats) {
        const startSample = Math.floor(beat.timestamp * SAMPLE_RATE);
        const endSample = Math.min(startSample + click.length, output.length);

        for (let i = 0; i < endSample - startSample; i++) {
            output[startSample + i]! += click[i]!;
        }
    }

    // Normalize output to prevent clipping
    let maxAbs = 0;
    for (let i = 0; i < output.length; i++) {
        const absVal = Math.abs(output[i]!);
        if (absVal > maxAbs) maxAbs = absVal;
    }
    if (maxAbs > 1) {
        for (let i = 0; i < output.length; i++) {
            output[i]! /= maxAbs;
        }
    }

    // Encode to WAV and write to disk
    const buffer = wav.encode([output], {
        sampleRate: SAMPLE_RATE,
        float: true,
        bitDepth: 32,
    });

    fs.writeFileSync(filename, buffer);
    console.log(`Metronome .wav created: ${filename}`);
}

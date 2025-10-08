import { type Measure, type Beat } from "./utils";
import { SAMPLE_RATE } from "./tone_creator";
import { BEAT_STYLE_FUNCTIONS, type BeatStyleId } from "./tones";

/**
 * Generate a metronome .wav file for a given list of Measure objects.
 *
 * @param measures Array of Measure objects
 * @param beats Optional array of Beat objects. If not provided, beats will be extracted from measures.
 * @param accentMeasure Whether to use an accented click for the first beat of each measure
 * @param onlyMeasuresClicks Whether to play clicks only for the first beat of each measure
 * @param beatStyle The style of the beat click sound to use
 * @returns
 */
export function createMetronomeWav(
    measures: Measure[],
    beats?: Beat[],
    accentMeasure: boolean = true,
    onlyMeasuresClicks: boolean = false,
    beatStyle: BeatStyleId = "default",
): Float32Array {
    // Extract beats from measures if not provided
    const allBeats = beats ?? measures.flatMap((m) => m.beats);

    if (allBeats.length === 0) throw new Error("No beats provided.");

    // Sort beats by timestamp to ensure order, find indexes of first-measure beats
    allBeats
        .filter((b) => b.duration > 0)
        .sort((a, b) => a.timestamp - b.timestamp);
    const firstBeatIndices = new Set<number>(
        measures.map((m) => m.beats[0]!.index),
    );

    // Get click sounds
    const click = BEAT_STYLE_FUNCTIONS[beatStyle].beat();
    const accentClick = accentMeasure
        ? BEAT_STYLE_FUNCTIONS[beatStyle].measure()
        : click;

    // Create the output array
    const lastBeat = allBeats[allBeats.length - 1];
    const totalDuration = lastBeat!.timestamp + 1;
    const totalSamples = Math.ceil(totalDuration * SAMPLE_RATE);
    const output = new Float32Array(totalSamples);

    // Add clicks sound at each Beat's timestamp
    for (const beat of allBeats) {
        const startSample = Math.floor(beat.timestamp * SAMPLE_RATE);

        // Skip beats if only playing measure clicks
        if (onlyMeasuresClicks && !firstBeatIndices.has(beat.index)) continue;

        // Adjust click if required
        const beatClick = firstBeatIndices.has(beat.index)
            ? accentClick
            : click;

        const endSample = Math.min(
            startSample + beatClick.length,
            output.length,
        );

        // Add click
        for (let i = 0; i < endSample - startSample; i++) {
            output[startSample + i]! += beatClick[i]!;
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

    return output;
}

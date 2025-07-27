import fs from "fs";
import wav from "node-wav";
import { SAMPLE_RATE } from "./tone_creator.ts";

/**
 * Utility function to save a sound as a WAV file.
 * @param samples
 * @param filename
 */
export function saveWav(samples: Float32Array, filename: string) {
    const buffer = wav.encode([samples], {
        sampleRate: SAMPLE_RATE,
        float: true,
        bitDepth: 32,
    });

    fs.writeFileSync(filename, buffer);
    console.log(`Saved ${filename}`);
}

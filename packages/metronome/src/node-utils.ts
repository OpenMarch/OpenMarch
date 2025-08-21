import fs from "fs";
import path from "path";
import wav from "node-wav";
import { SAMPLE_RATE } from "./tone_creator.ts";

/**
 * Utility function to save a sound as a WAV file.
 * @param samples
 * @param filename
 */
export function saveWav(samples: Float32Array, filename: string) {
    // Ensure the test-output directory exists
    const testOutputDir = path.join(process.cwd(), "test-output");
    if (!fs.existsSync(testOutputDir)) {
        fs.mkdirSync(testOutputDir, { recursive: true });
    }

    // Save to test-output directory
    const outputPath = path.join(testOutputDir, filename);
    const buffer = wav.encode([samples], {
        sampleRate: SAMPLE_RATE,
        float: true,
        bitDepth: 32,
    });

    fs.writeFileSync(outputPath, buffer);
    console.log(`Saved ${outputPath}`);
}

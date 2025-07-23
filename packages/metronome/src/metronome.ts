import fs from "fs";
import wav from "node-wav";

/**
 * Represents a beat in a musical performance or composition.
 * Provides details about the beat's position, duration, and optional notes.
 */
export interface Beat {
    /** Duration from this beat to the next in seconds. This is derived from tempo */
    duration: number;
    /** Human-readable notes about this beat. These are not the musical "notes" that are played. */
    notes?: string;
}

/**
 * Represents a musical measure in a musical composition.
 * Contains information about the structure and content of a specific measure.
 */
export interface Measure {
    /** The measure's number in the piece. Unique and integer */
    number: number;
    /** Optional rehearsal mark for the measure. I.e. "Big Box A" or "Measure 128" */
    rehearsalMark?: string;
    /** Human-readable notes about the measure. These are not the musical "notes" that are played. */
    notes?: string;
    /** The beats that belong to this measure */
    beats: Beat[];
}

const SAMPLE_RATE = 44100;
const DURATION = 1;
const FREQUENCY = 440;

const numSamples = SAMPLE_RATE * DURATION;
const samples = new Float32Array(numSamples);

// Generate sine wave
for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.sin(2 * Math.PI * FREQUENCY * (i / SAMPLE_RATE));
}

// Encode as WAV
const buffer = wav.encode([samples], {
    sampleRate: SAMPLE_RATE,
    float: true,
    bitDepth: 32,
});

fs.writeFileSync("tone.wav", buffer);
console.log("Saved tone.wav");

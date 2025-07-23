export const SAMPLE_RATE = 44100;

/**
 * Generates a simple oscillator wave of the specified type.
 * @param waveType
 * @param frequency
 * @param duration
 * @param volume
 */
export function generateOscillator(
    waveType: "sine" | "triangle" | "sawtooth",
    frequency: number,
    duration: number,
    volume: number = 1,
): Float32Array {
    const numSamples = Math.floor(SAMPLE_RATE * duration);
    const samples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        let value: number;

        switch (waveType) {
            case "sine":
                value = Math.sin(2 * Math.PI * frequency * t);
                break;

            case "triangle":
                value = 2 * Math.abs(2 * ((t * frequency) % 1) - 1) - 1;
                break;

            case "sawtooth":
                value = 2 * ((t * frequency) % 1) - 1;
                break;

            default:
                value = 0;
        }
        samples[i] = value * volume;
    }
    return samples;
}

/**
 * Overlay multiple sample arrays into a single Float32Array.
 * @param sampleArrays
 */
export function mixSamples(sampleArrays: Float32Array[]): Float32Array {
    if (sampleArrays.length === 0) return new Float32Array(0);
    const length = sampleArrays[0]!.length;
    const out = new Float32Array(length);

    // Add tones
    for (const arr of sampleArrays) {
        for (let i = 0; i < length; i++) {
            out[i]! += arr[i] ?? 0;
        }
    }

    // Normalize output
    const max = Math.max(...out.map(Math.abs));
    if (max > 1) {
        for (let i = 0; i < length; i++) out[i]! /= max;
    }
    return out;
}

/**
 * Pads a Float32Array to a target length with zeros.
 * @param samples
 * @param targetLength
 */
export function padSamples(
    samples: Float32Array,
    targetLength: number,
): Float32Array {
    if (samples.length >= targetLength) return samples;
    const padded = new Float32Array(targetLength);
    padded.set(samples);
    return padded;
}

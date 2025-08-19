import type { Measure, Beat } from "../utils";

const EPSILON = 1e-6;

/**
 * Converts a Node.js Buffer to an ArrayBuffer.
 */
export function convertBufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
}

/**
 * Converts a Node.js Buffer to a string.
 */
export function convertBufferToString(buffer: Buffer): string {
    return buffer.toString("utf-8");
}

/**
 * Comparison utilities for Measures and Beats
 */
export function measuresEqual(a: Measure[], b: Measure[]): boolean {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        const measureA = a[i]!,
            measureB = b[i]!;

        if (measureA.number !== measureB.number) return false;
        if (measureA.rehearsalMark !== measureB.rehearsalMark) return false;
        if (measureA.notes !== measureB.notes) return false;
        if (!beatsEqual(measureA.beats, measureB.beats)) return false;
    }
    return true;
}
export function beatsEqual(a: Beat[], b: Beat[]): boolean {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        const beatA = a[i]!,
            beatB = b[i]!;

        if (Math.abs(beatA.duration - beatB!.duration) > EPSILON) return false;
        if (beatA?.notes !== beatB?.notes) return false;
    }
    return true;
}

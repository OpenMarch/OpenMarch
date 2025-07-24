import { describe, expect, test } from "vitest";
import {
    getCurrentTime,
    type Measure,
    type Beat,
    createMeasure,
    createBeat,
} from "../../utils";
import { createMetronomeWav } from "../../metronome";

const testName = "Test Score 1 (Complex Score)";

/**
 * Tests 4 measures of 4/4 time at 120 BPM.
 */
describe(testName, () => {
    test(`Synthesize ${testName}`, async () => {
        createMetronomeWav(input, testName + "-" + getCurrentTime() + ".wav");
    });
});

/**
 * Expected output for Test Score 2 (Complex Score)
 * This suite covers a variety of time signatures, rehearsal marks, and tempo changes.
 * All fields are calculated and hardcoded, including timestamp, index, position, etc.
 */
// Beat durations (seconds)
const bpm144 = 0.4166667; // seconds per quarter note (144 bpm)
const hn80 = 0.375; // seconds per half note (80 bpm, half note is twice quarter)
const bpm120 = 0.5; // 120 bpm
const bpm180 = 0.3333333; // 180 bpm
const bpm90 = 0.6666667; // 90 bpm

// Helper to build beats for a measure
function buildBeats(
    count: number,
    duration: number,
    positionStart: number,
    indexStart: number,
    timestampStart: number,
): {
    beats: Beat[];
    nextPosition: number;
    nextIndex: number;
    nextTimestamp: number;
} {
    const beats: Beat[] = [];
    let position = positionStart;
    let index = indexStart;
    let timestamp = timestampStart;
    for (let i = 0; i < count; i++) {
        beats.push(createBeat(position, duration, index, timestamp));
        position += 1;
        index += 1;
        timestamp += duration;
    }
    return {
        beats,
        nextPosition: position,
        nextIndex: index,
        nextTimestamp: timestamp,
    };
}

// Converts old measure definition to new one
function buildMeasure(
    measureNum: number,
    beatCount: number,
    duration: number,
    position: number,
    index: number,
    timestamp: number,
) {
    const { beats, nextPosition, nextIndex, nextTimestamp } = buildBeats(
        beatCount,
        duration,
        position,
        index,
        timestamp,
    );
    return {
        measure: createMeasure(measureNum, beats[0]!, beats),
        nextPosition,
        nextIndex,
        nextTimestamp,
    };
}

// Load original structure
const oldMeasures = [
    { number: 1, beats: [bpm144, bpm144, bpm144, bpm144] },
    { number: 2, beats: [bpm144, bpm144, bpm144, bpm144] },
    { number: 3, beats: [bpm144, bpm144, bpm144, bpm144] },
    { number: 4, beats: [bpm144, bpm144, bpm144, bpm144] },
    { number: 5, beats: [hn80, hn80, hn80, hn80] },
    { number: 6, beats: [hn80, hn80, hn80, hn80] },
    { number: 7, beats: [hn80, hn80, hn80, hn80] },
    { number: 8, beats: [hn80, hn80, hn80, hn80] },
    { number: 9, beats: [hn80, hn80, hn80] },
    { number: 10, beats: [hn80, hn80, hn80] },
    { number: 11, beats: [hn80, hn80, hn80] },
    { number: 12, beats: [hn80, hn80, hn80] },
    { number: 13, beats: [hn80, hn80, hn80] },
    { number: 14, beats: [hn80, hn80, hn80, hn80, hn80, hn80] },
    { number: 15, beats: [hn80, hn80, hn80, hn80, hn80, hn80] },
    { number: 16, beats: [hn80, hn80, hn80, hn80, hn80, hn80] },
    { number: 17, beats: [bpm120, bpm120] },
    { number: 18, beats: [bpm120, bpm120] },
    { number: 19, beats: [bpm120, bpm120] },
    { number: 20, beats: [bpm120, bpm120] },
    { number: 21, beats: [bpm120, bpm120] },
    { number: 22, beats: [bpm120, bpm120] },
    { number: 23, beats: [bpm120, bpm120] },
    { number: 24, beats: [bpm180, bpm180, bpm180, bpm180] },
    { number: 25, beats: [bpm180, bpm180, bpm180, bpm180] },
    { number: 26, beats: [bpm180, bpm180, bpm180, bpm180] },
    { number: 27, beats: [bpm180, bpm180, bpm180, bpm180] },
    { number: 28, beats: [bpm180, bpm180, bpm180, bpm180] },
    { number: 29, beats: [bpm90, bpm90] },
    { number: 30, beats: [bpm90, bpm90] },
    { number: 31, beats: [bpm90, bpm90] },
    { number: 32, beats: [bpm90, bpm90] },
    { number: 33, beats: [bpm180, bpm180, bpm180, bpm180] },
    { number: 34, beats: [bpm180, bpm180, bpm180, bpm180] },
    { number: 35, beats: [bpm180, bpm180, bpm180, bpm180] },
    { number: 36, beats: [bpm90, bpm90, bpm90] },
    { number: 37, beats: [bpm90, bpm90, bpm90] },
    { number: 38, beats: [bpm180, bpm180, bpm180, bpm180] },
    { number: 39, beats: [bpm90, bpm90] },
    { number: 40, beats: [bpm90, bpm90] },
];

// Conversion process
let position = 1;
let index = 0;
let timestamp = 0;
const input: Measure[] = [];

for (const om of oldMeasures) {
    const beatCount = om.beats.length;
    const duration = om.beats[0];
    const result = buildMeasure(
        om.number,
        beatCount,
        duration!,
        position,
        index,
        timestamp,
    );
    input.push(result.measure);
    position = result.nextPosition;
    index = result.nextIndex;
    timestamp = result.nextTimestamp;
}

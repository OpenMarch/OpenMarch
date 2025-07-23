import { describe, expect, test } from "vitest";
import { getCurrentTime, type Measure } from "../../utils";
import { createMetronomeWav } from "../../metronome";

const testName = "Standard 120 BPM Test";

/**
 * Tests 4 measures of 4/4 time at 120 BPM.
 */
describe(testName, () => {
    test(`Synthesize ${testName}`, async () => {
        createMetronomeWav(input, testName + "-" + getCurrentTime() + ".wav");
    });
});

/**
 * 4 measures of 4/4 time at 120 BPM.
 */
const input: Measure[] = [
    {
        startBeat: {
            position: 1,
            duration: 0.5,
            includeInMeasure: true,
            index: 0,
            timestamp: 0,
        },
        number: 1,
        duration: 2,
        counts: 4,
        beats: [
            {
                position: 1,
                duration: 0.5,
                includeInMeasure: true,
                index: 0,
                timestamp: 0,
            },
            {
                position: 2,
                duration: 0.5,
                includeInMeasure: true,
                index: 1,
                timestamp: 0.5,
            },
            {
                position: 3,
                duration: 0.5,
                includeInMeasure: true,
                index: 2,
                timestamp: 1.0,
            },
            {
                position: 4,
                duration: 0.5,
                includeInMeasure: true,
                index: 3,
                timestamp: 1.5,
            },
        ],
        timestamp: 0,
    },
    {
        startBeat: {
            position: 5,
            duration: 0.5,
            includeInMeasure: true,
            index: 4,
            timestamp: 2.0,
        },
        number: 2,
        duration: 2,
        counts: 4,
        beats: [
            {
                position: 5,
                duration: 0.5,
                includeInMeasure: true,
                index: 4,
                timestamp: 2.0,
            },
            {
                position: 6,
                duration: 0.5,
                includeInMeasure: true,
                index: 5,
                timestamp: 2.5,
            },
            {
                position: 7,
                duration: 0.5,
                includeInMeasure: true,
                index: 6,
                timestamp: 3.0,
            },
            {
                position: 8,
                duration: 0.5,
                includeInMeasure: true,
                index: 7,
                timestamp: 3.5,
            },
        ],
        timestamp: 2.0,
    },
    {
        startBeat: {
            position: 9,
            duration: 0.5,
            includeInMeasure: true,
            index: 8,
            timestamp: 4.0,
        },
        number: 3,
        duration: 2,
        counts: 4,
        beats: [
            {
                position: 9,
                duration: 0.5,
                includeInMeasure: true,
                index: 8,
                timestamp: 4.0,
            },
            {
                position: 10,
                duration: 0.5,
                includeInMeasure: true,
                index: 9,
                timestamp: 4.5,
            },
            {
                position: 11,
                duration: 0.5,
                includeInMeasure: true,
                index: 10,
                timestamp: 5.0,
            },
            {
                position: 12,
                duration: 0.5,
                includeInMeasure: true,
                index: 11,
                timestamp: 5.5,
            },
        ],
        timestamp: 4.0,
    },
    {
        startBeat: {
            position: 13,
            duration: 0.5,
            includeInMeasure: true,
            index: 12,
            timestamp: 6.0,
        },
        number: 4,
        duration: 2,
        counts: 4,
        beats: [
            {
                position: 13,
                duration: 0.5,
                includeInMeasure: true,
                index: 12,
                timestamp: 6.0,
            },
            {
                position: 14,
                duration: 0.5,
                includeInMeasure: true,
                index: 13,
                timestamp: 6.5,
            },
            {
                position: 15,
                duration: 0.5,
                includeInMeasure: true,
                index: 14,
                timestamp: 7.0,
            },
            {
                position: 16,
                duration: 0.5,
                includeInMeasure: true,
                index: 15,
                timestamp: 7.5,
            },
        ],
        timestamp: 6.0,
    },
];

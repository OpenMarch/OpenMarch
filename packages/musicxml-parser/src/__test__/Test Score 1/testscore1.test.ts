import { describe, expect, test } from "vitest";
import {
    parseMusicXml,
    extractXmlFromMxlFile,
    type Measure,
    type Beat,
    secondsPerQuarterNote,
} from "../../parser";
import {
    measuresEqual,
    convertBufferToArrayBuffer,
    convertBufferToString,
} from "../test_utilities.ts";

/**
 * Test for Test Score 1 (Full Score).
 */
const filename = "Test Score.musicxml";
const testName = "Test Score 1 (Full Score)";

/**
 * A test score with various measures, beats, and tempos. You can see the sheet music at Score Picture.png
 */
describe(testName, () => {
    test(`parse ${testName}`, async () => {
        // Setup
        const fs = await import("fs/promises");
        const fileBuffer = await fs.readFile(`${__dirname}/${filename}`);
        let xmlText: string;

        // Handle .mxl files
        if (filename.endsWith(".mxl")) {
            xmlText = await extractXmlFromMxlFile(
                convertBufferToArrayBuffer(fileBuffer),
            );
        } else {
            xmlText = convertBufferToString(fileBuffer);
        }

        // Parse the XML content
        const result: Measure[] = parseMusicXml(xmlText);

        // Compare the result with the expected output
        if (!measuresEqual(result, expected)) {
            expect(result).toEqual(expected);
        }
        expect(measuresEqual(result, expected)).toBe(true);
    });
});

/**
 * Expected output for Test Score 1 (Full Score)
 */
const bpm144 = secondsPerQuarterNote(144);
const hn80 = secondsPerQuarterNote(80 * 2);
const bpm120 = secondsPerQuarterNote(120);
const bpm180 = secondsPerQuarterNote(180);
const bpm90 = secondsPerQuarterNote(90);

const expected: Measure[] = [
    {
        number: 1,
        beats: [
            { duration: bpm144 },
            { duration: bpm144 },
            { duration: bpm144 },
            { duration: bpm144 },
        ],
    },
    {
        number: 2,
        beats: [
            { duration: bpm144 },
            { duration: bpm144 },
            { duration: bpm144 },
            { duration: bpm144 },
        ],
    },
    {
        number: 3,
        beats: [
            { duration: bpm144 },
            { duration: bpm144 },
            { duration: bpm144 },
            { duration: bpm144 },
        ],
    },
    {
        number: 4,
        beats: [
            { duration: bpm144 },
            { duration: bpm144 },
            { duration: bpm144 },
            { duration: bpm144 },
        ],
    },
    {
        number: 5,
        beats: [
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
        ],
    },
    {
        number: 6,
        beats: [
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
        ],
    },
    {
        number: 7,
        beats: [
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
        ],
    },
    {
        number: 8,
        rehearsalMark: "A",
        beats: [
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
        ],
    },
    {
        number: 9,
        beats: [{ duration: hn80 }, { duration: hn80 }, { duration: hn80 }],
    },
    {
        number: 10,
        beats: [{ duration: hn80 }, { duration: hn80 }, { duration: hn80 }],
    },
    {
        number: 11,
        beats: [{ duration: hn80 }, { duration: hn80 }, { duration: hn80 }],
    },
    {
        number: 12,
        beats: [{ duration: hn80 }, { duration: hn80 }, { duration: hn80 }],
    },
    {
        number: 13,
        beats: [{ duration: hn80 }, { duration: hn80 }, { duration: hn80 }],
    },
    {
        number: 14,
        beats: [
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
        ],
    },
    {
        number: 15,
        beats: [
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
        ],
    },
    {
        number: 16,
        beats: [
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
            { duration: hn80 },
        ],
    },
    { number: 17, beats: [{ duration: bpm120 }, { duration: bpm120 }] },
    {
        number: 18,
        rehearsalMark: "152",
        beats: [{ duration: bpm120 }, { duration: bpm120 }],
    },
    { number: 19, beats: [{ duration: bpm120 }, { duration: bpm120 }] },
    { number: 20, beats: [{ duration: bpm120 }, { duration: bpm120 }] },
    { number: 21, beats: [{ duration: bpm120 }, { duration: bpm120 }] },
    { number: 22, beats: [{ duration: bpm120 }, { duration: bpm120 }] },
    { number: 23, beats: [{ duration: bpm120 }, { duration: bpm120 }] },
    {
        number: 24,
        rehearsalMark: "jeff",
        beats: [
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
        ],
    },
    {
        number: 25,
        beats: [
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
        ],
    },
    {
        number: 26,
        beats: [
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
        ],
    },
    {
        number: 27,
        beats: [
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
        ],
    },
    {
        number: 28,
        beats: [
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
        ],
    },
    { number: 29, beats: [{ duration: bpm90 }, { duration: bpm90 }] },
    { number: 30, beats: [{ duration: bpm90 }, { duration: bpm90 }] },
    { number: 31, beats: [{ duration: bpm90 }, { duration: bpm90 }] },
    { number: 32, beats: [{ duration: bpm90 }, { duration: bpm90 }] },
    {
        number: 33,
        beats: [
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
        ],
    },
    {
        number: 34,
        beats: [
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
        ],
    },
    {
        number: 35,
        beats: [
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
        ],
    },
    {
        number: 36,
        beats: [{ duration: bpm90 }, { duration: bpm90 }, { duration: bpm90 }],
    },
    {
        number: 37,
        beats: [{ duration: bpm90 }, { duration: bpm90 }, { duration: bpm90 }],
    },
    {
        number: 38,
        beats: [
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
            { duration: bpm180 },
        ],
    },
    { number: 39, beats: [{ duration: bpm90 }, { duration: bpm90 }] },
    { number: 40, beats: [{ duration: bpm90 }, { duration: bpm90 }] },
];

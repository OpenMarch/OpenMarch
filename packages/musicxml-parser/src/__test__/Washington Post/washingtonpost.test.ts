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

const filename = "Washington_post_march.mxl";
const testName = "Washington Post March";

/**
 * This test case parses the "Washington Post March" MusicXML file and checks if the parsed measures
 * match the expected output. This is a multi-part piece test.
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

const beatDuration = secondsPerQuarterNote(132);
const expected: Measure[] = [
    ...Array.from({ length: 80 }).map((_, i) => ({
        number: i + 1,
        beats: [
            {
                duration: beatDuration,
            } as Beat,
            {
                duration: beatDuration,
            } as Beat,
        ],
    })),
];

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
    beatsEqual,
    convertBufferToArrayBuffer,
    convertBufferToString,
} from "../test_utilities.ts";

/**
 * Replace the filename and pieceName with actual values for your test case.
 */
const filename = "TEMPLATE.xml";
const testName = "TEMPLATE";

/**
 * Describe your test case here.
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
 * Replace the expected output with the actual expected output for your test case.
 */
const expected: Measure[] = [];

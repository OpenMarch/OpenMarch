import { describe, it, expect } from "vitest";
import { parseMusicXml, extractXmlFromMxlFile } from "../../parser";
import { expected } from "./expected";

const filename = "Washington_post_march.mxl";
const pieceName = "Washington Post March";

describe(pieceName, () => {
    it(`should parse the ${pieceName}`, async () => {
        const fs = await import("fs/promises");
        const fileBuffer = await fs.readFile(`${__dirname}/${filename}`);
        // Convert Node.js Buffer to ArrayBuffer
        const arrayBuffer = fileBuffer.buffer.slice(
            fileBuffer.byteOffset,
            fileBuffer.byteOffset + fileBuffer.byteLength,
        ) as ArrayBuffer;
        const musicXmlText = await extractXmlFromMxlFile(arrayBuffer);
        const result = parseMusicXml(musicXmlText);
        expect(result.length).toEqual(expected.length);
        expect(result).toEqual(expected);
    });
});

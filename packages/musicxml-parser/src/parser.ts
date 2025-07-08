import JSZip from "jszip";

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

// 60 seconds in a minute, divided by tempo in beats per minute
export function secondsPerQuarterNote(tempo: number): number {
    return 60 / tempo;
}

/**
 * Parses a MusicXML string and converts it into an array of musical measures.
 * @param xmlText The raw XML text representing a musical score
 * @returns An array of Measure objects representing the parsed musical composition
 */
export function parseMusicXml(xmlText: string): Measure[] {
    const measures: Measure[] = [];
    let pos = 0;
    let tempo: number = 0;
    let timeSignature: string = "0/0";

    /** Given a time signature, bigBeats maps it to the:
     * - number of big beats per measure
     * - number of quarter notes per big beat
     * For example, in 6/8 time:
     * - 2 big beats per measure
     * - Each big beat contains 3 eighth notes, or 1.5 quarter notes.
     * So, the bigBeats for 6/8 is [2, 1.5].
     */
    const bigBeats: { [key: string]: [number, number] } = {
        "2/2": [2, 2],
        "3/2": [3, 2],
        "2/4": [2, 1],
        "3/4": [3, 1],
        "4/4": [4, 1],
        "6/4": [6, 1],
        "6/8": [2, 1.5],
        "7/8": [7, 1], // Likely this will end up being 3 "big beats" (for situations like 2+2+3)
    };

    // If the XML has multiple parts, stop after the first part
    const partStart = xmlText.indexOf("<part");
    if (partStart !== -1) {
        const partEnd = xmlText.indexOf("</part>", partStart);
        if (partEnd === -1) {
            throw new Error("Malformed XML: Missing closing </part> tag.");
        }

        xmlText = xmlText.substring(partStart, partEnd + 7);
    }

    // Extract beats measure-by-measure
    while (pos < xmlText.length) {
        // Extract measure
        const measureStart = xmlText.indexOf("<measure", pos);
        const measureEnd = xmlText.indexOf("</measure>", measureStart) + 10;
        const measureText = xmlText.substring(measureStart, measureEnd);
        if (measureStart === -1) break;

        // Extract measure number
        const measureNumber = measureText.match(/number="(\d+)"/);
        const number = measureNumber
            ? parseInt(measureNumber[1] as string)
            : -1;

        // Update tempo if new tempo exists. If multiple tempos are defined, use the last one.
        const tempoMatches = [...measureText.matchAll(/<sound tempo="(\d+)"/g)];
        if (tempoMatches.length > 0) {
            const lastTempo = tempoMatches[tempoMatches.length - 1];
            tempo = parseInt(lastTempo![1] as string);
        }

        // Update time signature if new one exists
        const timeSignatureMatch = measureText.match(
            /<time[^>]*>(.*?)<\/time>/s,
        );
        if (timeSignatureMatch && timeSignatureMatch[1]) {
            const beats = timeSignatureMatch[1].match(/<beats>(\d+)<\/beats>/);
            const beatType = timeSignatureMatch[1].match(
                /<beat-type>(\d+)<\/beat-type>/,
            );
            if (beats && beatType) {
                timeSignature = `${beats[1]}/${beatType[1]}`;
            }
        }

        // Extract rehearsal mark
        const rehearsalMatch = measureText.match(
            /<rehearsal[^>]*>(.*?)<\/rehearsal>/,
        );
        const rehearsalMark = rehearsalMatch ? rehearsalMatch[1] : undefined;

        // Check for valid time signature
        const [bigBeatCount, quarterNotesPerBigBeat] = bigBeats[
            timeSignature
        ] ?? [0, 0];
        if (bigBeatCount === 0) {
            throw new Error(`Unsupported time signature: ${timeSignature}`);
        }

        // Push associated number of big beats for time signature
        const beats: Beat[] = [];
        for (let i = 0; i < bigBeatCount; i++) {
            beats.push({
                duration: secondsPerQuarterNote(tempo) * quarterNotesPerBigBeat,
            });
        }

        // Push measure
        if (rehearsalMark) {
            measures.push({
                number: number,
                rehearsalMark: rehearsalMark,
                beats: beats,
            });
        } else {
            measures.push({ number: number, beats: beats });
        }

        // update position
        pos = measureEnd;
    }

    return measures;
}

/**
 * Extracts the XML content (as a string) from a MusicXML (.mxl) file.
 * This function reads the .mxl file, unzips it, and returns the content of the first XML file found.
 * Assumes that the zipped .mxl file contains only one desired XML file.
 */
export async function extractXmlFromMxlFile(
    fileBuffer: ArrayBuffer,
): Promise<string> {
    // load file
    const zip = await JSZip.loadAsync(fileBuffer);

    // loop through files in zip
    for (const fileName of Object.keys(zip.files)) {
        // locate a .xml or .musicxml file that is not container.xml or in META-INF
        if (
            (fileName.endsWith(".xml") || fileName.endsWith(".musicxml")) &&
            !fileName.endsWith("container.xml") &&
            !fileName.startsWith("META-INF/")
        ) {
            return await zip.files[fileName]!.async("text");
        }
    }

    // unzipped, but no xml or musicxml file found
    throw new Error("No XML file found.");
}

/**
 * Parses score xml as a string from an MXL file
 * @param filePath path to .mxl file on disk
 * @returns parsed XML or undefined if an error occurred
 *
 * Legacy function to parse MXL files.
 */
/*
export function parseMxl(filePath: string): string | undefined {
    try {
        var zip = new AdmZip(filePath);
        var zipEntries = zip.getEntries();

        // Find the root container, this will tell us which zip entry contains the actual score data we care about.
        const rootContainer = zipEntries.find(
            (entry: any) => entry.entryName === "META-INF/container.xml",
        );

        // Parse the root container data to a string
        const rootContainerData = rootContainer.getData().toString("utf8");

        // Pull out the root file path using a regex (I gave up on parsing this "correctly" using xml)
        const regex = /rootfile full-path="([^"]*)"/;
        const match = rootContainerData.match(regex);
        let scorePath = match ? match[1] : undefined;

        // Find the score container and create a string from its xml data
        let scoreContainer = zipEntries.find(
            (zipEntry: any) => zipEntry.entryName === scorePath,
        );
        return scoreContainer.getData().toString("utf8");
    } catch (error) {
        console.error("Error parsing MXL:", error);
        return undefined;
    }
}*/

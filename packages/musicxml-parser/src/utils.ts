import JSZip from "jszip";

/**
 * Represents a beat in a musical performance or composition.
 * Provides details about the beat's position, duration, and optional notes.
 *
 * Includes only specific properties needed for parsing functionality.
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
 *
 * Includes only specific properties needed for parsing functionality.
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

/**
 * 60 seconds divided by beats per minute gives us the number of seconds per quarter note.
 * @param tempo
 */
export function secondsPerQuarterNote(tempo: number): number {
    if (tempo <= 0) throw new Error("Invalid tempo: " + tempo);

    return 60 / tempo;
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

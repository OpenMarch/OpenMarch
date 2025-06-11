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

/**
 * Parses a MusicXML string and converts it into an array of musical measures.
 * @param xmlText The raw XML text representing a musical score
 * @returns An array of Measure objects representing the parsed musical composition
 */
export interface Beat {
    duration: number;
    notes?: string;
}

export interface Measure {
    number: number;
    rehearsalMark?: string;
    notes?: string;
    beats: Beat[];
}

export function parseMusicXml(xmlText: string): Measure[] {
    const measures: Measure[] = [];
    let pos = 0;
    let tempo: number = 0;
    let timeSignature: string = "0/0";

    // Defines the number of beats and tempo change based on time signature
    const bigBeats: { [key: string]: [number, number] } = {
        "2/2": [2, 1 / 2],
        "3/2": [3, 1 / 2],
        "2/4": [2, 1],
        "3/4": [3, 1],
        "4/4": [4, 1],
        "6/4": [6, 1],
        "6/8": [2, 2 / 3],
        "7/8": [7, 1], // Likely this will end up being 3 "big beats" (for situations like 2+2+3)
    };

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

        // Update tempo if new tempo exists
        const newTempo = measureText.match(/<sound tempo="(\d+)"/);
        if (newTempo) {
            tempo = parseInt(newTempo[1] as string);
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
        const [bigBeatCount, tempoChange] = bigBeats[timeSignature] ?? [0, 0];
        if (bigBeatCount == 0) {
            throw new Error(`Unsupported time signature: ${timeSignature}`);
        }

        // Push associated number of big beats for time signature
        const beats: Beat[] = [];
        for (let i = 0; i < bigBeatCount; i++) {
            beats.push({ duration: 60 / (tempo * tempoChange) });
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

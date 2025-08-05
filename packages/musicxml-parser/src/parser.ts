import { type Measure, type Beat, secondsPerQuarterNote } from "./utils.ts";

/**
 * Parses a MusicXML string and converts it into an array of musical measures.
 * @param xmlText The raw XML text representing a musical score
 * @returns An array of Measure objects representing the parsed musical composition
 */
export function parseMusicXml(xmlText: string): Measure[] {
    const measures: Measure[] = [];
    let pos = 0;
    let tempo: number = 120;
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
        "9/8": [3, 1.5],
        "12/8": [4, 1.5],
        "7/8": [7, 1],
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
        } else {
            const tempoMatch = measureText.match(
                /<per-minute[^>]*>(.*?)<\/per-minute>/s,
            );
            if (tempoMatch && tempoMatch[1]) {
                tempo = parseInt(tempoMatch[1]);
            }
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
        ] ?? [1, 1];
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

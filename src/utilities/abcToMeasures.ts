import BeatUnit from "@/global/classes/BeatUnit";
import Measure from "@/global/classes/Measure";
import TimeSignature from "@/global/classes/TimeSignature";

/**
 * Parses an abc string and returns an array of Measure objects.
 *
 * ABC is a music notation language that is used to represent music in text form.
 *
 * @param abcString The abc string to parse
 * @returns An array of Measure objects
 */
export default function abcToMeasures(abcString: string, testing = false): Measure[] {

    if (!abcString || abcString.length === 0)
        return [];
    if (abcString.indexOf('V:1') < 0) {
        // V:1 means voice 1, which is what we're looking for
        if (!testing)
            console.error('No measures found in abcString. No V:1 found.')
        return [];
    }

    const abcHeader = abcString.substring(0, abcString.indexOf('V:1'));
    let currentTimeSignature = parseTimeSignature(abcHeader);
    if (!currentTimeSignature) {
        console.error('No time signature found in abcString header. This may (and very likely will) lead to a misalignment in pages and music. Defaulting to 4/4.');
        currentTimeSignature = TimeSignature.fromString('4/4');
    }
    let currentTempo = parseTempo(abcHeader);
    if (!currentTempo) {
        console.error('No time signature found in abcString header. This may (and very likely will) lead to a misalignment in pages and music. Defaulting to 4/4. To fix this, add a tempo in the first measure.');
        currentTempo = { bpm: 120, beatUnit: BeatUnit.QUARTER };
    }

    // Create a new string to modify
    let newAbcString = abcString;

    // only get the first voice
    while (newAbcString.includes('V:1')) {
        newAbcString = newAbcString.substring(newAbcString.indexOf('V:1') + 4);
    }
    // Remove any following voices
    const nextVoiceIndex = newAbcString.indexOf('V:');
    if (nextVoiceIndex > 0)
        newAbcString = newAbcString.substring(0, nextVoiceIndex);

    // make each bar a new line. We don't care about what type of barline it is
    const multiBarlines = new Set(['|]', '[|', '||', '|:', ':|', '::']);
    for (const barline of multiBarlines) {
        while (newAbcString.includes(barline)) {
            newAbcString = newAbcString.replace(barline, '\n');
        }
    }
    // Single barline is after so that it doesn't replace the multi-barlines
    const singleBarline = '|';
    while (newAbcString.includes(singleBarline)) {
        newAbcString = newAbcString.replace(singleBarline, '\n');
    }

    const measureStrings = newAbcString.split('\n');

    // Remove all comments (text that starts with %)
    for (let i = 0; i < measureStrings.length; i++) {
        if (measureStrings[i].trim()[0] === '%' || measureStrings[i].trim() === '') {
            measureStrings.splice(i, 1);
            i--;
        }
    }

    // initialize empty object to store measures
    const output: Measure[] = [];
    // loop through each measure, checking for time signature and tempo changes
    for (const measureString of measureStrings) {
        const timeSignature = parseTimeSignature(measureString);
        if (timeSignature) {
            currentTimeSignature = timeSignature;
        }

        const tempo = parseTempo(measureString);
        if (tempo) {
            currentTempo = tempo;
        }

        if (currentTimeSignature && currentTempo) {
            output.push(new Measure({
                number: output.length + 1,
                timeSignature: currentTimeSignature,
                tempo: currentTempo.bpm,
                beatUnit: currentTempo.beatUnit,
            }));
        }
    }

    return output;
}

/**
 * Gets the first occurrence of a time signature in an abc string and returns it as a TimeSignature object.
 *
 * @param abcString The abc string to parse the time signature from (e.g. "M:4/4")
 * @returns TimeSignature object representing the time signature
 */
function parseTimeSignature(abcString: string): TimeSignature | undefined {
    if (!abcString.includes('M:'))
        return; // no time signature found, don't print an error

    const timeSignatureRegex = /M:(\d+)\/(\d+)/;
    const timeSignatureMatch = abcString.match(timeSignatureRegex);
    if (!timeSignatureMatch) {
        console.error('No time signature found in abcString');
        return;
    }
    const timeSignatureString = `${parseInt(timeSignatureMatch[1], 10)}/${parseInt(timeSignatureMatch[2], 10)}`;
    return TimeSignature.fromString(timeSignatureString);
}

/**
 * Gets the first occurrence of a tempo in an abc string and returns it as a bpm and beat unit object.
 *
 * @param abcString The abc string to parse the tempo from (e.g. "Q:1/4=100")
 * @returns { bpm: number, beatUnit: BeatUnit} | undefined The tempo as a bpm and beat unit object
 */
function parseTempo(abcString: string): { bpm: number, beatUnit: BeatUnit } | undefined {
    if (!abcString.includes('Q:'))
        return; // no tempo found, don't print an error

    const tempoRegex = /Q:(\d+)\/(\d+)=(\d+)/;
    const tempoMatch = abcString.match(tempoRegex);
    if (!tempoMatch) {
        console.error('No tempo found in abcString');
        return;
    }
    const beatUnitString = `${parseInt(tempoMatch[1], 10)}/${parseInt(tempoMatch[2], 10)}`;
    const beatUnit = BeatUnit.fromString(beatUnitString);
    return { bpm: parseInt(tempoMatch[3], 10), beatUnit };
}

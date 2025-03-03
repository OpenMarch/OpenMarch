import BeatUnit from "@/global/classes/BeatUnit";
import TimeSignature from "@/global/classes/TimeSignature";
import { NewBeatArgs } from "electron/database/tables/BeatTable";

interface TemporaryNewMeasureArgs {
    beatIndex: number;
    rehearsalMark: string | null;
}

/**
 * Converts an ABC string into a list of new beats and measures.
 *
 * This function takes an ABC string, which is a textual representation of musical notation,
 * and extracts the time signatures and tempos from the header. It then processes the measures
 * in the ABC string, creating a list of new beats and measures that can be used to represent
 * the music in a database or other data structure.
 *
 * @param abcString The ABC string to process.
 * @returns A tuple containing two arrays: the first is a list of `NewBeatArgs` objects representing
 * the new beats, and the second is a list of `TemporaryNewMeasureArgs` objects representing the new
 * measures.
 */
export const abcToNewBeatsAndMeasures = (
    abcString: string,
): [NewBeatArgs[], TemporaryNewMeasureArgs[]] => {
    if (!abcString || abcString.length === 0) return [[], []];
    if (abcString.indexOf("V:1") < 0) {
        // V:1 means voice 1, which is what we're looking for
        console.error("No measures found in abcString. No V:1 found.");
        return [[], []];
    }

    const abcHeader = abcString.substring(0, abcString.indexOf("V:1"));
    let currentTimeSignature = parseAbcTimeSignature(abcHeader);
    if (!currentTimeSignature) {
        console.error(
            "No time signature found in abcString header. This may (and very likely will) lead to a misalignment in pages and music. Defaulting to 4/4.",
        );
        currentTimeSignature = TimeSignature.fromString("4/4");
    }
    let currentTempo = parseAbcTempo(abcHeader);
    if (!currentTempo) {
        console.error(
            "No time signature found in abcString header. This may (and very likely will) lead to a misalignment in pages and music. Defaulting to 4/4. To fix this, add a tempo in the first measure.",
        );
        currentTempo = { bpm: 120, beatUnit: BeatUnit.QUARTER };
    }

    // Create a new string to modify
    let newAbcString = abcString;

    // only get the first voice
    while (newAbcString.includes("V:1")) {
        newAbcString = newAbcString.substring(newAbcString.indexOf("V:1") + 4);
    }
    // Remove any following voices
    const nextVoiceIndex = newAbcString.indexOf("V:");
    if (nextVoiceIndex > 0)
        newAbcString = newAbcString.substring(0, nextVoiceIndex);

    // make each bar a new line. We don't care about what type of barline it is
    const multiBarlines = new Set(["|]", "[|", "||", "|:", ":|", "::"]);
    for (const barline of multiBarlines) {
        while (newAbcString.includes(barline)) {
            newAbcString = newAbcString.replace(barline, "\n");
        }
    }
    // Single barline is after so that it doesn't replace the multi-barlines
    const singleBarline = "|";
    while (newAbcString.includes(singleBarline)) {
        newAbcString = newAbcString.replace(singleBarline, "\n");
    }

    const measureStrings = newAbcString.split("\n");

    // Remove all comments (text that starts with %)
    for (let i = 0; i < measureStrings.length; i++) {
        if (
            measureStrings[i].trim()[0] === "%" ||
            measureStrings[i].trim() === ""
        ) {
            measureStrings.splice(i, 1);
            i--;
        }
    }

    // initialize empty object to store measures
    const newMeasures: TemporaryNewMeasureArgs[] = [];
    const newBeats: NewBeatArgs[] = [];
    // loop through each measure, checking for time signature and tempo changes
    for (const measureString of measureStrings) {
        const timeSignature = parseAbcTimeSignature(measureString);
        if (timeSignature) {
            currentTimeSignature = timeSignature;
        }

        const tempo = parseAbcTempo(measureString);
        if (tempo) {
            currentTempo = tempo;
        }

        newMeasures.push({ beatIndex: newBeats.length, rehearsalMark: null });
        const args = {
            timeSignature: currentTimeSignature,
            tempo: currentTempo.bpm,
            beatUnit: currentTempo.beatUnit,
        };
        const measureDuration = calculateDuration(args);
        const bigBeats = getBigBeats(args);
        const beatDuration = measureDuration / bigBeats;
        for (let i = 0; i < bigBeats; i++)
            newBeats.push({
                duration: beatDuration,
                include_in_measure: 1,
            });
    }

    return [newBeats, newMeasures];
};

/**
 * Gets the first occurrence of a time signature in an abc string and returns it as a TimeSignature object.
 *
 * @param abcString The abc string to parse the time signature from (e.g. "M:4/4")
 * @returns TimeSignature object representing the time signature
 */
const parseAbcTimeSignature = (
    abcString: string,
): TimeSignature | undefined => {
    if (!abcString.includes("M:")) return; // no time signature found, don't print an error

    const timeSignatureRegex = /M:(\d+)\/(\d+)/;
    const timeSignatureMatch = abcString.match(timeSignatureRegex);
    if (!timeSignatureMatch) {
        console.error("No time signature found in abcString");
        return;
    }
    const timeSignatureString = `${parseInt(timeSignatureMatch[1], 10)}/${parseInt(timeSignatureMatch[2], 10)}`;
    return TimeSignature.fromString(timeSignatureString);
};

/**
 * Gets the first occurrence of a tempo in an abc string and returns it as a bpm and beat unit object.
 *
 * @param abcString The abc string to parse the tempo from (e.g. "Q:1/4=100")
 * @returns { bpm: number, beatUnit: BeatUnit} | undefined The tempo as a bpm and beat unit object
 */
const parseAbcTempo = (
    abcString: string,
): { bpm: number; beatUnit: BeatUnit } | undefined => {
    if (!abcString.includes("Q:")) return; // no tempo found, don't print an error

    const tempoRegex = /Q:(\d+)\/(\d+)=(\d+)/;
    const tempoMatch = abcString.match(tempoRegex);
    if (!tempoMatch) {
        console.error("No tempo found in abcString");
        return;
    }
    const beatUnitString = `${parseInt(tempoMatch[1], 10)}/${parseInt(tempoMatch[2], 10)}`;
    const beatUnit = BeatUnit.fromString(beatUnitString);
    return { bpm: parseInt(tempoMatch[3], 10), beatUnit };
};

/**
 * Get the number of big beats in the measure.
 *
 * E.g.
 * A 4/4 measure with beat unit of QUARTER has 4 big beats.
 * 6/8, DOTTED_QUARTER has 2 big beats.
 * 6/8, EIGHTH has 6 big beats.
 */
const getBigBeats = ({
    timeSignature,
    tempo,
    beatUnit,
}: {
    timeSignature: TimeSignature;
    tempo: number;
    beatUnit: BeatUnit;
}): number => {
    return (
        timeSignature.numerator / (timeSignature.denominator * beatUnit.value)
    );
};

/**
 * Calculates the duration of the measure (in seconds) based on the time signature, tempo, and beat unit.
 *
 * The time signature (numerator specifically) will determine how many beats are in the measure.
 *
 * The tempo (beats per minute) defines how many time the beat unit occurs in one minute.
 *
 * The beat unit determines what note gets the pulse. E.g. quarter = 144 == half = 72
 */
const calculateDuration = ({
    timeSignature,
    tempo,
    beatUnit,
}: {
    timeSignature: TimeSignature;
    tempo: number;
    beatUnit: BeatUnit;
}): number => {
    const beatsPerMeasure = timeSignature.numerator;
    // The ratio of the measure's beat unit to the pulse's beat unit
    const tempoRatio = 1 / timeSignature.denominator / beatUnit.value;
    // The duration of one beat in seconds
    const tempoBeatDuration = 60 / tempo;
    return tempoRatio * beatsPerMeasure * tempoBeatDuration;
};

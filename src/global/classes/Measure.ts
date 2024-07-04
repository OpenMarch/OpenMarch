import xml2abcInterpreter from "@/utilities/xml2abc-js/xml2abcInterpreter";
import BeatUnit from "./BeatUnit";
import TimeSignature from "./TimeSignature";


/**
 * A Measure represents a measure in the music is used in conjunction with Page objects to define a show's length.
 *
 * Measures in OpenMarch are stored in the database as a single string in ABC notation.
 * While this makes updating the database a bit more cumbersome, it allows for easy parsing of the measures.
 */
export default class Measure {
    /** INTEGER - The number of the measure in the piece */
    readonly number: number;
    /** The rehearsal mark of the measure. E.g. "A" or "12" (for measure 12) */
    readonly rehearsalMark: string | null;
    /** Beats per minute of the measure */
    readonly tempo: number;
    /**
     * The type of note that the bpm defines in this measure.
     * E.g. if the tempo is quarter = 120, the beat unit would be 1/4. Half note would be 1/2.
     * Dotted quarter would be 3/8
     */
    readonly beatUnit: BeatUnit;
    /** Time signature of the measure */
    readonly timeSignature: TimeSignature;
    /** The duration, in seconds, that the measure is */
    readonly duration: number;
    /** NOT IMPLEMENTED - The notes for the measure */
    readonly notes: string | null;
    /**
     * Fetches all of the measures from the database and updates the global state.
     * This is attached to the Measure store and needs to be updated in a useEffect hook so that the UI is updated.
     */
    static fetchMeasures: () => Promise<void>;

    constructor({ number, rehearsalMark = null, timeSignature, tempo, beatUnit, notes = null }:
        {
            number: number; rehearsalMark?: string | null; timeSignature: TimeSignature;
            beatUnit: BeatUnit, tempo: number; notes?: string | null;
        }) {
        if (!Number.isInteger(number))
            throw new Error("Measure number must be an integer.")
        if (tempo <= 0)
            throw new Error("Tempo must be > 0")

        this.number = number;
        this.rehearsalMark = rehearsalMark;
        this.timeSignature = timeSignature;
        this.tempo = tempo;
        this.beatUnit = beatUnit;
        this.duration = this.calculateDuration();
        this.notes = notes;
    }

    /*********************** PUBLIC STATIC METHODS ***********************/
    /**
     * Fetches all of the measures from the database.
     * This SHOULD NOT be called outside of the measure store - as the current measures are stored already in the store
     * and the fetchMeasures function is attached to the store and updates the UI.
     *
     * @param testing A boolean to determine if the function is being tested. If true, it will not print errors to the console.
     * @returns a list of all measures
     */
    static async getMeasures(testing = false): Promise<Measure[]> {
        const response = await window.electron.getMeasuresAbcString();
        const measures = Measure.abcToMeasures(response, testing);
        return measures;
    }

    /**
     * Creates a new measure in the database and updates the store.
     *
     * Pushes back the existing measure with the same number and all following measures.
     *
     * @param newMeasure - The new measure object to be created.
     * @param existingMeasures - The existing measures. Provide this to save on computation time, if not provided the function will fetch and parse the measures from the database.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async insertMeasure({ newMeasure, existingMeasures }: { newMeasure: Measure; existingMeasures?: Measure[]; }) {
        const existingMeasuresCopy = existingMeasures ? [...existingMeasures] : await Measure.getMeasures();
        const indexOfPreviousMeasure = existingMeasuresCopy.findIndex(measure => measure.number === newMeasure.number);
        if (indexOfPreviousMeasure > -1) {
            existingMeasuresCopy.splice(indexOfPreviousMeasure, 0, newMeasure);
        } else {
            existingMeasuresCopy.push(newMeasure);
        }
        const abcString = Measure.toAbcString(existingMeasuresCopy);
        const response = await window.electron.updateMeasureAbcString(abcString);
        // fetch the measures to update the store
        this.checkForFetchMeasures();
        this.fetchMeasures();
        return response;
    }

    /**
     * Update one measure with the provided arguments.
     *
     * Note that the number of the measure cannot be changed and is how the measure is identified.
     * Does nothing if the measure number is not found in the existing measures.
     *
     * @param modifiedMeasure - The modified measure object.
     * @param existingMeasures - The existing measures. Provide this to save on computation time, if not provided the function will fetch and parse the measures from the database.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async updateMeasure({ modifiedMeasure, existingMeasures }: { modifiedMeasure: Measure; existingMeasures?: Measure[]; }) {
        const existingMeasuresCopy = existingMeasures ? [...existingMeasures] : await Measure.getMeasures();
        const indexOfMeasure = existingMeasuresCopy.findIndex(measure => measure.number === modifiedMeasure.number);

        if (indexOfMeasure < 0)
            throw new Error(`Measure ${modifiedMeasure.number} not found in existing measures.`);

        existingMeasuresCopy[indexOfMeasure] = modifiedMeasure;
        const abcString = Measure.toAbcString(existingMeasuresCopy);
        const response = await window.electron.updateMeasureAbcString(abcString);
        // fetch the measures to update the store
        this.checkForFetchMeasures();
        this.fetchMeasures();
        return response;
    }

    /**
     * Deletes a single measure from the database.
     *
     * @param measureNumber the number of the measure to delete
     * @param existingMeasures the existing measures. Provide this to save on computation time, if not provided the function will fetch and parse the measures from the database.
     * @returns
     */
    static async deleteMeasure({ measureNumber, existingMeasures }: { measureNumber: number; existingMeasures?: Measure[]; }) {
        const existingMeasuresCopy = existingMeasures ? [...existingMeasures] : await Measure.getMeasures();
        const indexOfMeasure = existingMeasuresCopy.findIndex(measure => measure.number === measureNumber);

        if (indexOfMeasure < 0)
            throw new Error(`Measure ${measureNumber} not found in existing measures.`);

        existingMeasuresCopy.splice(indexOfMeasure, 1);
        const abcString = Measure.toAbcString(existingMeasuresCopy);
        const response = await window.electron.updateMeasureAbcString(abcString);
        // fetch the measures to update the store
        this.checkForFetchMeasures();
        this.fetchMeasures();
        return response;
    }

    /**
     * Checks if fetchMeasures is defined. If not, it logs an error to the console.
     */
    static checkForFetchMeasures() {
        if (!this.fetchMeasures)
            console.error("fetchMeasures is not defined. The UI will not update properly.");
    }

    /**
     * Updates the ABC string in the database with a converted MusicXML string.
     *
     * @param xml The MusicXML string to convert and update the database with
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async updateWithXml(xml: string) {
        const abcString = xml2abcInterpreter(xml);
        const response = await window.electron.updateMeasureAbcString(abcString);
        Measure.checkForFetchMeasures();
        Measure.fetchMeasures();
        return response;
    }

    /*********************** PUBLIC INSTANCE METHODS ***********************/
    /**
     * Compares two measures to see if they are equal.
     *
     * @param other The measure to compare to.
     * @returns If this measure is equal to the other measure.
     */
    equals(other: Measure): boolean {
        return this.number === other.number
            && this.rehearsalMark === other.rehearsalMark
            && this.timeSignature.equals(other.timeSignature)
            && this.tempo === other.tempo
            && this.beatUnit.equals(other.beatUnit)
            && this.duration === other.duration
            && this.notes === other.notes;
    }

    /**
     * Compares two measures by their name. Used for sorting.
     *
     * @param other The measure to compare to.
     * @returns A number that represents the comparison. (this.number - other.number)
     */
    compareTo(other: Measure): number {
        return this.number - other.number;
    }

    /**
     * Get the number of big beats in the measure.
     *
     * E.g.
     * A 4/4 measure with beat unit of QUARTER has 4 big beats.
     * 6/8, DOTTED_QUARTER has 2 big beats.
     * 6/8, EIGHTH has 6 big beats.
     */
    getBigBeats(): number {
        return this.timeSignature.numerator / (this.timeSignature.denominator * this.beatUnit.value);
    }

    /*********************** PRIVATE INSTANCE METHODS ***********************/
    /**
     * Calculates the duration of the measure (in seconds) based on the time signature, tempo, and beat unit.
     *
     * The time signature (numerator specifically) will determine how many beats are in the measure.
     *
     * The tempo (beats per minute) defines how many time the beat unit occurs in one minute.
     *
     * The beat unit determines what note gets the pulse. E.g. quarter = 144 == half = 72
     */
    private calculateDuration() {
        const beatsPerMeasure = this.timeSignature.numerator;
        // The ratio of the measure's beat unit to the pulse's beat unit
        const tempoRatio = (1 / this.timeSignature.denominator) / this.beatUnit.value;
        // The duration of one beat in seconds
        const tempoBeatDuration = 60 / this.tempo;
        return tempoRatio * beatsPerMeasure * tempoBeatDuration;
    }

    /*********************** MEASURE -> ABC ***********************/
    /**
     * Converts an array of Measure objects to an abc string.
     *
     * @param measures The measures to convert to an abc string
     * @returns The abc string.
     */
    private static toAbcString(measures: Measure[]) {
        if (measures.length === 0) return '';

        let output = 'X:1\n';
        // Time Signature
        output += `M:${measures[0].timeSignature.toString()}\n`;
        // Tempo
        output += `Q:${measures[0].beatUnit.toFractionString()}=${measures[0].tempo}\n`;
        // Voice placeholder
        output += 'V:1 baritone\nV:1\n';

        // First measure
        let previousMeasure;
        for (const measure of measures) {
            output += measure.toMeasureAbcString(previousMeasure);
            previousMeasure = measure;
        }

        return output;
    }

    /**
     * Helper function to convert a single measure to an abc string.
     *
     * @param previousMeasure The previous measure to compare tempo and time signature to.
     * @returns The abc string for the measure.
     */
    private toMeasureAbcString(previousMeasure?: Measure) {
        let output = '';
        // Rehearsal mark
        if (this.rehearsalMark)
            output += `"^${this.rehearsalMark}" `;

        // Time signature
        if (previousMeasure && !this.timeSignature.equals(previousMeasure.timeSignature))
            output += `[M:${this.timeSignature.toString()}] `;

        // Tempo
        if (previousMeasure && this.tempo !== previousMeasure.tempo)
            output += `[Q:${this.beatUnit.toFractionString()}=${this.tempo}] `;

        // Beats
        output += `z${this.getBigBeats()} `;

        // barline
        output += '| ';

        return output;
    }

    /*********************** ABC -> MEASURE ***********************/
    /**
     * Parses an abc string and returns an array of Measure objects.
     *
     * ABC is a music notation language that is used to represent music in text form.
     *
     * @param abcString The abc string to parse
     * @param testing A boolean to determine if the function is being tested. If true, it will not print errors to the console.
     * @returns An array of Measure objects
     */
    private static abcToMeasures(abcString: string, testing = false): Measure[] {

        if (!abcString || abcString.length === 0)
            return [];
        if (abcString.indexOf('V:1') < 0) {
            // V:1 means voice 1, which is what we're looking for
            if (!testing)
                console.error('No measures found in abcString. No V:1 found.')
            return [];
        }

        const abcHeader = abcString.substring(0, abcString.indexOf('V:1'));
        let currentTimeSignature = Measure.parseTimeSignature(abcHeader);
        if (!currentTimeSignature) {
            console.error('No time signature found in abcString header. This may (and very likely will) lead to a misalignment in pages and music. Defaulting to 4/4.');
            currentTimeSignature = TimeSignature.fromString('4/4');
        }
        let currentTempo = Measure.parseTempo(abcHeader);
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
            const timeSignature = Measure.parseTimeSignature(measureString);
            if (timeSignature) {
                currentTimeSignature = timeSignature;
            }

            const tempo = Measure.parseTempo(measureString);
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
    private static parseTimeSignature(abcString: string): TimeSignature | undefined {
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
    private static parseTempo(abcString: string): { bpm: number, beatUnit: BeatUnit } | undefined {
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
}

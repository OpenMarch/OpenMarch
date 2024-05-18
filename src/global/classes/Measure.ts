import BeatUnit from "./BeatUnit";
import TimeSignature from "./TimeSignature";

/**
 * A Measure represents a measure in the music is used in conjunction with Page objects to define a show's length.
 */
export class Measure {
    /** INTEGER - The number of the measure in the piece */
    readonly number: number;
    /** The rehearsal mark of the measure. E.g. "A" or "12" (for measure 12) */
    readonly rehearsalMark: string | null;
    /** Beats per minute of the measure */
    readonly tempo: number;
    /**
     * The type of note that the bpm defines in this measure.
     * E.g. 6/8 has dotted quarter = 120, or 4/4 has half note = 80
     */
    readonly beatUnit: BeatUnit;
    /** Time signature of the measure */
    readonly timeSignature: TimeSignature;
    /** The duration, in seconds, that the measure is */
    readonly duration: number;
    /** The notes for the measure */
    readonly notes: string | null;
    /**
     * Fetches all of the measures from the database.
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

    /**
     * Fetches all of the measures from the database.
     * This SHOULD NOT be called outside of the measure store - as the current measures are stored already in the store
     * and the fetchMeasures function is attached to the store and updates the UI.
     * @returns a list of all measures
     */
    static async getMeasures(): Promise<string> {
        const response = await window.electron.getMeasures();
        // const measures: Measure[] = [];
        // for (const container of response) {
        //     measures.push(Measure.fromMeasureDatabaseContainer(container));
        // }
        return response;
    }

    /**
     * Creates new measures in the database and updates the store.
     *
     * @param newMeasures - The new measure objects to be created.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async createMeasures(newMeasures: Measure[]) {
        const containers: MeasureDatabaseContainer[] = newMeasures.map(measure => measure.toDatabaseContainer());
        const response = await window.electron.createMeasures(containers);
        // fetch the measures to update the store
        this.checkForFetchMeasures();
        this.fetchMeasures();
        return response;
    }

    /**
     * Update one or many measures with the provided arguments.
     *
     * @param modifiedMeasures - The objects to update the measures with.
     * @returns DatabaseResponse: { success: boolean; errorMessage?: string;}
     */
    static async updateMeasures(modifiedMeasures: Measure[]) {
        const containers: MeasureDatabaseContainer[] = modifiedMeasures.map(measure => measure.toDatabaseContainer());
        const response = await window.electron.updateMeasures(containers);
        // fetch the measures to update the store
        this.checkForFetchMeasures();
        this.fetchMeasures();
        return response;
    }

    /**
     * Deletes specified measures from the database.
     * CAUTION - this will delete all of the measurePages associated with the measure.
     * THIS CANNOT BE UNDONE.
     *
     * @param measure_id - The ids of the measures to delete. Do not use id_for_html.
     * @returns Response data from the server.
     */
    static async deleteMeasure(measureIds: number[]) {
        const response = await window.electron.deleteMeasures(measureIds);
        // fetch the measures to update the store
        this.checkForFetchMeasures();
        this.fetchMeasures();
        return response;
    }

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
     * Checks if fetchMeasures is defined. If not, it logs an error to the console.
     */
    private static checkForFetchMeasures() {
        if (!this.fetchMeasures)
            console.error("fetchMeasures is not defined. The UI will not update properly.");
    }

    /**
     * Use this function to convert a Measure object to a MeasureDatabaseContainer object.
     * MeasureDatabaseContainer objects are used to send data to the database for updating and creating.
     *
     * @returns A MeasureDatabaseContainer object of this measure that can be sent to the database.
     */
    private toDatabaseContainer(): MeasureDatabaseContainer {
        const container: MeasureDatabaseContainer = {
            number: this.number,
            rehearsal_mark: this.rehearsalMark,
            time_signature: this.timeSignature.toString(),
            tempo: this.tempo,
            beat_unit: this.beatUnit.toString(),
            duration: this.duration,
            notes: this.notes,
        }
        return container;
    }

    /**
     * Use this function to create new Measure objects when receiving MeasureDatabaseContainers from the database.
     *
     * @param container The MeasureDatabaseContainer to create the Measure from.
     * @returns A Measure object
     */
    private static fromMeasureDatabaseContainer(container: MeasureDatabaseContainer): Measure {
        return new Measure({
            number: container.number,
            rehearsalMark: container.rehearsal_mark,
            timeSignature: TimeSignature.fromString(container.time_signature),
            tempo: container.tempo,
            beatUnit: BeatUnit.fromString(container.beat_unit),
            notes: container.notes
        });
    }
}

export default Measure;

/**
 * This is the type that you will actually send to the database for creating and updating.
 */
export interface MeasureDatabaseContainer {
    /** The unique identifier of the measure for the database. This is not used for new Measures */
    readonly number: number;
    readonly rehearsal_mark: string | null;
    readonly time_signature: string;
    readonly tempo: number;
    readonly beat_unit: string;
    readonly duration: number;
    readonly notes: string | null;
}

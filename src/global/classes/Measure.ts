import Beat from "./Beat";

type Measure = Readonly<{
    /** ID of the measure in the database */
    id: number;
    /** The beat this measure starts on */
    startBeat: Beat;
    /** The measure's number in the piece */
    number: number;
    /** Optional rehearsal mark for the measure */
    rehearsalMark: string | null;
    /** Human readable notes about the measure */
    notes: string | null;
    /** The duration of the measure in seconds */
    duration: number;
    /** The number of counts (or beats) in this measure */
    counts: number;
    /** The beats that belong to this measure */
    beats: Beat[];
}>;

export default Measure;

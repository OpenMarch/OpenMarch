import Measure from "./Measure";

export type TempoGroup = Readonly<{
    /**
     * Denotes the first measure's rehearsal mark, or a default name if there is no rehearsal mark.
     *
     * These names are not unique.
     */
    name: string;
    /**
     * The starting tempo of the group in BPM.
     * This is always defined as we can always determine the initial tempo.
     */
    startTempo: number;
    /**
     * If defined, the tempo changes over the course of the group.
     * The array contains the tempo for each beat in the group.
     */
    manualTempos?: number[];
    bigBeatsPerMeasure: number;
    /**
     * Index of the long beats in mixed meter groups.
     * "Long beats" are defined as the beats that are 1.5 times the duration of the short beats.
     *
     * For example, in 7/8 (2+2+3), the long beat indexes would be [2]. 7/8 (3+2+2) would be [0].
     *
     * In 10/8 (3+2+3+2), the long beat indexes would be [0, 2].
     * In 8/8 (3+3+2), the long beat indexes would be [0, 1].
     *
     * If the group is not a mixed meter, this is undefined.
     */
    longBeatIndexes?: number[];
    numOfRepeats: number;
    measureRangeString?: string;
}>;

const aboutEqual = (a: number, b: number, epsilon = 0.000001): boolean => {
    return Math.abs(a - b) < epsilon;
};

/**
 * Checks if all beats in a measure have the same duration.
 */
export const measureHasOneTempo = (measure: Measure) => {
    return measure.beats.every(
        (beat) => beat.duration === measure.beats[0].duration,
    );
};

const getTempoFromBeat = (beat: { duration: number }) => {
    return Math.round((60 / beat.duration) * 100) / 100;
};

const getStartAndEndTempos = (
    measure: Measure,
): { startTempo: number; endTempo?: number } => {
    const startTempo = getTempoFromBeat(measure.beats[0]);
    if (measureHasOneTempo(measure)) {
        return { startTempo };
    }
    const endTempo = getTempoFromBeat(measure.beats[measure.beats.length - 1]);
    return { startTempo, endTempo };
};

/**
 * Checks if a measure has the expected tempo(s).
 * Returns false if the measure has varying tempos within it or if the measure is empty.
 * If expectedEndTempo is undefined, only checks against expectedStartTempo.
 */
export const measureIsSameTempo = (
    measure: Measure,
    expectedStartTempo: number,
    expectedEndTempo: number | undefined,
) => {
    if (!measure.beats.length || !measureHasOneTempo(measure)) return false;

    const measureTempo = getTempoFromBeat(measure.beats[0]);
    return (
        measureTempo === expectedStartTempo &&
        (expectedEndTempo === undefined || measureTempo === expectedEndTempo)
    );
};

/**
 * Checks if a measure is a mixed meter.
 * A measure is considered mixed meter if it has two different beat durations that are in the ratio of 3:2.
 * This is a very common time signature for brass and percussion sections.
 */
export const measureIsMixedMeter = (measure: Measure) => {
    const durations = new Set<number>(
        measure.beats.map((beat) => beat.duration),
    );

    let output = false;
    if (durations.size === 2) {
        const shorterDuration = Math.min(...durations);
        const longerDuration = Math.max(...durations);
        const ratio = longerDuration / shorterDuration;
        output = aboutEqual(ratio, 1.5);
    }

    return output;
};

/**
 * Gets the indexes of long beats in a mixed meter measure.
 * Long beats are defined as beats that are 1.5 times the duration of short beats.
 * Returns an empty array if the measure is not a valid mixed meter.
 */
export const getLongBeatIndexes = (measure: Measure): number[] => {
    const durations = new Set<number>(
        measure.beats.map((beat) => beat.duration),
    );
    if (durations.size !== 2) {
        console.error("Measure is not a mixed meter", measure);
        return [];
    }
    const longBeatDuration = Math.max(...durations);

    const longBeatIndexes: number[] = [];
    for (let i = 0; i < measure.beats.length; i++) {
        if (measure.beats[i].duration === longBeatDuration)
            longBeatIndexes.push(i);
    }
    return longBeatIndexes;
};

export const TempoGroupsFromMeasures = (measures: Measure[]): TempoGroup[] => {
    if (!measures.length) return [];

    const groups: TempoGroup[] = [];
    let currentGroup: Measure[] = [measures[0]];
    const { startTempo: initialStartTempo, endTempo: initialEndTempo } =
        getStartAndEndTempos(measures[0]);
    let currentStartTempo = initialStartTempo;
    let currentEndTempo = initialEndTempo;
    let currentBeatsPerMeasure = measures[0].beats.length;
    let currentNumberOfRepeats = 1;

    for (let i = 1; i < measures.length; i++) {
        const measure = measures[i];
        const measureBeats = measure.beats.length;
        const { startTempo: measureStartTempo, endTempo: measureEndTempo } =
            getStartAndEndTempos(measure);

        const isSameTempo = measureIsSameTempo(
            measure,
            currentStartTempo,
            currentEndTempo,
        );
        // Create a new group if:
        // 1. The measure has a rehearsal mark
        // 2. The number of beats changes (time signature change)
        // 3. The tempo changes or varies within the measure
        if (
            measure.rehearsalMark ||
            measureBeats !== currentBeatsPerMeasure ||
            !isSameTempo
        ) {
            if (isSameTempo) {
                // Add the current group to groups
                groups.push({
                    name:
                        currentGroup[0].rehearsalMark ||
                        `Group ${groups.length + 1}`,
                    startTempo: currentStartTempo,
                    ...(currentEndTempo && currentEndTempo !== currentStartTempo
                        ? { endTempo: currentEndTempo }
                        : {}),
                    bigBeatsPerMeasure: currentBeatsPerMeasure,
                    numOfRepeats: currentNumberOfRepeats, // Default to 1 repeat
                });
            } else {
                groups.push({
                    name:
                        currentGroup[0].rehearsalMark ||
                        `Group ${groups.length + 1}`,
                    startTempo: currentStartTempo,
                    manualTempos: measureHasOneTempo(measures[i - 1])
                        ? undefined
                        : measures[i - 1].beats.map(getTempoFromBeat),
                    bigBeatsPerMeasure: currentBeatsPerMeasure,
                    numOfRepeats: currentNumberOfRepeats,
                });
            }

            // Start a new group
            currentGroup = [measure];
            currentStartTempo = measureStartTempo;
            currentEndTempo = measureEndTempo;
            currentBeatsPerMeasure = measureBeats;
        } else {
            currentGroup.push(measure);
            // Update end tempo if this measure has a different end tempo
            if (measureEndTempo && measureEndTempo !== currentEndTempo) {
                currentEndTempo = measureEndTempo;
            }
            currentNumberOfRepeats++;
        }
    }

    // Add the last group
    if (currentGroup.length > 0) {
        groups.push({
            name: currentGroup[0].rehearsalMark || `Group ${groups.length + 1}`,
            startTempo: currentStartTempo,
            ...(currentEndTempo && currentEndTempo !== currentStartTempo
                ? { endTempo: currentEndTempo }
                : {}),
            bigBeatsPerMeasure: currentBeatsPerMeasure,
            numOfRepeats: 1,
        });
    }

    return groups;
};

// const createDatabaseObjectsFromTempoGroup = (
//     tempoGroup: TempoGroup,
// ): { newBeats: NewBeatArgs[]; newMeasures: NewMeasureArgs[] } => {
//     const { name, startTempo, endTempo, bigBeatsPerMeasure, numOfRepeats } =
//         tempoGroup;

//     const newBeats: NewBeatArgs[] = [];
//     const newMeasures: NewMeasureArgs[] = [];

//     const duration = startTempo ? 60 / startTempo : undefined;
//     for (let i = 0; i < numOfRepeats; i++) {
//         for (let j = 0; j < bigBeatsPerMeasure; j++) {
//             newBeats.push({});
//         }
//     }
// };

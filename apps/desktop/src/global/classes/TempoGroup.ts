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
     * The ending tempo of the group in BPM.
     * If undefined, the tempo stays the same throughout the group.
     * If defined, the tempo slows down or speeds up over the course of the group.
     */
    endTempo?: number;
    /**
     * If defined, the tempo changes over the course of the group.
     * The array contains the tempo for each beat in the group.
     */
    manualTempos?: number[];
    bigBeatsPerMeasure: number;
    numOfRepeats: number;
}>;

const measureHasOneTempo = (measure: Measure) => {
    return measure.beats.every(
        (beat) => beat.duration === measure.beats[0].duration,
    );
};

const getTempoFromBeat = (beat: { duration: number }) => {
    return 60 / beat.duration;
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

const measureIsSameTempo = (
    measure: Measure,
    expectedStartTempo: number,
    expectedEndTempo: number | undefined,
) => {
    if (!measureHasOneTempo(measure)) return false;

    const measureTempo = getTempoFromBeat(measure.beats[0]);
    return (
        measureTempo === expectedStartTempo &&
        (expectedEndTempo === undefined || measureTempo === expectedEndTempo)
    );
};

// TODO, get a group from multiple measures if we are certain that we created the group (rather than making multiple groups for each measure)

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
                    manualTempos: measure.beats.map(getTempoFromBeat),
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

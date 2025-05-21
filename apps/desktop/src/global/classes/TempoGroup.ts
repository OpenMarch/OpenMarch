import Measure from "./Measure";

export type TempoGroup = Readonly<{
    name: string;
    /**
     * In BPM, the tempo that all beats in the group are.
     * If this is undefined, the tempo is different for one or many beats in the measure.
     */
    tempo?: number;
    bigBeatsPerMeasure: number;
    numOfRepeats: number;
    measures: Measure[];
}>;

const measureHasOneTempo = (measure: Measure) => {
    return measure.beats.every(
        (beat) => beat.duration === measure.beats[0].duration,
    );
};

const measureIsSameTempo = (
    measure: Measure,
    expectedTempo: number | undefined,
) => {
    return (
        // Return false if the tempo is undefined
        expectedTempo &&
        measureHasOneTempo(measure) &&
        measure.beats[0].duration === 60 / expectedTempo
    );
};

export const TempoGroupsFromMeasures = (measures: Measure[]): TempoGroup[] => {
    if (!measures.length) return [];

    const groups: TempoGroup[] = [];
    let currentGroup: Measure[] = [measures[0]];
    let currentTempo = measureHasOneTempo(measures[0])
        ? 60 / measures[0].beats[0].duration
        : undefined;
    let currentBeatsPerMeasure = measures[0].beats.length;

    for (let i = 1; i < measures.length; i++) {
        const measure = measures[i];
        const measureBeats = measure.beats.length;

        // Create a new group if:
        // 1. The measure has a rehearsal mark
        // 2. The number of beats changes (time signature change)
        // 3. The tempo changes
        // 4. Any beat within the measure has a different duration
        if (
            measure.rehearsalMark ||
            measureBeats !== currentBeatsPerMeasure ||
            !measureIsSameTempo(measure, currentTempo)
        ) {
            // Add the current group to groups
            groups.push({
                name:
                    currentGroup[0].rehearsalMark ||
                    `Group ${groups.length + 1}`,
                tempo: currentTempo,
                bigBeatsPerMeasure: currentBeatsPerMeasure,
                numOfRepeats: 1, // Default to 1 repeat
                measures: currentGroup,
            });

            // Start a new group
            currentGroup = [measure];
            currentTempo = measureHasOneTempo(measure)
                ? 60 / measure.beats[0].duration
                : undefined;
            currentBeatsPerMeasure = measureBeats;
        } else {
            currentGroup.push(measure);
        }
    }

    // Add the last group
    if (currentGroup.length > 0) {
        groups.push({
            name: currentGroup[0].rehearsalMark || `Group ${groups.length + 1}`,
            tempo: currentTempo,
            bigBeatsPerMeasure: currentBeatsPerMeasure,
            numOfRepeats: 1,
            measures: currentGroup,
        });
    }

    return groups;
};

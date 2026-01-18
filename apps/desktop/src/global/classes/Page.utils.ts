/**
 * Generates a string representation of the measure range for the page.
 * If the page starts on the first beat, the measure number is returned.
 * Otherwise, the measure number and the starting beat are returned.
 * The last measure number and ending beat are also included in the string if the page ends in the middle of a measure.
 *
 * E.g. "1 - 2" means the page starts on the first beat of m1 and goes through m2 to the start of m3.
 *
 * E.g. "1(2) - 3(4)" means the page starts on the second beat of m1 and goes up to the fourth beat of m3.
 *
 * @returns A string representing the measure range for the page.
 */
export const measureRangeString = (
    page: {
        measures: { number: number; counts: number }[] | null;
        measureBeatToStartOn: number | null;
        measureBeatToEndOn: number | null;
    } | null,
): string => {
    if (
        page == null ||
        page.measures == null ||
        page.measures.length === 0 ||
        page.measureBeatToStartOn == null ||
        page.measureBeatToEndOn == null
    ) {
        return "-";
    }
    try {
        const firstMeasure = page.measures[0];
        const lastMeasure = page.measures[page.measures.length - 1];

        // If the page starts on the first measure, just return the measure number. Otherwise, return the measure number and the beat.
        const firstMeasureString =
            page.measureBeatToStartOn === 1
                ? firstMeasure.number.toString()
                : `${firstMeasure.number}(${page.measureBeatToStartOn})`;
        const beatToEndOn = page.measureBeatToEndOn;
        const lastMeasureString =
            beatToEndOn === lastMeasure.counts
                ? lastMeasure.number.toString()
                : `${lastMeasure.number}(${beatToEndOn})`;

        if (firstMeasureString === lastMeasureString) return firstMeasureString;
        return `${firstMeasureString} → ${lastMeasureString}`;
    } catch (err) {
        return "N/A";
    }
};

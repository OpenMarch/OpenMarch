import { type Beat, type Measure, secondsPerQuarterNote } from "../../parser";

const beatDuration = secondsPerQuarterNote(132);

export const expected: Measure[] = [
    ...Array.from({ length: 80 }).map((_, i) => ({
        number: i + 1,
        beats: [
            {
                duration: beatDuration,
            } as Beat,
            {
                duration: beatDuration,
            } as Beat,
        ],
    })),
];

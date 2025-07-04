import type { Beat, Measure } from "../../parser";

// 132bpm = 132/60 seconds per beat
const beatDuration = 132 / 60;

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

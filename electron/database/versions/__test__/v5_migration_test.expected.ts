type Page = {
    counts: number;
    isSubset: boolean;
    name: string;
};

type Measure = {
    beats: number;
    measureNumber: number;
};

const bpm144 = 60 / 144;
export const ExpectedValues = {
    beatDurations: [
        0,
        //1
        0.5,
        0.5,
        0.5,
        0.5,
        // 2
        0.5,
        0.5,
        0.5,
        0.5,
        // 3
        0.5,
        0.5,
        0.5,
        0.5,
        // 4
        0.75,
        0.75,
        0.75,
        0.75,
        // 5
        0.75,
        0.75,
        // 6
        0.75,
        0.75,
        0.75,
        0.75,
        0.75,
        0.75,
        // 7
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        //  8
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        // after
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        bpm144,
        bpm144,
    ],
    measures: [
        { beats: 4, measureNumber: 1 },
        { beats: 4, measureNumber: 2 },
        { beats: 4, measureNumber: 3 },
        { beats: 4, measureNumber: 4 },
        { beats: 2, measureNumber: 5 },
        { beats: 6, measureNumber: 6 },
        { beats: 6, measureNumber: 7 },
        { beats: 6, measureNumber: 8 },
    ] satisfies Measure[],
    pages: [
        {
            name: "1",
            counts: 0,
            isSubset: false,
        },
        {
            name: "2",
            counts: 20,
            isSubset: false,
        },
        {
            name: "3",
            counts: 10,
            isSubset: false,
        },
        {
            name: "4",
            counts: 7,
            isSubset: false,
        },
        {
            name: "4A",
            counts: 2,
            isSubset: true,
        },
        {
            name: "5",
            counts: 7,
            isSubset: false,
        },
    ] satisfies Page[],
    //[0, 20, 10, 6, 2, 8]
} as const;

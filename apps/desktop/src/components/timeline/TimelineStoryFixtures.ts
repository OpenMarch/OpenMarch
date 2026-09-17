import type { TimelineTrack, TimelineViewModel } from "./TimelineViewModel";

const waveformForBeatCount = (beatCount: number) => ({
    peaksByBeat: Array.from({ length: beatCount }, (_, beat) =>
        Array.from({ length: 8 }, (_, sample) => {
            const wave =
                Math.sin((beat * 8 + sample) * 1.73) * 0.42 +
                Math.sin((beat * 8 + sample) * 0.37) * 0.28;
            return Math.max(0.08, Math.min(Math.abs(wave), 1));
        }),
    ),
});

export const timelineStoryTracks: readonly TimelineTrack[] = [
    {
        id: "m1",
        targetId: "marcher-1",
        targetType: "marcher",
        label: "M1",
        color: "#2fc4b2",
        legs: [
            { id: "m1-hold", startBeat: 0, endBeat: 8, texture: "hold" },
            { id: "m1-move", startBeat: 8, endBeat: 16, texture: "move" },
        ],
    },
    {
        id: "shape",
        targetId: "shape-1",
        targetType: "shape",
        label: "SH",
        color: "#e79b00",
        legs: [
            {
                id: "shape-move",
                startBeat: 8,
                endBeat: 16,
                texture: "move",
            },
            {
                id: "shape-hold",
                startBeat: 16,
                endBeat: 24,
                texture: "hold",
            },
        ],
    },
    {
        id: "m7",
        targetId: "marcher-7",
        targetType: "marcher",
        label: "M7",
        color: "#e56a82",
        legs: [{ id: "m7-move", startBeat: 16, endBeat: 24, texture: "move" }],
    },
];

export const timelineStoryModel: TimelineViewModel = {
    beatCount: 32,
    pages: [
        { id: "page-1", label: "1", atBeat: 0 },
        { id: "page-2", label: "2", atBeat: 8 },
        { id: "page-2a", label: "2A", atBeat: 16 },
        { id: "page-3", label: "3", atBeat: 24 },
    ],
    measures: Array.from({ length: 8 }, (_, index) => ({
        id: `measure-${index + 1}`,
        label: `M${index + 1}`,
        atBeat: index * 4,
    })),
    tracks: timelineStoryTracks,
    waveform: waveformForBeatCount(32),
};

export const createLongTimelineStoryModel = (): TimelineViewModel => {
    const beatCount = 512;
    const pages = Array.from({ length: beatCount / 32 }, (_, index) => ({
        id: `long-page-${index + 1}`,
        label: `${index + 1}`,
        atBeat: index * 32,
    }));
    const colors = ["#2fc4b2", "#e79b00", "#e56a82", "#967eff"];
    const tracks = colors.map((color, index) => ({
        id: `long-track-${index}`,
        targetId: `long-target-${index}`,
        targetType: (index === 1 ? "shape" : "marcher") as "shape" | "marcher",
        label: index === 1 ? "SH" : `M${index + 1}`,
        color,
        legs: [
            {
                id: `long-leg-${index}`,
                startBeat: index * 64,
                endBeat: index * 64 + 64,
                texture: (index % 2 === 0 ? "move" : "hold") as "move" | "hold",
            },
        ],
    }));
    return {
        beatCount,
        pages,
        measures: Array.from({ length: beatCount / 4 }, (_, index) => ({
            id: `long-measure-${index + 1}`,
            label: `M${index + 1}`,
            atBeat: index * 4,
        })),
        tracks,
        waveform: waveformForBeatCount(beatCount),
    };
};

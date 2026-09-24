import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";
import type Page from "@/global/classes/Page";
import type { TimelineInput } from "./Timeline";
import type {
    TimelineTrack,
    TimelineViewModel,
    TimelineWaveform,
} from "./TimelineViewModel";

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

export const timelineStoryWaveform = waveformForBeatCount(32);

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
        activitySpans: [
            { startBeatIndex: 0, endBeatIndex: 5, active: true },
            { startBeatIndex: 5, endBeatIndex: 9, active: false },
            { startBeatIndex: 9, endBeatIndex: 16, active: true },
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
        activitySpans: [
            { startBeatIndex: 8, endBeatIndex: 18, active: true },
            { startBeatIndex: 18, endBeatIndex: 21, active: false },
            { startBeatIndex: 21, endBeatIndex: 24, active: true },
        ],
    },
    {
        id: "m7",
        targetId: "marcher-7",
        targetType: "marcher",
        label: "M7",
        color: "#e56a82",
        legs: [{ id: "m7-move", startBeat: 16, endBeat: 24, texture: "move" }],
        activitySpans: [
            { startBeatIndex: 16, endBeatIndex: 20, active: true },
            { startBeatIndex: 20, endBeatIndex: 22, active: false },
            { startBeatIndex: 22, endBeatIndex: 24, active: true },
        ],
    },
];

export const timelineStoryModel: TimelineViewModel = {
    beatCount: 32,
    pages: [
        { id: "page-0", label: "0", atBeat: 0, isInitial: true },
        { id: "page-1", label: "1", atBeat: 0, isInitial: false },
        { id: "page-2", label: "2", atBeat: 8, isInitial: false },
        { id: "page-2a", label: "2A", atBeat: 16, isInitial: false },
        { id: "page-4", label: "4", atBeat: 24, isInitial: false },
    ],
    measures: Array.from({ length: 8 }, (_, index) => ({
        id: `measure-${index + 1}`,
        label: `M${index + 1}`,
        atBeat: index * 4,
        rehearsalMark: index === 6 ? "A" : null,
    })),
    tracks: timelineStoryTracks,
    waveform: timelineStoryWaveform,
};

const createStoryBeats = (beatCount: number): Beat[] =>
    Array.from({ length: beatCount }, (_, index) => ({
        id: index,
        position: index,
        duration: 0.5,
        includeInMeasure: true,
        notes: null,
        index,
        timestamp: index * 0.5,
    }));

const createStoryMeasures = (beats: Beat[], count: number): Measure[] =>
    Array.from({ length: count }, (_, index) => {
        const measureBeats = beats.slice(index * 4, index * 4 + 4);
        return {
            id: index + 1,
            startBeat: measureBeats[0],
            number: index + 1,
            rehearsalMark: index === 6 ? "A" : null,
            notes: null,
            duration: measureBeats.length * 0.5,
            counts: measureBeats.length,
            beats: measureBeats,
            timestamp: measureBeats[0]?.timestamp ?? 0,
        };
    });

const createStoryPages = ({
    beats,
    measures,
    markers,
}: {
    beats: Beat[];
    measures: Measure[];
    markers: readonly {
        id: string;
        label: string;
        atBeat: number;
        isInitial: boolean;
    }[];
}): Page[] =>
    markers.map((marker, index) => {
        const next =
            markers.slice(index + 1).find((candidate) => !candidate.isInitial)
                ?.atBeat ?? beats.length;
        const pageBeats = beats.slice(marker.atBeat, next);
        const initialPage = marker.isInitial;
        return {
            id: index + 1,
            name: marker.label,
            counts: initialPage ? 0 : pageBeats.length,
            notes: null,
            order: index,
            nextPageId: markers[index + 1] ? index + 2 : null,
            previousPageId: index === 0 ? null : index,
            isSubset: /[A-Za-z]/.test(marker.label),
            duration: initialPage ? 0 : pageBeats.length * 0.5,
            beats: initialPage ? [beats[0]] : pageBeats,
            measures: initialPage
                ? null
                : measures.filter((measure) =>
                      pageBeats.some(
                          (beat) => beat.id === measure.startBeat.id,
                      ),
                  ),
            measureBeatToStartOn: initialPage ? null : 1,
            measureBeatToEndOn: initialPage ? null : pageBeats.length,
            timestamp: pageBeats[0]?.timestamp ?? 0,
        };
    });

const tracksToTimelineInputs = (
    tracks: readonly TimelineTrack[],
): TimelineInput[] =>
    tracks.map((track) => ({
        id: track.id,
        targetId: track.targetId,
        targetType: track.targetType,
        label: track.label,
        color: track.color,
        startBeatIndex: Math.min(...track.legs.map((leg) => leg.startBeat)),
        endBeatIndex: Math.max(...track.legs.map((leg) => leg.endBeat)),
        legs: track.legs.map((leg) => ({
            id: leg.id,
            startBeatIndex: leg.startBeat,
            endBeatIndex: leg.endBeat,
            texture: leg.texture,
        })),
        activitySpans: track.activitySpans,
    }));

export interface TimelineStoryData {
    beats: Beat[];
    pages: Page[];
    measures: Measure[];
    timelines: TimelineInput[];
    waveform: TimelineWaveform;
}

export const timelineStoryData: TimelineStoryData = (() => {
    const beats = createStoryBeats(timelineStoryModel.beatCount);
    const measures = createStoryMeasures(beats, 8);
    return {
        beats,
        measures,
        pages: createStoryPages({
            beats,
            measures,
            markers: timelineStoryModel.pages.map((page) => ({
                ...page,
                id: String(page.id),
            })),
        }),
        timelines: tracksToTimelineInputs(timelineStoryTracks),
        waveform: timelineStoryWaveform,
    };
})();

export const createLongTimelineStoryModel = (): TimelineViewModel => {
    const beatCount = 512;
    const pages = [
        {
            id: "long-page-0",
            label: "0",
            atBeat: 0,
            isInitial: true,
        },
        ...Array.from({ length: beatCount / 32 }, (_, index) => ({
            id: `long-page-${index + 1}`,
            label: `${index + 1}`,
            atBeat: index * 32,
            isInitial: false,
        })),
    ];
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
        activitySpans: [
            {
                startBeatIndex: index * 64,
                endBeatIndex: index * 64 + 64,
                active: true,
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

export const createLongTimelineStoryData = (): TimelineStoryData => {
    const model = createLongTimelineStoryModel();
    const beats = createStoryBeats(model.beatCount);
    const measures = createStoryMeasures(beats, model.beatCount / 4);
    return {
        beats,
        measures,
        pages: createStoryPages({
            beats,
            measures,
            markers: model.pages.map((page) => ({
                ...page,
                id: String(page.id),
            })),
        }),
        timelines: tracksToTimelineInputs(model.tracks),
        waveform: model.waveform,
    };
};

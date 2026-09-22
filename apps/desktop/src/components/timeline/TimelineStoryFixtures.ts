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
            rehearsalMark: null,
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
    markers: readonly { id: string; label: string; atBeat: number }[];
}): Page[] =>
    markers.map((marker, index) => {
        const next = markers[index + 1]?.atBeat ?? beats.length;
        const pageBeats = beats.slice(marker.atBeat, next);
        return {
            id: index + 1,
            name: marker.label,
            counts: pageBeats.length,
            notes: null,
            order: index,
            nextPageId: markers[index + 1] ? index + 2 : null,
            previousPageId: index === 0 ? null : index,
            isSubset: /[A-Za-z]/.test(marker.label),
            duration: pageBeats.length * 0.5,
            beats: pageBeats,
            measures: measures.filter((measure) =>
                pageBeats.some((beat) => beat.id === measure.startBeat.id),
            ),
            measureBeatToStartOn: 1,
            measureBeatToEndOn: pageBeats.length,
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

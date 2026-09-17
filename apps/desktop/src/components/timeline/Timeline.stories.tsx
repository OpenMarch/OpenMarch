import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import {
    CollapsedTimeline,
    ExpandedTimeline,
    InspectorTimeline,
    SimpleTimeline,
} from "./TimelineVariants";
import {
    createLongTimelineStoryModel,
    timelineStoryModel,
} from "./TimelineStoryFixtures";
import type { TimelineViewModel } from "./TimelineViewModel";

type StoryMode = "simple" | "expanded" | "collapsed" | "inspector";

interface TimelineStoryProps {
    mode: StoryMode;
    model: TimelineViewModel;
    initialPositionBeat: number;
    initialPixelsPerBeat: number;
    initialIsPlaying: boolean;
    showTransport: boolean;
    focusedTrackId: string;
    width: number;
}

function TimelineStory({
    mode,
    model,
    initialPositionBeat,
    initialPixelsPerBeat,
    initialIsPlaying,
    showTransport,
    focusedTrackId,
    width,
}: TimelineStoryProps) {
    const [positionBeat, setPositionBeat] = useState(initialPositionBeat);
    const [pixelsPerBeat, setPixelsPerBeat] = useState(initialPixelsPerBeat);
    const [isPlaying, setIsPlaying] = useState(initialIsPlaying);
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
    const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

    useEffect(() => {
        if (!isPlaying) return;
        const timer = window.setInterval(() => {
            setPositionBeat((beat) => (beat + 1) % model.beatCount);
        }, 450);
        return () => window.clearInterval(timer);
    }, [isPlaying, model.beatCount]);

    const commonProps = {
        model,
        positionBeat,
        isPlaying,
        pixelsPerBeat,
        selectedTrackId,
        showTransport,
        onSeek: setPositionBeat,
        onPlayingChange: setIsPlaying,
        onPixelsPerBeatChange: setPixelsPerBeat,
        onTrackSelect: setSelectedTrackId,
    };

    return (
        <div
            className="dark flex min-h-screen items-center bg-[#17161b] p-24"
            style={{ width: "100%" }}
        >
            <div style={{ width, maxWidth: "100%" }}>
                {mode === "simple" && (
                    <SimpleTimeline
                        {...commonProps}
                        selectedPageId={selectedPageId}
                        onPageSelect={(pageId) => {
                            setSelectedPageId(pageId);
                            const page = model.pages.find(
                                (item) => item.id === pageId,
                            );
                            if (page) setPositionBeat(page.atBeat);
                        }}
                        onPageAdd={() => setPositionBeat(model.beatCount - 1)}
                    />
                )}
                {mode === "expanded" && <ExpandedTimeline {...commonProps} />}
                {mode === "collapsed" && <CollapsedTimeline {...commonProps} />}
                {mode === "inspector" && (
                    <InspectorTimeline
                        {...commonProps}
                        focusedTrackId={focusedTrackId}
                    />
                )}
            </div>
        </div>
    );
}

const meta = {
    title: "Timeline/New Timeline",
    component: TimelineStory,
    parameters: { layout: "fullscreen" },
    argTypes: {
        mode: {
            control: "select",
            options: ["simple", "expanded", "collapsed", "inspector"],
        },
        model: { control: false },
        initialPositionBeat: {
            control: { type: "range", min: 0, max: 511, step: 1 },
        },
        initialPixelsPerBeat: {
            control: { type: "range", min: 4, max: 64, step: 1 },
        },
        focusedTrackId: {
            control: "select",
            options: ["shape", "m1", "m7"],
        },
        width: {
            control: { type: "range", min: 500, max: 1536, step: 16 },
        },
    },
    args: {
        model: timelineStoryModel,
        initialPositionBeat: 11,
        initialPixelsPerBeat: 16,
        initialIsPlaying: false,
        showTransport: true,
        focusedTrackId: "shape",
        width: 1280,
    },
    render: (args) => (
        <TimelineStory
            key={`${args.mode}-${args.initialPositionBeat}-${args.initialPixelsPerBeat}-${args.initialIsPlaying}-${args.showTransport}-${args.focusedTrackId}-${args.width}`}
            {...args}
        />
    ),
} satisfies Meta<typeof TimelineStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simple: Story = {
    args: { mode: "simple", showTransport: true },
};

export const Expanded: Story = {
    args: { mode: "expanded", showTransport: true },
};

export const Collapsed: Story = {
    args: { mode: "collapsed", showTransport: false },
};

export const Inspector: Story = {
    args: {
        mode: "inspector",
        showTransport: false,
        focusedTrackId: "shape",
    },
};

export const LongShowPerformance: Story = {
    args: {
        mode: "expanded",
        model: createLongTimelineStoryModel(),
        initialPixelsPerBeat: 8,
        initialPositionBeat: 120,
        width: 1400,
    },
};

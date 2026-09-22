import type { Meta, StoryObj } from "@storybook/react-vite";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { expect, userEvent } from "storybook/test";
import { useFrameClockStore } from "@/services/clock/frame-clock";
import {
    Timeline,
    TimelineWaveformProvider,
    type TimelineMode,
} from "./Timeline";
import {
    createLongTimelineStoryData,
    timelineStoryData,
} from "./TimelineStoryFixtures";

type StoryTheme = "dark" | "light";
type StoryScenario = "standard" | "long-show";

interface TimelineStoryProps {
    mode: TimelineMode;
    scenario: StoryScenario;
    theme: StoryTheme;
}

function TimelineStory({ mode, scenario, theme }: TimelineStoryProps) {
    const data = useMemo(
        () =>
            scenario === "long-show"
                ? createLongTimelineStoryData()
                : timelineStoryData,
        [scenario],
    );
    const [workspace, setWorkspace] = useState({
        startFlagBeatIndex: scenario === "long-show" ? 64 : 4,
        endFlagBeatIndex: scenario === "long-show" ? 256 : 27,
    });
    const [timelines, setTimelines] = useState(data.timelines);

    useEffect(() => {
        setTimelines(data.timelines);
        useFrameClockStore
            .getState()
            .setCurrentBeatIndex(scenario === "long-show" ? 120 : 11);
    }, [data, scenario]);

    const shared = {
        beats: data.beats,
        pages: data.pages,
        measures: data.measures,
        timelines,
        onTimelineRangeCommit: (change: {
            timelineId: string | number;
            startBeatIndex: number;
            endBeatIndex: number;
        }) => {
            setTimelines((current) =>
                current.map((timeline) => {
                    if (timeline.id !== change.timelineId) return timeline;
                    const offset =
                        change.startBeatIndex - timeline.startBeatIndex;
                    return {
                        ...timeline,
                        startBeatIndex: change.startBeatIndex,
                        endBeatIndex: change.endBeatIndex,
                        legs: timeline.legs.map((leg) => ({
                            ...leg,
                            startBeatIndex: leg.startBeatIndex + offset,
                            endBeatIndex: leg.endBeatIndex + offset,
                        })),
                    };
                }),
            );
        },
    };
    const timeline =
        mode === "compact" ? (
            <Timeline {...shared} mode="compact" />
        ) : mode === "inspector" ? (
            <Timeline
                {...shared}
                {...workspace}
                mode="inspector"
                focusedTimelineId="shape"
                onWorkspaceRangeCommit={setWorkspace}
            />
        ) : (
            <Timeline
                {...shared}
                {...workspace}
                mode={mode}
                onWorkspaceRangeCommit={setWorkspace}
            />
        );

    return (
        <TimelineWaveformProvider waveform={data.waveform}>
            <div
                className={clsx(
                    "bg-bg-1 text-text flex min-h-screen items-center p-24",
                    theme === "dark" && "dark",
                )}
            >
                <div className="w-full">{timeline}</div>
            </div>
        </TimelineWaveformProvider>
    );
}

const meta = {
    title: "Timeline/New Timeline",
    component: TimelineStory,
    parameters: { layout: "fullscreen" },
    argTypes: {
        mode: {
            control: "select",
            options: ["simple", "expanded", "compact", "inspector"],
        },
        scenario: {
            control: "inline-radio",
            options: ["standard", "long-show"],
        },
        theme: {
            control: "inline-radio",
            options: ["dark", "light"],
        },
    },
    args: {
        mode: "simple",
        scenario: "standard",
        theme: "dark",
    },
    render: (args) => (
        <TimelineStory
            key={`${args.mode}-${args.scenario}-${args.theme}`}
            {...args}
        />
    ),
} satisfies Meta<typeof TimelineStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simple: Story = {
    args: { mode: "simple" },
    play: async ({ canvas }) => {
        const page = await canvas.findByRole("button", { name: "2" });
        await userEvent.click(page);
        await expect(page).toHaveAttribute("aria-pressed", "true");
    },
};

export const Expanded: Story = {
    args: { mode: "expanded" },
    play: async ({ canvas }) => {
        const track = await canvas.findByLabelText(/SH timeline/);
        await userEvent.click(track);
        await expect(track).toHaveAttribute("aria-pressed", "true");
        await expect(
            await canvas.findByRole("button", { name: "Workspace start" }),
        ).toBeInTheDocument();

        await userEvent.click(
            await canvas.findByRole("button", { name: "Play" }),
        );
        await expect(
            canvas.getByRole("button", { name: "Pause" }),
        ).toBeInTheDocument();
    },
};

export const Compact: Story = {
    args: { mode: "compact" },
    play: async ({ canvas }) => {
        await canvas.findByText("Audio");
        await expect(
            canvas.queryByRole("button", { name: "Workspace start" }),
        ).not.toBeInTheDocument();
    },
};

export const Inspector: Story = {
    args: { mode: "inspector" },
};

export const LongShowPerformance: Story = {
    args: { mode: "expanded", scenario: "long-show" },
};

export const SimpleLight: Story = {
    name: "Simple · Light",
    args: { mode: "simple", theme: "light" },
};

export const ExpandedLight: Story = {
    name: "Expanded · Light",
    args: { mode: "expanded", theme: "light" },
};

export const CompactLight: Story = {
    name: "Compact · Light",
    args: { mode: "compact", theme: "light" },
};

export const InspectorLight: Story = {
    name: "Inspector · Light",
    args: { mode: "inspector", theme: "light" },
};

export const LongShowPerformanceLight: Story = {
    name: "Long Show Performance · Light",
    args: { mode: "expanded", scenario: "long-show", theme: "light" },
};

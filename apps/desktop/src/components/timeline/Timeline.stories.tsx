/**
 * The timeline's stories, from the 0.2 branch (568056aa).
 *
 * Storybook isn't set up in this repo, so this file has no Storybook imports: `Meta` and `Story`
 * below are minimal local stand-ins for Storybook's CSF types, and the play functions use Testing
 * Library and Vitest's `expect` (what `storybook/test` re-exports). `__test__/TimelineStories.test.tsx`
 * renders every story and runs the play functions that don't need a real layout. When Storybook is
 * added, import `Meta`, `StoryObj`, `expect`, `userEvent` and `within` from it instead.
 */
import "@testing-library/jest-dom/vitest";
import {
    type BoundFunctions,
    type queries,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import clsx from "clsx";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { expect } from "vitest";
import {
    Timeline,
    type TimelinePlayback,
    TimelineWaveformProvider,
    type TimelineCreateTrackRequest,
    type TimelineMode,
    type TimelineSelection,
} from "./Timeline";
import {
    createLongTimelineStoryData,
    timelineStoryData,
    type TimelineStoryData,
} from "./TimelineStoryFixtures";

type StoryTheme = "dark" | "light";
type StoryScenario = "standard" | "long-show";
type StoryState =
    | "expanded"
    | "page-selected"
    | "track-selected"
    | "activity"
    | "no-tracks"
    | "collapsed";

interface TimelineStoryProps {
    mode: TimelineMode;
    scenario: StoryScenario;
    state: StoryState;
    theme: StoryTheme;
}

export interface StoryPlayContext {
    canvas: BoundFunctions<typeof queries>;
    canvasElement: HTMLElement;
}

interface Meta<Args> {
    title: string;
    component: (args: Args) => ReactElement;
    parameters?: Record<string, unknown>;
    argTypes?: Record<string, unknown>;
    args: Args;
    render: (args: Args) => ReactElement;
}

export interface Story<Args> {
    name?: string;
    args?: Partial<Args>;
    play?: (context: StoryPlayContext) => Promise<void>;
}

/** Wraps a story's root element the way Storybook passes it to a play function. */
export const storyPlayContext = (
    canvasElement: HTMLElement,
): StoryPlayContext => ({ canvas: within(canvasElement), canvasElement });

const storyStartBeat = (scenario: StoryScenario) =>
    scenario === "long-show" ? 120 : 11;

const initialSelection = (
    state: StoryState,
    scenario: StoryScenario,
): TimelineSelection => {
    if (scenario === "long-show") {
        return {
            kind: "range",
            range: { startBeatIndex: 64, endBeatIndex: 256 },
        };
    }
    // Page 2A's box: the range from page 2's flag to its own
    if (state === "page-selected")
        return {
            kind: "range",
            range: { startBeatIndex: 16, endBeatIndex: 24 },
        };
    // The shape clip's timeline, selected by its range (UI-9)
    if (state === "track-selected") {
        return {
            kind: "range",
            range: { startBeatIndex: 8, endBeatIndex: 24 },
        };
    }
    return {
        kind: "range",
        range: {
            startBeatIndex: state === "activity" ? 0 : 8,
            endBeatIndex: 24,
        },
    };
};

const dataForState = (
    base: TimelineStoryData,
    state: StoryState,
): TimelineStoryData =>
    state === "no-tracks" ? { ...base, timelines: [] } : base;

function TimelineStory({ mode, scenario, state, theme }: TimelineStoryProps) {
    const data = useMemo(() => {
        const base =
            scenario === "long-show"
                ? createLongTimelineStoryData()
                : timelineStoryData;
        return dataForState(base, state);
    }, [scenario, state]);
    const [selection, setSelection] = useState<TimelineSelection>(() =>
        initialSelection(state, scenario),
    );
    const [timelines, setTimelines] = useState(data.timelines);
    const [positionBeat, setPositionBeat] = useState(() =>
        storyStartBeat(scenario),
    );
    const [isPlaying, setIsPlaying] = useState(false);
    const playback: TimelinePlayback = {
        positionBeat,
        isPlaying,
        onSeek: setPositionBeat,
        onPlayingChange: setIsPlaying,
    };

    useEffect(() => {
        setSelection(initialSelection(state, scenario));
        setTimelines(data.timelines);
        setPositionBeat(storyStartBeat(scenario));
    }, [data.timelines, scenario, state]);

    const createTrack = ({ target, range }: TimelineCreateTrackRequest) => {
        setTimelines((current) => [
            ...current,
            {
                id: `created-${current.length}`,
                targetId: target.id,
                targetType: target.type,
                label: target.type === "marcher" ? "M" : "SH",
                color: "#967eff",
                startBeatIndex: range.startBeatIndex,
                endBeatIndex: range.endBeatIndex,
                legs: [
                    {
                        id: `created-leg-${current.length}`,
                        startBeatIndex: range.startBeatIndex,
                        endBeatIndex: range.endBeatIndex,
                        texture: "move",
                    },
                ],
                activitySpans: [
                    {
                        ...range,
                        active: true,
                    },
                ],
            },
        ]);
    };

    return (
        <TimelineWaveformProvider waveform={data.waveform}>
            <div
                className={clsx(
                    "bg-bg-1 text-text flex min-h-screen items-center p-24",
                    theme === "dark" && "dark",
                )}
            >
                <div className="w-full">
                    <Timeline
                        beats={data.beats}
                        pages={data.pages}
                        measures={data.measures}
                        timelines={timelines}
                        playback={playback}
                        mode={mode}
                        selection={selection}
                        selectedTarget={
                            // A page box or a clip's timeline selected with no marcher target
                            state === "track-selected" ||
                            state === "page-selected"
                                ? null
                                : state === "activity"
                                  ? { id: "marcher-1", type: "marcher" }
                                  : {
                                        id: "new-marcher",
                                        type: "marcher",
                                    }
                        }
                        onSelectionChange={(next) => {
                            // UI-9: home seeks to 0, a range to its end
                            setSelection(next);
                            if (next?.kind === "home") setPositionBeat(0);
                            if (next?.kind === "range")
                                setPositionBeat(next.range.endBeatIndex);
                        }}
                        onCreateTrack={createTrack}
                        onTimelineRangeCommit={(change) => {
                            setTimelines((current) =>
                                current.map((timeline) => {
                                    if (timeline.id !== change.timelineId) {
                                        return timeline;
                                    }
                                    const offset =
                                        change.startBeatIndex -
                                        timeline.startBeatIndex;
                                    return {
                                        ...timeline,
                                        startBeatIndex: change.startBeatIndex,
                                        endBeatIndex: change.endBeatIndex,
                                        legs: timeline.legs.map((leg) => ({
                                            ...leg,
                                            startBeatIndex:
                                                leg.startBeatIndex + offset,
                                            endBeatIndex:
                                                leg.endBeatIndex + offset,
                                        })),
                                        activitySpans:
                                            timeline.activitySpans.map(
                                                (span) => ({
                                                    ...span,
                                                    startBeatIndex:
                                                        span.startBeatIndex +
                                                        offset,
                                                    endBeatIndex:
                                                        span.endBeatIndex +
                                                        offset,
                                                }),
                                            ),
                                    };
                                }),
                            );
                        }}
                    />
                </div>
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
            control: "inline-radio",
            options: ["expanded", "collapsed"],
        },
        scenario: {
            control: "inline-radio",
            options: ["standard", "long-show"],
        },
        state: {
            control: "select",
            options: [
                "expanded",
                "page-selected",
                "track-selected",
                "activity",
                "no-tracks",
                "collapsed",
            ],
        },
        theme: {
            control: "inline-radio",
            options: ["dark", "light"],
        },
    },
    args: {
        mode: "expanded",
        scenario: "standard",
        state: "expanded",
        theme: "dark",
    },
    render: (args) => (
        <TimelineStory
            key={`${args.mode}-${args.scenario}-${args.state}-${args.theme}`}
            {...args}
        />
    ),
} satisfies Meta<TimelineStoryProps>;

export default meta;
type TimelineStoryObj = Story<TimelineStoryProps>;

export const Expanded: TimelineStoryObj = {
    play: async ({ canvas, canvasElement }) => {
        await expect(await canvas.findByText("16 counts")).toBeInTheDocument();
        await expect(canvas.getByText("Create Track")).toBeInTheDocument();
        const end = canvas.getByRole("button", { name: "Selection end" });
        const endBounds = end.getBoundingClientRect();
        const pointerY = endBounds.top + endBounds.height / 2;
        const initialPointerX = endBounds.left + endBounds.width / 2;
        await userEvent.pointer([
            {
                keys: "[MouseLeft>]",
                target: end,
                coords: { clientX: initialPointerX, clientY: pointerY },
            },
            {
                target: end,
                coords: { clientX: initialPointerX + 128, clientY: pointerY },
            },
            { keys: "[/MouseLeft]" },
        ]);
        await expect(canvas.getByText("24 counts")).toBeInTheDocument();
        const actions = canvas.getByTestId("timeline-selection-actions");
        await expect(actions).toHaveClass("flex-col");
        await expect(actions.style.transform).toBe("translateX(-100%)");
        await expect(
            canvas.getByRole("button", { name: "Create Track" }),
        ).toBeInTheDocument();
        await expect(
            canvas.getByRole("button", { name: "Zoom in" }),
        ).toBeInTheDocument();
        await userEvent.click(canvas.getByRole("button", { name: "Play" }));
        await expect(
            canvas.getByRole("button", { name: "Pause" }),
        ).toBeInTheDocument();
        const playhead = canvas.getByRole("button", {
            name: /^Playback position:/,
        });
        await userEvent.hover(playhead);
        await expect(
            within(canvasElement.ownerDocument.body).getByRole("tooltip"),
        ).toHaveTextContent(/^Pg /);
    },
};

export const PageSelected: TimelineStoryObj = {
    name: "Page Selected",
    args: { state: "page-selected" },
    play: async ({ canvas }) => {
        const page = canvas.getByRole("button", { name: "Page 2A" });
        await userEvent.click(page);
        await expect(page).toHaveAttribute("aria-pressed", "true");
        await expect(
            canvas.getByTestId("timeline-selection-range"),
        ).toBeInTheDocument();
        await expect(canvas.getByText("8 counts")).toBeInTheDocument();
        await expect(
            canvas.queryByRole("button", { name: "Create Track" }),
        ).not.toBeInTheDocument();
    },
};

export const TrackSelected: TimelineStoryObj = {
    name: "Track Selected",
    args: { state: "track-selected" },
    play: async ({ canvas }) => {
        const track = canvas.getByLabelText(/SH timeline/);
        await expect(track).toHaveAttribute("aria-pressed", "true");
        await expect(canvas.getByText("16 counts")).toBeInTheDocument();
        await expect(
            canvas.queryByRole("button", { name: "Create Track" }),
        ).not.toBeInTheDocument();
    },
};

export const ActiveBeatsAcrossTracks: TimelineStoryObj = {
    name: "Active Beats Across Tracks",
    args: { state: "activity" },
    play: async ({ canvas, canvasElement }) => {
        await expect(
            canvasElement.querySelector('[data-activity="inactive"]'),
        ).not.toBeNull();
        await expect(canvas.getByText("24 counts")).toBeInTheDocument();
        await expect(
            canvas.getByRole("button", { name: "Create Track" }),
        ).toBeInTheDocument();
    },
};

export const NoTracks: TimelineStoryObj = {
    name: "No Tracks",
    args: { state: "no-tracks" },
    play: async ({ canvas }) => {
        const create = canvas.getByRole("button", { name: "Create Track" });
        await userEvent.click(create);
        await expect(canvas.getByLabelText(/M timeline/)).toBeInTheDocument();
        await expect(
            canvas.getByRole("button", { name: "Create Track" }),
        ).toBeInTheDocument();
    },
};

export const Collapsed: TimelineStoryObj = {
    args: { mode: "collapsed", state: "collapsed" },
    play: async ({ canvas }) => {
        await expect(
            canvas.getByLabelText("Audio waveform"),
        ).toBeInTheDocument();
        await expect(
            canvas.queryByRole("button", { name: "Zoom in" }),
        ).not.toBeInTheDocument();
        await expect(canvas.getByText("16 counts")).toBeInTheDocument();
        await expect(
            canvas.getByRole("button", { name: "Create Track" }),
        ).toBeInTheDocument();
    },
};

export const LongShowPerformance: TimelineStoryObj = {
    name: "Long Show Performance",
    args: { scenario: "long-show" },
};

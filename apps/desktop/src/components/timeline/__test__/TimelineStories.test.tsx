import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import meta, {
    ActiveBeatsAcrossTracks,
    Collapsed,
    Expanded,
    LongShowPerformance,
    NoTracks,
    PageSelected,
    type Story,
    storyPlayContext,
    TrackSelected,
} from "../Timeline.stories";

/**
 * Storybook isn't set up in this repo, so the stories run here: every story renders, and every
 * play function that doesn't depend on real layout runs as written.
 */

afterEach(cleanup);

type Args = Parameters<typeof meta.render>[0];

const renderStory = (story: Story<Args>) =>
    render(meta.render({ ...meta.args, ...story.args }));

const stories: Record<string, Story<Args>> = {
    Expanded,
    PageSelected,
    TrackSelected,
    ActiveBeatsAcrossTracks,
    NoTracks,
    Collapsed,
    LongShowPerformance,
};

/** Play functions that drag by measured pixel positions, which jsdom reports as zero */
const NEEDS_LAYOUT = new Set(["Expanded"]);

describe("timeline stories", () => {
    for (const [name, story] of Object.entries(stories)) {
        it(`renders ${name}`, () => {
            renderStory(story);
            expect(screen.getByTestId("timeline-viewport")).toBeInTheDocument();
        });

        if (story.play && !NEEDS_LAYOUT.has(name)) {
            it(`passes ${name}'s play function`, async () => {
                const { container } = renderStory(story);
                await story.play!(storyPlayContext(container));
            });
        }
    }

    it("plays and selects in the Expanded story (its drag needs a real layout)", () => {
        renderStory(Expanded);
        // UI-13: the window starts on a page line, so its count is the playhead's and hides
        expect(
            screen.queryByTestId("timeline-selection-count"),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Create Track" }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Play" }));
        expect(
            screen.getByRole("button", { name: "Pause" }),
        ).toBeInTheDocument();
    });
});

import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { ExpandedTimeline } from "../TimelineVariants";
import { timelineStoryModel } from "../TimelineStoryFixtures";
import { useInputModeStore } from "@/stores/InputModeStore";
import { registerActionHandler } from "@/shortcuts/registry";
import type { ActionId } from "@/shortcuts/definitions";

// Tablet 3.5 (#888): the touch layout's compact transport. Prev, Play, Next and the readout
// always show; the rest is in a "…"; a long press on Play lists its variants. Every control runs
// a registered action. The mouse layout's row doesn't change.

const Providers = ({ children }: { children: React.ReactNode }) => (
    <TolgeeProvider tolgee={tolgee} fallback="Loading...">
        {children}
    </TolgeeProvider>
);

/** jsdom has no PointerEvent, so give a mouse event a pointerType */
const pointer = (type: string, el: Element, pointerType: string) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    fireEvent(el, event);
};

const offs: (() => void)[] = [];
/** A handler for `id` that records its runs */
const handle = (id: ActionId) => {
    const run = vi.fn();
    offs.push(registerActionHandler(id, { run, isEnabled: () => true }));
    return run;
};

afterEach(() => {
    cleanup();
    offs.splice(0).forEach((off) => off());
    vi.useRealTimers();
    act(() => {
        useInputModeStore.getState().setPreference("auto");
    });
});

const layout = (preference: "touch" | "mouse") =>
    act(() => {
        useInputModeStore.getState().setPreference(preference);
    });

function renderTimeline({
    isPlaying = false,
    playOnly,
}: { isPlaying?: boolean; playOnly?: string } = {}) {
    return render(
        <ExpandedTimeline
            model={timelineStoryModel}
            positionBeat={0}
            isPlaying={isPlaying}
            pixelsPerBeat={16}
            onPixelsPerBeatChange={() => {}}
            onPlayingChange={() => {}}
            onPlayFromPlayhead={() => {}}
            onPlayOn={() => {}}
            playOnly={playOnly}
        />,
        { wrapper: Providers },
    );
}

describe("the compact touch transport", () => {
    it("isn't in the mouse layout, which keeps its own row", () => {
        layout("mouse");
        renderTimeline();
        const row = screen.getByTestId("timeline-transport");
        expect(row.hasAttribute("data-touch-transport")).toBe(false);
        expect(screen.queryByTestId("timeline-touch-more")).toBeNull();
        expect(
            screen.getByRole("button", { name: "Fit the show" }),
        ).toBeTruthy();
    });

    it("shows Previous, Play, Next, the readout, ± and a '…'", () => {
        layout("touch");
        renderTimeline();
        const row = screen.getByTestId("timeline-transport");
        expect(row.hasAttribute("data-touch-transport")).toBe(true);
        for (const id of [
            "timeline-previous",
            "timeline-play",
            "timeline-next",
            "timeline-readout",
            "timeline-touch-zoom-in",
            "timeline-touch-more",
        ])
            expect(row.contains(screen.getByTestId(id))).toBe(true);
        // The rest of the desktop row is in the "…"
        expect(
            screen.queryByRole("button", { name: "Fit the show" }),
        ).toBeNull();
    });

    it("runs the page actions from Previous and Next, and Play's from a tap", () => {
        layout("touch");
        const next = handle("nextPage");
        const previous = handle("previousPage");
        const play = handle("playPause");
        renderTimeline();
        fireEvent.click(screen.getByTestId("timeline-next"));
        fireEvent.click(screen.getByTestId("timeline-previous"));
        pointer("pointerdown", screen.getByTestId("timeline-play"), "touch");
        pointer("pointerup", screen.getByTestId("timeline-play"), "touch");
        fireEvent.click(screen.getByTestId("timeline-play"));
        expect(next).toHaveBeenCalledTimes(1);
        expect(previous).toHaveBeenCalledTimes(1);
        expect(play).toHaveBeenCalledTimes(1);
    });

    it("a long press on Play lists Play on and Play from here, and runs the one chosen", () => {
        layout("touch");
        vi.useFakeTimers();
        const play = handle("playPause");
        const playOn = handle("playOn");
        const playPage = handle("playPage");
        renderTimeline();
        const button = screen.getByTestId("timeline-play");
        pointer("pointerdown", button, "touch");
        act(() => {
            vi.advanceTimersByTime(600);
        });
        pointer("pointerup", button, "touch");
        // The long press's click doesn't play
        fireEvent.click(button);
        expect(play).not.toHaveBeenCalled();
        const menu = screen.getByTestId("timeline-play-menu");
        expect(
            [...menu.querySelectorAll("[role=menuitem]")].map((item) =>
                item.getAttribute("aria-label"),
            ),
        ).toEqual([
            "Play from start flag and stop at playhead",
            "Play from start flag and continue",
            "Play from playhead and continue",
        ]);
        fireEvent.click(screen.getByTestId("timeline-play-menu-playOn"));
        expect(playOn).toHaveBeenCalledTimes(1);
        expect(playPage).not.toHaveBeenCalled();
        expect(screen.queryByTestId("timeline-play-menu")).toBeNull();
    });

    it("while playing, the long press offers Stop and go back, and Pause here", () => {
        layout("touch");
        vi.useFakeTimers();
        handle("playPause");
        const playPage = handle("playPage");
        renderTimeline({ isPlaying: true });
        const button = screen.getByTestId("timeline-play");
        pointer("pointerdown", button, "touch");
        act(() => {
            vi.advanceTimersByTime(600);
        });
        pointer("pointerup", button, "touch");
        expect(
            [
                ...screen
                    .getByTestId("timeline-play-menu")
                    .querySelectorAll("[role=menuitem]"),
            ].map((item) => item.getAttribute("aria-label")),
        ).toEqual(["Stop and go back", "Pause here"]);
        fireEvent.click(screen.getByTestId("timeline-play-menu-playPage"));
        expect(playPage).toHaveBeenCalledTimes(1);
    });

    it("the '…' holds the steps, playback, view and add controls as actions", () => {
        layout("touch");
        renderTimeline();
        fireEvent.click(screen.getByTestId("timeline-touch-more"));
        const panel = screen.getByTestId("timeline-touch-more-panel");
        const names = [...panel.querySelectorAll("button")].map(
            (b) => b.getAttribute("aria-label") ?? b.textContent,
        );
        for (const name of [
            "First page",
            "Previous beat",
            "Next beat",
            "Last page",
            "Loop on / off",
            "Fit the show in the timeline",
            "Edit music on / off",
            "Create page at playhead",
            "Create subset at playhead",
        ])
            expect(names).toContain(name);
        expect(
            panel.querySelector("[data-testid=timeline-speed]"),
        ).toBeTruthy();
        expect(
            panel.querySelector("[data-testid=timeline-sound]"),
        ).toBeTruthy();
    });

    it("with no variants (tempo mode), a long press on Play still plays, as a tap", () => {
        layout("touch");
        vi.useFakeTimers();
        const play = handle("playPause");
        renderTimeline({ playOnly: "Play from the playhead" });
        const button = screen.getByTestId("timeline-play");
        expect(button.getAttribute("aria-label")).toBe(
            "Play from the playhead",
        );
        expect(button.hasAttribute("aria-haspopup")).toBe(false);
        pointer("pointerdown", button, "touch");
        act(() => {
            vi.advanceTimersByTime(600);
        });
        pointer("pointerup", button, "touch");
        fireEvent.click(button);
        expect(play).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId("timeline-play-menu")).toBeNull();
    });

    it("in tempo mode while playing, Play is named Stop here", () => {
        layout("touch");
        renderTimeline({ isPlaying: true, playOnly: "Play from the playhead" });
        expect(
            screen.getByTestId("timeline-play").getAttribute("aria-label"),
        ).toBe("Stop here");
    });

    it("Expert's Compact is in the '…'", () => {
        layout("touch");
        renderTimeline();
        fireEvent.click(screen.getByTestId("timeline-touch-more"));
        expect(
            screen
                .getByTestId("timeline-touch-more-panel")
                .querySelector("[data-testid=timeline-compact]"),
        ).toBeTruthy();
    });
});

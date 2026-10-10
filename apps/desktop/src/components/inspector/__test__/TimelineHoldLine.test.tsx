import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import type { Resolver, SpanInfo } from "@openmarch/core";
import tolgee from "@/global/singletons/Tolgee";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { useKeptAssignmentsStore } from "@/timeline/useKeepLaterPages";
import { followAgainOn, keepOnPage } from "@/timeline/timelineKeepCommands";
import { isTimelineOwnKey } from "@/components/timeline/timelineHotkeys";
import TimelineHoldLine from "../TimelineHoldLine";

/**
 * UI-18: the marcher inspector's line for the selected marchers on the current page, "Moves on
 * this page" or "Hold from Page X →", a link to that page's flag, only where they agree, and only
 * in timeline mode (worded by defined-coordinates 08).
 */

/** A page whose beats run from `first` to `last` (`pageEndBeat` is `last + 1`). */
const page = (id: number, name: string, first: number, last: number) => ({
    id,
    name,
    beats: Array.from({ length: last - first + 1 }, (_, i) => ({
        index: first + i,
    })),
});
// Flags: page 1 at 0 (home), page 2 at 9, page 3 at 17, page 4 at 25
const PAGES = [
    page(1, "1", 0, 0),
    page(2, "2", 1, 8),
    page(3, "3", 9, 16),
    page(4, "4", 17, 24),
];

const mocks = vi.hoisted(() => ({
    timelineMode: true,
    selectedPage: null as unknown,
    pages: [] as unknown[],
}));

vi.mock("@/hooks/queries/useWorkspaceSettings", () => ({
    useTimelineMode: () => mocks.timelineMode,
}));
vi.mock("@/context/SelectedPageContext", () => ({
    useSelectedPage: () => ({ selectedPage: mocks.selectedPage }),
}));
vi.mock("@/hooks", () => ({
    useTimingObjects: () => ({ pages: mocks.pages }),
}));
// The keep commands write through the real API (tested on a database elsewhere); here, who asks
vi.mock("@/timeline/timelineKeepCommands", () => ({
    keepOnPage: vi.fn(() =>
        Promise.resolve({
            changed: [],
            skipped: [],
            markers: { added: [], removed: [] },
        }),
    ),
    followAgainOn: vi.fn(() =>
        Promise.resolve({
            changed: [],
            skipped: [],
            markers: { added: [], removed: [] },
        }),
    ),
}));

let nextAssignment = 1;

const span = (
    marcherId: number,
    start: number,
    end: number,
    kind: SpanInfo["kind"],
): SpanInfo => ({
    marcherId,
    start,
    end,
    kind,
    assignmentId: kind === "hold" ? null : nextAssignment++,
    transitionId: null,
    slot: null,
});

/** Marcher 4 moves on page 2, then has a kept spot (assignment 400) on page 3 */
const KEPT_SPOT: SpanInfo = {
    ...span(4, 9, 17, "founding"),
    assignmentId: 400,
};

/** Marcher 1 moves on page 2 and holds; marcher 2 also moves on page 3; marcher 3 never moves. */
const SPANS: Record<number, SpanInfo[]> = {
    1: [
        span(1, -Infinity, 1, "hold"),
        span(1, 1, 9, "founding"),
        span(1, 9, Infinity, "hold"),
    ],
    2: [
        span(2, -Infinity, 1, "hold"),
        span(2, 1, 9, "founding"),
        span(2, 9, 17, "founding"),
        span(2, 17, Infinity, "hold"),
    ],
    3: [span(3, -Infinity, Infinity, "hold")],
    4: [
        span(4, -Infinity, 1, "hold"),
        span(4, 1, 9, "founding"),
        KEPT_SPOT,
        span(4, 17, Infinity, "hold"),
    ],
};

const resolver = {
    marcherIds: () => [1, 2, 3, 4],
    spanInfos: (id: number) => SPANS[id] ?? [],
} as unknown as Resolver;

beforeAll(async () => {
    await tolgee.run();
});
afterEach(cleanup);
beforeEach(() => {
    mocks.timelineMode = true;
    mocks.pages = PAGES;
    mocks.selectedPage = PAGES[2];
    useTimelineResolverStore.setState({ resolver, version: 1 });
    useTimelineSelectionStore.getState().reset();
    useKeptAssignmentsStore.setState({ ids: new Set([400]) });
    vi.mocked(keepOnPage).mockClear();
    vi.mocked(followAgainOn).mockClear();
});

const show = (
    marcherIds: number[],
    nameOf?: (id: number) => string | undefined,
) =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <TimelineHoldLine marcherIds={marcherIds} nameOf={nameOf} />
        </TolgeeProvider>,
    );

const otName = (id: number) => `OT${id}`;

const line = () => screen.queryByTestId("timeline-hold-line");
const keepHere = () => screen.queryByTestId("timeline-keep-here");
const followAgain = () => screen.queryByTestId("timeline-follow-again");
const following = () => screen.queryByTestId("timeline-following-pages");

describe("TimelineHoldLine", () => {
    it("says a marcher holding on the page has held since its last move, and jumps there", async () => {
        mocks.selectedPage = PAGES[3];
        show([1]);
        expect(line()?.textContent).toBe("Hold from Page 2");
        // Its tooltip says where the link goes, and why
        fireEvent.focus(line()!);
        expect(
            (
                await screen.findAllByText(
                    "Go to Page 2, where these marchers last moved",
                )
            ).length,
        ).toBeGreaterThan(0);
        fireEvent.click(line()!);
        expect(useTimelineSelectionStore.getState().playheadBeat).toBe(9);
    });

    it("says a marcher that never moved holds from the start, not from the first page by name, and jumps there", async () => {
        mocks.selectedPage = PAGES[3];
        useTimelineSelectionStore.getState().seek(17);
        show([3]);
        expect(line()?.textContent).toBe("Hold from the start");
        fireEvent.focus(line()!);
        expect(
            (await screen.findAllByText("Go to the start")).length,
        ).toBeGreaterThan(0);
        fireEvent.click(line()!);
        expect(useTimelineSelectionStore.getState().playheadBeat).toBe(0);
    });

    it("is a real button styled as a link, in the normal text color, with a focus ring", () => {
        mocks.selectedPage = PAGES[3];
        show([1]);
        const link = line()!;
        expect(link.tagName).toBe("BUTTON");
        expect(link.getAttribute("type")).toBe("button");
        expect(link.className).toMatch(/\bunderline\b/);
        expect(link.className).toMatch(/focus-visible:ring/);
        expect(link.className).toMatch(/\btext-text\b/);
        expect(link.className).not.toMatch(/text-text\/60/);
        // The arrow is drawn, not read
        expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
            "true",
        );
    });

    it("says a marcher whose own move ends on the page moves on this page, as plain text", () => {
        show([2]);
        expect(line()?.textContent).toBe("Moves on this page");
        expect(line()?.tagName).toBe("P");
        expect(line()?.className).not.toMatch(/text-text\/60/);
    });

    it("names the page held from only where every marcher agrees; otherwise says they hold here, with Keep here", () => {
        mocks.selectedPage = PAGES[3];
        show([1, 2]);
        // Marcher 1 holds since page 2, marcher 2 since page 3: both follow here
        expect(line()?.textContent).toBe("These marchers hold here");
        expect(keepHere()).not.toBeNull();
        cleanup();
        mocks.selectedPage = PAGES[2];
        show([1, 3]);
        // Marcher 1 holds since page 2, marcher 3 since the start: both can be kept
        expect(line()?.textContent).toBe("These marchers hold here");
        expect(keepHere()).not.toBeNull();
        cleanup();
        show([1, 2]);
        // Marcher 2 moves on page 3
        expect(line()?.textContent).toBe("Some of these marchers hold here");
        expect(keepHere()).toHaveAccessibleDescription(
            "Keep 1 of the 2 selected on Page 3, so editing Page 2 won't move them here",
        );
        cleanup();
        show([1]);
        expect(line()?.textContent).toBe("Hold from Page 2");
    });

    describe("keep later pages (UI-18)", () => {
        it("on a page they hold on: Keep here, with a tooltip, keeps them there", () => {
            show([1]);
            expect(line()?.textContent).toBe("Hold from Page 2");
            const button = keepHere()!;
            expect(button.tagName).toBe("BUTTON");
            expect(button.textContent).toBe("Keep here");
            expect(button).toHaveAccessibleDescription(
                "Keep these marchers on Page 3, so editing Page 2 won't move them here",
            );
            expect(followAgain()).toBeNull();
            fireEvent.click(button);
            expect(keepOnPage).toHaveBeenCalledWith({ start: 9, end: 17 }, [1]);
            // The line still links to page 2
            fireEvent.click(line()!);
            expect(useTimelineSelectionStore.getState().playheadBeat).toBe(9);
        });

        it("Enter and Space press Keep here, Follow again and the hold link, not the app's shortcuts (pre-merge review U3)", () => {
            const owns = (el: Element) =>
                ["Enter", " "].every((k) =>
                    isTimelineOwnKey(
                        { key: k, code: k, ctrlKey: false, metaKey: false },
                        el,
                    ),
                );
            show([1, 4]);
            expect(owns(keepHere()!)).toBe(true);
            expect(owns(followAgain()!)).toBe(true);
            cleanup();
            show([1]);
            expect(owns(line()!)).toBe(true);
        });

        it("on a page where they were kept: Kept on this page, with Follow again", () => {
            show([4]);
            expect(line()?.textContent).toBe("Kept on this page");
            expect(keepHere()).toBeNull();
            const button = followAgain()!;
            expect(button.textContent).toBe("Follow again");
            expect(button).toHaveAccessibleDescription(
                "Let these marchers follow Page 2 again, so editing Page 2 moves them here too",
            );
            fireEvent.click(button);
            expect(followAgain).toBeDefined();
            expect(followAgainOn).toHaveBeenCalledWith(
                { start: 9, end: 17 },
                [4],
            );
        });

        it("a move that goes nowhere without the kept marker is the marcher's own move", () => {
            useKeptAssignmentsStore.setState({ ids: new Set() });
            show([4]);
            expect(line()?.textContent).toBe("Moves on this page");
            expect(followAgain()).toBeNull();
        });

        it("a mix of kept and following: says some are kept, and both buttons name their counts", () => {
            show([1, 4]);
            expect(line()?.textContent).toBe(
                "Some of these marchers are kept on this page",
            );
            // The long wording puts the buttons on a row of their own, without a leading dot
            expect(keepHere()!.parentElement!.firstElementChild).toBe(
                keepHere(),
            );
            expect(keepHere()).toHaveAccessibleDescription(
                "Keep 1 of the 2 selected on Page 3, so editing Page 2 won't move them here",
            );
            expect(followAgain()).toHaveAccessibleDescription(
                "Let 1 of the 2 selected follow Page 2 again, so editing Page 2 moves them here too",
            );
            fireEvent.click(keepHere()!);
            expect(keepOnPage).toHaveBeenCalledWith({ start: 9, end: 17 }, [1]);
            fireEvent.click(followAgain()!);
            expect(followAgainOn).toHaveBeenCalledWith(
                { start: 9, end: 17 },
                [4],
            );
        });

        it("on the page they move: the quiet line names the later pages that follow", () => {
            mocks.selectedPage = PAGES[1];
            show([1]);
            expect(line()?.textContent).toBe("Moves on this page");
            expect(keepHere()).toBeNull();
            expect(following()?.textContent).toBe(
                "Pages 3–4 follow these marchers",
            );
            expect(following()?.className).toMatch(/text-text-subtitle/);
            cleanup();
            // Marcher 2 moves again on page 3
            show([1, 2]);
            expect(following()?.textContent).toBe(
                "Pages 3–4 follow some of these marchers",
            );
            cleanup();
            // Marcher 4 was kept on page 3
            show([4]);
            expect(following()).toBeNull();
            cleanup();
            mocks.selectedPage = PAGES[2];
            show([1]);
            expect(following()?.textContent).toBe(
                "Page 4 follows these marchers",
            );
        });

        it("offers Keep here for marchers that never moved, ahead of any move", () => {
            show([3]);
            expect(line()?.textContent).toBe("Hold from the start");
            expect(keepHere()).toHaveAccessibleDescription(
                "Keep these marchers on Page 3, so editing earlier pages won't move them here",
            );
            fireEvent.click(keepHere()!);
            expect(keepOnPage).toHaveBeenCalledWith({ start: 9, end: 17 }, [3]);
            // Every later page follows them: the quiet line doesn't say so
            expect(following()).toBeNull();
        });

        it("names the marchers in the tooltips, up to three", () => {
            show([1], otName);
            expect(keepHere()).toHaveAccessibleDescription(
                "Keep OT1 on Page 3, so editing Page 2 won't move them here",
            );
            cleanup();
            show([1, 4], otName);
            expect(keepHere()).toHaveAccessibleDescription(
                "Keep OT1 (1 of the 2 selected) on Page 3, so editing Page 2 won't move them here",
            );
            expect(followAgain()).toHaveAccessibleDescription(
                "Let OT4 (1 of the 2 selected) follow Page 2 again, so editing Page 2 moves them here too",
            );
            cleanup();
            show([4], otName);
            expect(followAgain()).toHaveAccessibleDescription(
                "Let OT4 follow Page 2 again, so editing Page 2 moves them here too",
            );
        });

        it("says (K) on the button K would run here", async () => {
            show([1], otName);
            expect(keepHere()).toHaveAttribute("aria-keyshortcuts", "K");
            fireEvent.focus(keepHere()!);
            expect(
                (
                    await screen.findAllByText(
                        "Keep OT1 on Page 3, so editing Page 2 won't move them here (K)",
                    )
                ).length,
            ).toBeGreaterThan(0);
            cleanup();
            // Kept here: K lets them follow again
            show([4]);
            expect(followAgain()).toHaveAttribute("aria-keyshortcuts", "K");
            cleanup();
            // Some follow, some kept: K keeps the rest, so only Keep here says K
            show([1, 4]);
            expect(keepHere()).toHaveAttribute("aria-keyshortcuts", "K");
            expect(followAgain()).not.toHaveAttribute("aria-keyshortcuts");
        });
    });

    it("renders nothing on the first page, with nothing selected, or out of timeline mode", () => {
        mocks.selectedPage = PAGES[0];
        show([1]);
        expect(line()).toBeNull();
        cleanup();
        mocks.selectedPage = PAGES[2];
        show([]);
        expect(line()).toBeNull();
        cleanup();
        mocks.timelineMode = false;
        show([1]);
        expect(line()).toBeNull();
    });
});

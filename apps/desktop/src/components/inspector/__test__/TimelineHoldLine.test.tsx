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
import { setAsShownOn } from "@/timeline/timelineSetAsShown";
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
    selectedPage: null as unknown,
    pages: [] as unknown[],
}));

vi.mock("@/context/SelectedPageContext", () => ({
    useSelectedPage: () => ({ selectedPage: mocks.selectedPage }),
}));
vi.mock("@/hooks", () => ({
    useTimingObjects: () => ({ pages: mocks.pages }),
}));
// Set as shown writes through the real API (tested on a database elsewhere); here, who asks
vi.mock("@/timeline/timelineSetAsShown", () => ({
    setAsShownOn: vi.fn(() => Promise.resolve({ changed: [], skipped: [] })),
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
    assignmentEnd: null,
});

/**
 * Marcher 1 moves on page 2 and holds; marcher 2 also moves on page 3; marcher 3 never moves;
 * marcher 4 moves on page 2, then has a move that goes nowhere on page 3 (Set as shown there).
 */
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
        span(4, 9, 17, "founding"),
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
    mocks.pages = PAGES;
    mocks.selectedPage = PAGES[2];
    useTimelineResolverStore.setState({ resolver, version: 1 });
    useTimelineSelectionStore.getState().reset();
    vi.mocked(setAsShownOn).mockClear();
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
const setAsShown = () => screen.queryByTestId("timeline-set-as-shown");
const following = () => screen.queryByTestId("timeline-following-pages");

describe("TimelineHoldLine", () => {
    it("says a marcher holding on the page has held since its last move, and jumps there", async () => {
        mocks.selectedPage = PAGES[3];
        show([1]);
        expect(line()?.textContent).toBe("Last moved on Page 2");
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
        expect(line()?.textContent).toBe("No moves since the start");
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

    it("names the page held from only where every marcher agrees; otherwise says they hold here, with Set as shown", () => {
        mocks.selectedPage = PAGES[3];
        show([1, 2]);
        // Marcher 1 holds since page 2, marcher 2 since page 3: both follow here
        expect(line()?.textContent).toBe(
            "These marchers have no position of their own here",
        );
        expect(setAsShown()).not.toBeNull();
        cleanup();
        mocks.selectedPage = PAGES[2];
        show([1, 3]);
        // Marcher 1 holds since page 2, marcher 3 since the start: both can be set
        expect(line()?.textContent).toBe(
            "These marchers have no position of their own here",
        );
        expect(setAsShown()).not.toBeNull();
        cleanup();
        show([1, 2]);
        // Marcher 2 moves on page 3
        expect(line()?.textContent).toBe(
            "Some of these marchers have no position of their own here",
        );
        expect(setAsShown()).toHaveAccessibleDescription(
            "Make 1 of the 2 selected defined on Page 3 where they are shown, so editing Page 2 won't move them here",
        );
        cleanup();
        show([1]);
        expect(line()?.textContent).toBe("Last moved on Page 2");
    });

    describe("keep later pages (UI-18)", () => {
        it("on a page they hold on: Set as shown, with a tooltip, sets them there", () => {
            show([1]);
            expect(line()?.textContent).toBe("Last moved on Page 2");
            const button = setAsShown()!;
            expect(button.tagName).toBe("BUTTON");
            expect(button.textContent).toBe("Define as shown");
            expect(button).toHaveAccessibleDescription(
                "Make these marchers defined on Page 3 where they are shown, so editing Page 2 won't move them here",
            );
            expect(button).not.toHaveAttribute("aria-keyshortcuts");
            expect(screen.queryByTestId("timeline-follow-again")).toBeNull();
            fireEvent.click(button);
            expect(setAsShownOn).toHaveBeenCalledWith(
                { start: 9, end: 17 },
                [1],
            );
            // The line still links to page 2
            fireEvent.click(line()!);
            expect(useTimelineSelectionStore.getState().playheadBeat).toBe(9);
        });

        it("Enter and Space press Set as shown and the hold link, not the app's shortcuts (pre-merge review U3)", () => {
            const owns = (el: Element) =>
                ["Enter", " "].every((k) =>
                    isTimelineOwnKey(
                        { key: k, code: k, ctrlKey: false, metaKey: false },
                        el,
                    ),
                );
            show([1, 4]);
            expect(owns(setAsShown()!)).toBe(true);
            cleanup();
            show([1]);
            expect(owns(line()!)).toBe(true);
        });

        it("a page set as shown is the marcher's own move: no kept line, no Follow again", () => {
            show([4]);
            expect(line()?.textContent).toBe("Moves on this page");
            expect(setAsShown()).toBeNull();
            expect(screen.queryByTestId("timeline-follow-again")).toBeNull();
            expect(screen.queryByText("Kept on this page")).toBeNull();
        });

        it("a mix of set and following: says some hold here, and Set as shown names its count", () => {
            show([1, 4]);
            expect(line()?.textContent).toBe(
                "Some of these marchers have no position of their own here",
            );
            expect(setAsShown()).toHaveAccessibleDescription(
                "Make 1 of the 2 selected defined on Page 3 where they are shown, so editing Page 2 won't move them here",
            );
            fireEvent.click(setAsShown()!);
            expect(setAsShownOn).toHaveBeenCalledWith(
                { start: 9, end: 17 },
                [1],
            );
        });

        it("on the page they move: the quiet line names the later pages that follow", () => {
            mocks.selectedPage = PAGES[1];
            show([1]);
            expect(line()?.textContent).toBe("Moves on this page");
            expect(setAsShown()).toBeNull();
            expect(following()?.textContent).toBe(
                "Pages 3–4 show these marchers where this page leaves them",
            );
            expect(following()?.className).toMatch(/text-text-subtitle/);
            cleanup();
            // Marcher 2 moves again on page 3
            show([1, 2]);
            expect(following()?.textContent).toBe(
                "Pages 3–4 show some of these marchers where this page leaves them",
            );
            cleanup();
            // Marcher 4 is set on page 3
            show([4]);
            expect(following()).toBeNull();
            cleanup();
            mocks.selectedPage = PAGES[2];
            show([1]);
            expect(following()?.textContent).toBe(
                "Page 4 shows these marchers where this page leaves them",
            );
        });

        it("offers Set as shown for marchers that never moved, ahead of any move", () => {
            show([3]);
            expect(line()?.textContent).toBe("No moves since the start");
            expect(setAsShown()).toHaveAccessibleDescription(
                "Make these marchers defined on Page 3 where they are shown, so editing earlier pages won't move them here",
            );
            fireEvent.click(setAsShown()!);
            expect(setAsShownOn).toHaveBeenCalledWith(
                { start: 9, end: 17 },
                [3],
            );
            // Every later page follows them: the quiet line doesn't say so
            expect(following()).toBeNull();
        });

        it("names the marchers in the tooltips, up to three", () => {
            show([1], otName);
            expect(setAsShown()).toHaveAccessibleDescription(
                "Make OT1 defined on Page 3 where they are shown, so editing Page 2 won't move them here",
            );
            cleanup();
            show([1, 4], otName);
            expect(setAsShown()).toHaveAccessibleDescription(
                "Make OT1 (1 of the 2 selected) defined on Page 3 where they are shown, so editing Page 2 won't move them here",
            );
        });
    });

    it("renders nothing on the first page, or with nothing selected", () => {
        mocks.selectedPage = PAGES[0];
        show([1]);
        expect(line()).toBeNull();
        cleanup();
        mocks.selectedPage = PAGES[2];
        show([]);
        expect(line()).toBeNull();
    });
});

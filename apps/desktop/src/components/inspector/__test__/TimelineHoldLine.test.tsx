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
import { useHeldMarksStore } from "@/timeline/useHeldMarks";
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
 * marcher 4 moves on page 2, then has a move that goes nowhere on page 3 (Set as shown there);
 * marcher 5 moves as marcher 1 does.
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
    5: [
        span(5, -Infinity, 1, "hold"),
        span(5, 1, 9, "founding"),
        span(5, 9, Infinity, "hold"),
    ],
    4: [
        span(4, -Infinity, 1, "hold"),
        span(4, 1, 9, "founding"),
        span(4, 9, 17, "founding"),
        span(4, 17, Infinity, "hold"),
    ],
};

const resolver = {
    marcherIds: () => [1, 2, 3, 4, 5],
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
    useHeldMarksStore.setState({ marks: [] });
});

const show = (marcherIds: number[]) =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <TimelineHoldLine marcherIds={marcherIds} />
        </TolgeeProvider>,
    );

const line = () => screen.queryByTestId("timeline-hold-line");

describe("TimelineHoldLine", () => {
    it("says a Not defined marcher shows its last move's page, and jumps there", async () => {
        mocks.selectedPage = PAGES[3];
        show([1]);
        expect(line()?.textContent).toBe("Not defined · showing Page 2");
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
        expect(line()?.textContent).toBe("Not defined · showing the start");
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

    it("names the page held from only where every marcher agrees, and says nothing otherwise", () => {
        mocks.selectedPage = PAGES[3];
        show([1, 2]);
        // Marcher 1 holds since page 2, marcher 2 since page 3
        expect(line()).toBeNull();
        expect(screen.queryByTestId("timeline-set-as-shown")).toBeNull();
        expect(screen.queryByTestId("timeline-following-pages")).toBeNull();
        cleanup();
        mocks.selectedPage = PAGES[2];
        show([1, 2]);
        // Marcher 2 moves on page 3
        expect(line()).toBeNull();
        cleanup();
        show([1]);
        expect(line()?.textContent).toBe("Not defined · showing Page 2");
        expect(screen.queryByTestId("timeline-set-as-shown")).toBeNull();
    });

    it("says a Held marcher is Held since its arrival's page (#478)", () => {
        mocks.selectedPage = PAGES[3];
        useHeldMarksStore.setState({
            marks: [{ id: 1, marcherId: 1, start: 9, end: 25 }],
        });
        show([1]);
        expect(line()?.textContent).toBe("Held · since Page 2");
    });

    it("names a hold nothing arrives at by the spot it borrows, past Not defined pages (#474; R3, demo M7)", async () => {
        // Marcher 1 arrives on page 2; page 3 is Not defined; Hold from previous page on page 4:
        // nothing arrives at page 3's flag, so the hold borrows page 2's spot
        mocks.selectedPage = PAGES[3];
        useHeldMarksStore.setState({
            marks: [{ id: 1, marcherId: 1, start: 17, end: 25 }],
        });
        show([1]);
        expect(line()?.textContent).toBe("Held · Page 2's spot");
        fireEvent.focus(line()!);
        expect(
            (
                await screen.findAllByText(
                    "Go to Page 2, whose spot this hold keeps",
                )
            ).length,
        ).toBeGreaterThan(0);
        fireEvent.click(line()!);
        expect(useTimelineSelectionStore.getState().playheadBeat).toBe(9);
        cleanup();
        // Page 3 itself is still Not defined, showing page 2
        mocks.selectedPage = PAGES[2];
        show([1]);
        expect(line()?.textContent).toBe("Not defined · showing Page 2");
    });

    it("names the new source once the set a borrowed hold borrows from is gone (#474)", () => {
        // Marcher 2 last moves on page 3 (9–17); held on page 4 [17, 25) it arrives there, so
        // hold page 4 from a later flag instead: marcher 4's moves end at 17, held from 17 is an
        // arrival hold. Marcher 2 without its page 3 move borrows page 2's spot.
        mocks.selectedPage = PAGES[3];
        useHeldMarksStore.setState({
            marks: [{ id: 1, marcherId: 2, start: 17, end: 25 }],
        });
        show([2]);
        expect(line()?.textContent).toBe("Held · since Page 3");
        cleanup();
        const was = SPANS[2]!;
        SPANS[2] = [
            span(2, -Infinity, 1, "hold"),
            span(2, 1, 9, "founding"),
            span(2, 9, Infinity, "hold"),
        ];
        try {
            useTimelineResolverStore.setState({ resolver, version: 2 });
            show([2]);
            expect(line()?.textContent).toBe("Held · Page 2's spot");
        } finally {
            SPANS[2] = was;
        }
    });

    it("says a never-moved marcher held on this page only is Held since that page, not the start", () => {
        mocks.selectedPage = PAGES[3];
        useHeldMarksStore.setState({
            marks: [{ id: 1, marcherId: 3, start: 17, end: 25 }],
        });
        show([3]);
        expect(line()?.textContent).toBe("Held · since Page 3");
    });

    it("names neither state when Held and Not defined marchers share the page", () => {
        mocks.selectedPage = PAGES[3];
        useHeldMarksStore.setState({
            marks: [{ id: 1, marcherId: 1, start: 9, end: 25 }],
        });
        // Both hold since page 2: marcher 1 Held, marcher 5 Not defined
        show([1, 5]);
        expect(line()?.textContent).toBe("Last moved on Page 2");
    });

    it("is Not defined after a Held hold ends", () => {
        mocks.selectedPage = PAGES[3];
        useHeldMarksStore.setState({
            marks: [{ id: 1, marcherId: 1, start: 9, end: 17 }],
        });
        show([1]);
        expect(line()?.textContent).toBe("Not defined · showing Page 2");
    });

    it("Enter and Space press the hold link, not the app's shortcuts (pre-merge review U3)", () => {
        const owns = (el: Element) =>
            ["Enter", " "].every((k) =>
                isTimelineOwnKey(
                    { key: k, code: k, ctrlKey: false, metaKey: false },
                    el,
                ),
            );
        show([1]);
        expect(owns(line()!)).toBe(true);
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

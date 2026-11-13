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
import { useEditorModeStore } from "@/stores/EditorModeStore";
import { isTimelineOwnKey } from "@/components/timeline/timelineHotkeys";
import TimelineHoldLine, { TimelineHeldCount } from "../TimelineHoldLine";

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
    /** The placed shapes carried onto the flag asked: members and the beat each was placed at */
    carried: [] as { members: number[]; endBeat: number }[],
}));

vi.mock("@/context/SelectedPageContext", () => ({
    useSelectedPage: () => ({ selectedPage: mocks.selectedPage }),
}));
vi.mock("@/hooks", () => ({
    useTimingObjects: () => ({ pages: mocks.pages }),
}));
// Which shapes are carried is boxesAt's rule (tested with it); here, what the line makes of them
vi.mock("@/shapes/placed/placedBoxStore", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("@/shapes/placed/placedBoxStore")
    >()),
    placedBoxesAt: () =>
        mocks.carried.map(({ members, endBeat }) => ({
            recipe: { members: members.map((marcherId) => ({ marcherId })) },
            endBeat,
        })),
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
    mocks.carried = [];
});

const show = (marcherIds: number[]) =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <TimelineHeldCount marcherIds={marcherIds} />
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

    it("says a Held marcher is Held since the page its mark starts on, past Not defined pages (R3, demo M7)", async () => {
        // Marcher 1 arrives on page 2; page 3 is Not defined; Hold from last keyframe on page 4
        mocks.selectedPage = PAGES[3];
        useHeldMarksStore.setState({
            marks: [{ id: 1, marcherId: 1, start: 17, end: 25 }],
        });
        show([1]);
        expect(line()?.textContent).toBe("Held · since Page 3");
        fireEvent.focus(line()!);
        expect(
            (await screen.findAllByText("Go to Page 3, where this hold starts"))
                .length,
        ).toBeGreaterThan(0);
        fireEvent.click(line()!);
        expect(useTimelineSelectionStore.getState().playheadBeat).toBe(17);
        cleanup();
        // Page 3 itself is still Not defined, showing page 2
        mocks.selectedPage = PAGES[2];
        show([1]);
        expect(line()?.textContent).toBe("Not defined · showing Page 2");
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

    it("says a carried shape's members are Held since the page the shape was placed on, and jumps there", async () => {
        // Marcher 1 arrives on page 2 into a shape placed there, carried onto page 4
        mocks.selectedPage = PAGES[3];
        mocks.carried = [{ members: [1], endBeat: 9 }];
        show([1]);
        expect(line()?.textContent).toBe("Held · since Page 2");
        fireEvent.focus(line()!);
        expect(
            (await screen.findAllByText("Go to Page 2, where this hold starts"))
                .length,
        ).toBeGreaterThan(0);
        fireEvent.click(line()!);
        expect(useTimelineSelectionStore.getState().playheadBeat).toBe(9);
        cleanup();
        // Marcher 3 never moves, but the shape around it was laid out on page 3: Held since then
        mocks.carried = [{ members: [3], endBeat: 17 }];
        show([3]);
        expect(line()?.textContent).toBe("Held · since Page 3");
        cleanup();
        // A shape placed on the first page holds from the start
        mocks.carried = [{ members: [3], endBeat: 0 }];
        show([3]);
        expect(line()?.textContent).toBe("Held · since the start");
    });

    it("reads Held for Held and carried marchers together, and names neither with Not defined ones", () => {
        mocks.selectedPage = PAGES[3];
        useHeldMarksStore.setState({
            marks: [{ id: 1, marcherId: 1, start: 9, end: 25 }],
        });
        mocks.carried = [{ members: [5], endBeat: 9 }];
        // Marcher 1 Held, marcher 5 carried, both since page 2
        show([1, 5]);
        expect(line()?.textContent).toBe("Held · since Page 2");
        cleanup();
        useHeldMarksStore.setState({ marks: [] });
        // Marcher 1 Not defined, marcher 5 carried
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

describe("TimelineHeldCount, how many are Held (#476, #805)", () => {
    /** Marcher 1 Held from its page 2 arrival (9) through page 4; marcher 5 moves as 1 does */
    const held = () =>
        useHeldMarksStore.setState({
            marks: [{ id: 1, marcherId: 1, start: 9, end: 25 }],
        });
    const setWindow = (start: number, end: number) =>
        useTimelineSelectionStore.setState({
            selection: { kind: "range", start, end },
        });
    const count = () => screen.queryByTestId("timeline-held-count");

    beforeEach(() => {
        useEditorModeStore.setState({ mode: "expert" });
        held();
    });
    afterEach(() => useEditorModeStore.setState({ mode: null }));

    it("says how many are Held when only some of the selection is, and no drag line", () => {
        setWindow(9, 13);
        show([1, 5]);
        expect(count()?.textContent).toBe("1 of 2 selected Held");
        expect(screen.queryByText(/^Drag:/)).toBeNull();
        expect(screen.queryByRole("button", { name: /Make all/ })).toBeNull();
    });

    it("says nothing when all or none of the selection is Held", () => {
        setWindow(9, 13);
        show([1]);
        expect(count()).toBeNull();
        cleanup();
        show([5]);
        expect(count()).toBeNull();
    });
});

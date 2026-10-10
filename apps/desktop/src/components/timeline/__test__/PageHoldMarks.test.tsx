import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { describeDbTests, schema } from "@/test/base";
import { timelineFixtureMode } from "@/test/timelineMode";
import {
    harnessQueryClient,
    probed,
    selectPageAndMarchers,
    mountFeature,
} from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { updateMarcherPages } from "@/db-functions/marcherPage";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { ExpandedTimeline } from "../TimelineVariants";
import { timelineStoryModel } from "../TimelineStoryFixtures";
import type { LabeledHoldMarks } from "../PageHoldMark";
import PageTimeline from "../PageTimeline";

/**
 * The selection's hold marks on the page boxes (docs/timeline/ui.md UI-18): drawn only with a
 * selection, a key where it moves and a bar where it holds, with the words on the page box.
 */

// Page-mode queries invalidate through the app's query client; use the harness's
const app = vi.hoisted(() => ({ client: (): unknown => null }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client();
    },
}));
app.client = harnessQueryClient;

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    stopTimelineResolver();
});

const commonProps = {
    model: timelineStoryModel,
    positionBeat: 11,
    isPlaying: false,
    pixelsPerBeat: 16,
    showTransport: false,
};

describe("the timeline's page boxes", () => {
    it("draw no marks without a selection's marks", () => {
        const { container } = render(<ExpandedTimeline {...commonProps} />);
        expect(
            container.querySelector('[data-testid="page-hold-mark"]'),
        ).toBeNull();
        const box = screen.getByRole("button", { name: "Page 2" });
        expect(box).not.toHaveAttribute("title");
        expect(box).not.toHaveAttribute("aria-describedby");
    });

    it("draw a key where the selection moves and a bar where it holds, with the words on the box", () => {
        const holdMarks: LabeledHoldMarks = new Map([
            [
                "page-2",
                {
                    mark: { kind: "moves" },
                    label: "Selected marchers move on this page",
                    hint: "They have their own move here",
                },
            ],
            [
                "page-2a",
                {
                    mark: { kind: "holds", from: "2" },
                    label: "Selected marchers hold from Page 2",
                    hint: "They stand where Page 2 left them",
                },
            ],
            [
                "page-4",
                {
                    mark: { kind: "mixed", from: "2" },
                    label: "Some selected marchers hold from Page 2",
                    hint: "Some have their own move here",
                },
            ],
        ]);
        render(<ExpandedTimeline {...commonProps} holdMarks={holdMarks} />);
        const markOf = (name: string) => {
            const box = screen.getByRole("button", { name });
            return {
                box,
                kind: box
                    .querySelector('[data-testid="page-hold-mark"]')
                    ?.getAttribute("data-hold-mark"),
            };
        };
        // The accessible name stays the page's, so the box is found as before
        expect(markOf("Page 1").kind).toBeUndefined();
        const moves = markOf("Page 2");
        expect(moves.kind).toBe("moves");
        expect(moves.box).toHaveAccessibleDescription(
            "Selected marchers move on this page. They have their own move here",
        );
        const holds = markOf("Page 2A");
        expect(holds.kind).toBe("holds");
        expect(holds.box).toHaveAccessibleDescription(
            "Selected marchers hold from Page 2. They stand where Page 2 left them",
        );
        // A real tooltip, not the native one
        expect(holds.box).not.toHaveAttribute("title");
        const mixed = markOf("Page 4");
        expect(mixed.kind).toBe("mixed");
        expect(mixed.box).toHaveAccessibleDescription(
            "Some selected marchers hold from Page 2. Some have their own move here",
        );
        // The initial page (home) never has one
        expect(
            screen
                .getByTestId("timeline-initial-page")
                .querySelector('[data-testid="page-hold-mark"]'),
        ).toBeNull();
    });
});

/** A held box (Page 2A), a box the selection moves on (Page 2), and none elsewhere. */
const TOOLTIP_MARKS: LabeledHoldMarks = new Map([
    [
        "page-2",
        {
            mark: { kind: "moves" },
            label: "Selected marchers move on this page",
            hint: "They have their own move here",
        },
    ],
    [
        "page-2a",
        {
            mark: { kind: "holds", from: "2" },
            label: "Selected marchers hold from Page 2",
            hint: "They stand where Page 2 left them",
        },
    ],
]);

const press = (target: Element, type: string, clientX: number, button = 0) =>
    fireEvent(target, new MouseEvent(type, { bubbles: true, button, clientX }));
const tooltip = () => screen.queryByRole("tooltip");
/** Longer than the tooltip's 500ms hover delay */
const pastTheDelay = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 700)));

describe("the hold mark's tooltip on the timeline's page boxes", () => {
    it("shows the words and their hint above a held box after a hover", async () => {
        render(<ExpandedTimeline {...commonProps} holdMarks={TOOLTIP_MARKS} />);
        const box = screen.getByRole("button", { name: "Page 2A" });
        fireEvent.pointerMove(box);
        // Not straight away: a pass over the ruler doesn't flash one
        expect(tooltip()).not.toBeInTheDocument();
        const shown = await screen.findByRole("tooltip", {}, { timeout: 2000 });
        expect(shown).toHaveTextContent(
            "Selected marchers hold from Page 2They stand where Page 2 left them",
        );
        expect(
            document.querySelector('[data-side="top"]'),
            "above the box",
        ).not.toBeNull();
        fireEvent.pointerLeave(box);
        await waitFor(() => expect(tooltip()).not.toBeInTheDocument());
    });

    it("shows on keyboard focus, for a box the selection moves on", async () => {
        render(<ExpandedTimeline {...commonProps} holdMarks={TOOLTIP_MARKS} />);
        const box = screen.getByRole("button", { name: "Page 2" });
        act(() => box.focus());
        expect(await screen.findByRole("tooltip")).toHaveTextContent(
            "Selected marchers move on this pageThey have their own move here",
        );
        // The screen reader's description stays the box's own
        expect(box).toHaveAccessibleDescription(
            "Selected marchers move on this page. They have their own move here",
        );
        act(() => box.blur());
        await waitFor(() => expect(tooltip()).not.toBeInTheDocument());
    });

    it("has none without a selection, or on a box without a mark", async () => {
        const { unmount } = render(<ExpandedTimeline {...commonProps} />);
        const box = screen.getByRole("button", { name: "Page 2A" });
        fireEvent.pointerMove(box);
        act(() => box.focus());
        await pastTheDelay();
        expect(tooltip()).not.toBeInTheDocument();
        unmount();

        render(<ExpandedTimeline {...commonProps} holdMarks={TOOLTIP_MARKS} />);
        const unmarked = screen.getByRole("button", { name: "Page 4" });
        fireEvent.pointerMove(unmarked);
        act(() => unmarked.focus());
        await pastTheDelay();
        expect(tooltip()).not.toBeInTheDocument();
    });

    it("closes on a press, and the press still selects the box", async () => {
        const onSelectionChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                holdMarks={TOOLTIP_MARKS}
                onSelectionChange={onSelectionChange}
            />,
        );
        const box = screen.getByRole("button", { name: "Page 2A" });
        fireEvent.pointerMove(box);
        await screen.findByRole("tooltip", {}, { timeout: 2000 });
        press(box, "pointerdown", 130);
        await waitFor(() => expect(tooltip()).not.toBeInTheDocument());
        press(box, "pointerup", 130);
        fireEvent.click(box, { detail: 1 });
        expect(onSelectionChange).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "range" }),
        );
        // Still over the box after the click: it stays closed until the pointer leaves
        fireEvent.pointerMove(box);
        await pastTheDelay();
        expect(tooltip()).not.toBeInTheDocument();
    });

    it("never opens partway through a scrub that starts before the hover's delay", async () => {
        const onSeek = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                holdMarks={TOOLTIP_MARKS}
                onSeek={onSeek}
            />,
        );
        const box = screen.getByRole("button", { name: "Page 2A" });
        fireEvent.pointerMove(box);
        press(box, "pointerdown", 130);
        press(box, "pointermove", 200);
        await pastTheDelay();
        expect(tooltip()).not.toBeInTheDocument();
        expect(onSeek).toHaveBeenCalledWith(13, { gesture: "drag" });
        press(box, "pointerup", 200);
        expect(onSeek).toHaveBeenLastCalledWith(13, { gesture: "end" });
        expect(tooltip()).not.toBeInTheDocument();
    });

    it("never opens on a right-click (the box's menu)", async () => {
        render(<ExpandedTimeline {...commonProps} holdMarks={TOOLTIP_MARKS} />);
        const box = screen.getByRole("button", { name: "Page 2A" });
        fireEvent.pointerMove(box);
        press(box, "pointerdown", 130, 2);
        fireEvent.contextMenu(box);
        await pastTheDelay();
        expect(tooltip()).not.toBeInTheDocument();
    });
});

describeDbTests("page mode's page strip", (it) => {
    it("owner scenario: marks appear for the selection only, page 2 moves and pages 3–4 hold from it", async ({
        db,
        marchersAndPages,
    }) => {
        const { result, qc } = mountFeature(<PageTimeline />);
        await waitFor(() => {
            expect(probed().pages.length).toBeGreaterThan(4);
            expect(probed().marchers?.length).toBeGreaterThan(0);
        });
        const marks = () =>
            [
                ...result.container.querySelectorAll(
                    '[data-testid="page-hold-mark"]',
                ),
            ].map((el) => el.getAttribute("data-hold-mark"));
        // Timeline mode reads the resolver on the timeline's own boxes; this strip shows none
        if (timelineFixtureMode()) {
            await selectPageAndMarchers(probed().pages[1]!, [
                marchersAndPages.expectedMarchers[0]!.id,
            ]);
            expect(marks()).toEqual([]);
            return;
        }
        const pages = probed().pages;
        const id = marchersAndPages.expectedMarchers[0]!.id;
        const other = marchersAndPages.expectedMarchers[1]!.id;
        expect(marks(), "no marks with an empty selection").toEqual([]);

        // Page 2 is edited and pages 3–4 are copies of it (the carry-forward's result)
        await updateMarcherPages({
            db,
            modifiedMarcherPages: [1, 2, 3].map((i) => ({
                marcher_id: id,
                page_id: pages[i]!.id,
                x: 321,
                y: 123,
            })),
            carryForward: false,
        });
        await act(() => qc.invalidateQueries());
        expect(marks(), "still none without a selection").toEqual([]);

        await selectPageAndMarchers(pages[1]!, [id]);
        const boxOf = (index: number) =>
            result.container.querySelector(
                `[timeline-page-id="${pages[index]!.id}"] > div`,
            )!;
        await waitFor(() =>
            expect(
                boxOf(1).querySelector('[data-testid="page-hold-mark"]'),
            ).toHaveAttribute("data-hold-mark", "moves"),
        );
        expect(boxOf(1)).not.toHaveAttribute("title");
        expect(boxOf(1)).toHaveAccessibleDescription(
            "Selected marchers move on this page. They have their own move here",
        );
        // Its tooltip, on hover
        fireEvent.pointerMove(boxOf(1));
        expect(
            await screen.findByRole("tooltip", {}, { timeout: 2000 }),
        ).toHaveTextContent(
            "Selected marchers move on this pageThey have their own move here",
        );
        // A press closes it, and the click still selects the page
        fireEvent.pointerDown(boxOf(2));
        fireEvent.pointerMove(boxOf(2));
        await waitFor(() =>
            expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
        );
        fireEvent.click(boxOf(2));
        await waitFor(() =>
            expect(probed().selectedPage?.id).toBe(pages[2]!.id),
        );
        await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        await selectPageAndMarchers(pages[1]!, [id]);
        for (const index of [2, 3]) {
            expect(
                boxOf(index).querySelector('[data-testid="page-hold-mark"]'),
            ).toHaveAttribute("data-hold-mark", "holds");
            expect(boxOf(index)).toHaveAccessibleDescription(
                `Selected marchers hold from Page ${pages[1]!.name}. They stand where Page ${pages[1]!.name} left them`,
            );
        }

        // A partial selection: the other marcher moves on every page of the fixture
        const [row3, row4] = await Promise.all(
            [2, 3].map((i) =>
                db
                    .select()
                    .from(schema.marcher_pages)
                    .where(
                        and(
                            eq(schema.marcher_pages.marcher_id, other),
                            eq(schema.marcher_pages.page_id, pages[i]!.id),
                        ),
                    )
                    .get(),
            ),
        );
        expect(row3!.x === row4!.x && row3!.y === row4!.y).toBe(false);
        await selectPageAndMarchers(pages[1]!, [id, other]);
        await waitFor(() =>
            expect(
                boxOf(3).querySelector('[data-testid="page-hold-mark"]'),
            ).toHaveAttribute("data-hold-mark", "mixed"),
        );
        expect(boxOf(3)).toHaveAccessibleDescription(
            `Some selected marchers hold from Page ${pages[1]!.name}. Some have their own move here`,
        );

        // Clearing the selection clears the marks
        await act(async () => probed().setSelectedMarchers([]));
        await waitFor(() => expect(marks()).toEqual([]));
    });
});

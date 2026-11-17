import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { Timeline } from "../Timeline";
import type {
    TimelineClearPageMenu,
    TimelineSetAsShownMenu,
} from "../TimelineRangeMenu";

/**
 * The page box menu on the timeline: **Set as shown** and Clear Page N, with no Keep or Follow
 * again entries (those kept spots are gone, holds #467).
 */

afterEach(cleanup);

/** The zero-length beat 0, then `count` timed beats */
const appBeats = (count: number): Beat[] =>
    Array.from({ length: count + 1 }, (_, index) => ({
        id: index + 1,
        position: index,
        duration: index === 0 ? 0 : 0.5,
        includeInMeasure: true,
        notes: null,
        index,
        timestamp: index === 0 ? 0 : (index - 1) * 0.5,
    }));

const BEATS = appBeats(24);

const page = (id: number, name: string, beats: Beat[]): Page =>
    ({
        id,
        name,
        counts: id === 1 ? 0 : beats.length,
        notes: null,
        order: id - 1,
        nextPageId: id < 4 ? id + 1 : null,
        previousPageId: id === 1 ? null : id - 1,
        isSubset: false,
        duration: beats.length * 0.5,
        beats,
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: beats[0]!.timestamp,
    }) as unknown as Page;

// Home, then pages 2, 3 and 4 of eight beats each
const PAGES = [
    page(1, "1", [BEATS[0]!]),
    page(2, "2", BEATS.slice(1, 9)),
    page(3, "3", BEATS.slice(9, 17)),
    page(4, "4", BEATS.slice(17, 25)),
];

const show = ({
    setAsShown,
    clearPage,
}: {
    setAsShown?: TimelineSetAsShownMenu;
    clearPage?: TimelineClearPageMenu;
}) =>
    render(
        <Timeline
            mode="expanded"
            beats={BEATS}
            pages={PAGES}
            measures={[]}
            timelines={[]}
            showTransport={false}
            selection={null}
            onSelectionChange={vi.fn()}
            setAsShown={setAsShown}
            clearPage={clearPage}
            pixelsPerBeat={16}
        />,
    );

describe("the page box menu", () => {
    const setAsShown = (): TimelineSetAsShownMenu => ({
        reasonFor: vi.fn(() => null),
        onSet: vi.fn(),
    });
    const item = (testId: string) => screen.queryByTestId(testId);

    it("has no Keep or Follow again entries, only Set as shown", () => {
        const menu = setAsShown();
        show({ setAsShown: menu });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 3" }));
        expect(item("timeline-range-menu-keep-here")).toBeNull();
        expect(item("timeline-range-menu-follow-again")).toBeNull();
        expect(item("timeline-range-menu-set-as-shown")).not.toBeNull();
        expect(screen.queryAllByTestId("timeline-menu-shortcut")).toEqual([]);
    });

    it("offers Clear Page N, and the follow-back entry only where the menu gives one (#573)", () => {
        const clearPage = (
            followBack: string | null,
        ): TimelineClearPageMenu => ({
            labelsFor: vi.fn(() => ({ clear: "Clear Page 3", followBack })),
            onClear: vi.fn(),
        });
        const plain = clearPage(null);
        show({ setAsShown: setAsShown(), clearPage: plain });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 3" }));
        expect(plain.labelsFor).toHaveBeenCalledWith("3");
        expect(item("timeline-range-menu-clear-page")?.textContent).toBe(
            "Clear Page 3",
        );
        expect(item("timeline-range-menu-clear-page-follow-back")).toBeNull();
        fireEvent.click(item("timeline-range-menu-clear-page")!);
        expect(plain.onClear).toHaveBeenCalledExactlyOnceWith("3", false);
        cleanup();

        const both = clearPage("Clear Page 3, Page 4 moves back too");
        show({ clearPage: both });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 3" }));
        const followBack = item("timeline-range-menu-clear-page-follow-back");
        expect(followBack?.textContent).toBe(
            "Clear Page 3, Page 4 moves back too",
        );
        fireEvent.click(followBack!);
        expect(both.onClear).toHaveBeenCalledExactlyOnceWith("3", true);
    });

    it("ticks Clear Page N, still naming the page, when every selected marcher is already Not defined there", () => {
        const ticked: TimelineClearPageMenu = {
            labelsFor: vi.fn(() => ({
                clear: "Clear Page 3",
                followBack: "Clear Page 3, Page 4 moves back too",
                checked: true,
            })),
            onClear: vi.fn(),
        };
        show({ clearPage: ticked });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 3" }));
        const clear = item("timeline-range-menu-clear-page")!;
        expect(clear).toHaveAttribute("aria-checked", "true");
        expect(clear).toHaveAttribute("data-disabled");
        expect(clear.textContent).toBe("Clear Page 3");
        // Nothing to clear, so nothing moves back either
        expect(item("timeline-range-menu-clear-page-follow-back")).toBeNull();
        fireEvent.click(clear);
        expect(ticked.onClear).not.toHaveBeenCalled();
    });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import type { HeldMark } from "@/db-functions/timelineHeldMarks";
import type { PageKeepState } from "@/timeline/timelineKeepLater";
import { setAsShownMenu } from "@/timeline/timelineSetAsShown";
import { holdFromPreviousMenu } from "@/timeline/timelineHoldFromPrevious";
import { Timeline, type TimelineInput } from "../Timeline";
import type { TimelineSelection } from "../TimelineViewModel";
import type { TimelinePageMenu } from "../TimelineRangeMenu";

/**
 * The timeline's right-click menu (P8.14, ui.md UI-9): page-box entries and holds. Opening it
 * never changes the timeline selection. A dragged range with no page-box or move entry opens
 * nothing.
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

const BEATS = appBeats(16);

/** Page 0 on beat 0, then pages 1 and 2 of eight beats each */
const page = (id: number, name: string, beats: Beat[]): Page =>
    ({
        id,
        name,
        counts: id === 1 ? 0 : beats.length,
        notes: null,
        order: id - 1,
        nextPageId: id < 3 ? id + 1 : null,
        previousPageId: id === 1 ? null : id - 1,
        isSubset: false,
        duration: beats.length * 0.5,
        beats,
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: beats[0]!.timestamp,
    }) as unknown as Page;
const PAGES = [
    page(1, "0", [BEATS[0]!]),
    page(2, "1", BEATS.slice(1, 9)),
    page(3, "2", BEATS.slice(9, 17)),
];

const clip: TimelineInput = {
    id: "clip",
    linkId: 7,
    targetId: "clip",
    targetType: "marcher",
    label: "A1",
    color: "#2fc4b2",
    startBeatIndex: 3,
    endBeatIndex: 7,
    legs: [{ id: "leg", startBeatIndex: 3, endBeatIndex: 7, texture: "move" }],
    activitySpans: [{ startBeatIndex: 3, endBeatIndex: 7, active: true }],
};

const show = ({
    menu,
    selection = null,
    onSelectionChange = vi.fn(),
}: {
    menu: TimelinePageMenu;
    selection?: TimelineSelection;
    onSelectionChange?: (selection: TimelineSelection) => void;
}) =>
    render(
        <Timeline
            mode="expanded"
            beats={BEATS}
            pages={PAGES}
            measures={[]}
            timelines={[clip]}
            showTransport={false}
            selection={selection}
            onSelectionChange={onSelectionChange}
            onDeletePageFlag={
                menu.onDeleteFlag
                    ? (pageId) => menu.onDeleteFlag?.(pageId)
                    : undefined
            }
            onDeletePageWithMoves={
                menu.onDeleteWithMoves
                    ? (pageId) => menu.onDeleteWithMoves?.(pageId)
                    : undefined
            }
            setAsShown={menu.setAsShown}
            holdFromPrevious={menu.holdFromPrevious}
            clearPage={menu.clearPage}
        />,
    );

describe("the timeline's right-click menu (UI-9)", () => {
    it("deletes from a page box without changing the selection", () => {
        const onDeleteFlag = vi.fn();
        const onSelectionChange = vi.fn();
        show({ menu: { onDeleteFlag }, onSelectionChange });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        fireEvent.click(screen.getByTestId("timeline-range-menu-delete-flag"));
        expect(onDeleteFlag).toHaveBeenCalledWith(3);
        expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it("offers nothing on a dragged range, or elsewhere on the surface", () => {
        const onDeleteFlag = vi.fn();
        show({
            menu: { onDeleteFlag },
            selection: {
                kind: "range",
                range: { startBeatIndex: 11, endBeatIndex: 15 },
            },
        });
        const surface = screen.getByTestId("timeline-pointer-surface");
        fireEvent.contextMenu(surface, { clientX: 16 * 12 });
        expect(screen.queryByTestId("timeline-range-menu")).toBeNull();

        cleanup();
        show({ menu: { onDeleteFlag } });
        fireEvent.contextMenu(screen.getByTestId("timeline-pointer-surface"), {
            clientX: 16 * 12,
        });
        expect(screen.queryByTestId("timeline-range-menu")).toBeNull();
    });
});

/**
 * The hold commands on a page box (holds): each says what it would do for the selection on the
 * right-clicked page, from the keep states and the Held marks (`holdEntryStates`).
 */
describe("the page box menu's hold commands", () => {
    // The box named "Page 2" is page 3, beats 9 to 17
    const state = ({
        follows = [],
        selected,
    }: {
        follows?: number[];
        selected: number;
    }): PageKeepState => ({
        pageId: 3,
        pageName: "2",
        box: { start: 9, end: 17 },
        follows,
        fromStart: [],
        from: [],
        midMove: [],
        selected,
    });
    const mark = (marcherId: number) => ({
        id: marcherId,
        marcherId,
        start: 9,
        end: 17,
    });
    const openMenu = (
        states: PageKeepState[],
        marcherIds: number[],
        marks: HeldMark[],
    ) => {
        const runHold = vi.fn(async () => ({ held: [], skipped: [] }));
        const runDefine = vi.fn();
        const onPreview = vi.fn();
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
                setAsShown={setAsShownMenu(states, runDefine, marks)}
                holdFromPrevious={{
                    ...holdFromPreviousMenu(
                        states,
                        marcherIds,
                        undefined,
                        runHold,
                        marks,
                    ),
                    onPreview,
                }}
            />,
        );
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2" }));
        return {
            runHold,
            runDefine,
            onPreview,
            define: screen.getByTestId("timeline-range-menu-set-as-shown"),
            hold: screen.getByTestId("timeline-range-menu-hold-from-previous"),
        };
    };

    it("Hold from last keyframe previews while highlighted, and stops on leaving it", () => {
        const { hold, onPreview } = openMenu(
            [state({ follows: [1], selected: 1 })],
            [1],
            [],
        );
        fireEvent.focus(hold);
        expect(onPreview).toHaveBeenLastCalledWith("3", true);
        fireEvent.blur(hold);
        expect(onPreview).toHaveBeenLastCalledWith("3", false);
    });

    it("all Held: Hold from last keyframe is checked and does nothing", () => {
        const { hold, define, runHold, runDefine } = openMenu(
            [state({ follows: [1, 2], selected: 2 })],
            [1, 2],
            [mark(1), mark(2)],
        );
        expect(hold).toHaveAttribute("role", "menuitemcheckbox");
        expect(hold).toHaveAttribute("aria-checked", "true");
        expect(hold).toHaveAttribute("data-disabled");
        expect(hold).toHaveTextContent(/^Hold from last keyframe$/);
        fireEvent.click(hold);
        expect(runHold).not.toHaveBeenCalled();
        // Define as shown leaves Held marchers alone: unavailable, saying why, not checked
        expect(define).not.toHaveAttribute("aria-checked");
        expect(define).toHaveAttribute("aria-disabled", "true");
        expect(
            screen.getByTestId("timeline-range-menu-set-as-shown-reason"),
        ).toHaveTextContent(
            "Every selected marcher is already defined or held on Page 2, or partway through a move",
        );
        fireEvent.click(define);
        expect(runDefine).not.toHaveBeenCalled();
    });

    it("mixed: both stay on, with no count, and run", () => {
        // 1 Held, 2 and 3 Not defined, 4 and 5 Defined
        const { hold, define, runDefine } = openMenu(
            [state({ follows: [1, 2, 3], selected: 5 })],
            [1, 2, 3, 4, 5],
            [mark(1)],
        );
        expect(hold).toHaveTextContent(/^Hold from last keyframe$/);
        expect(hold).not.toHaveAttribute("aria-disabled");
        expect(define).toHaveTextContent(/^Define as shown$/);
        expect(define).not.toHaveAttribute("aria-disabled");
        fireEvent.click(define);
        // Only the Not defined ones
        expect(runDefine).toHaveBeenCalledExactlyOnceWith(
            { start: 9, end: 17 },
            [2, 3],
        );
    });

    it("all Not defined: both run for everyone, with no count", () => {
        const { hold, define } = openMenu(
            [state({ follows: [1, 2], selected: 2 })],
            [1, 2],
            [],
        );
        expect(hold).toHaveTextContent(/^Hold from last keyframe$/);
        expect(define).toHaveTextContent(/^Define as shown$/);
        expect(hold).not.toHaveAttribute("aria-disabled");
        expect(define).not.toHaveAttribute("aria-disabled");
    });

    it("all Defined: Define as shown is checked", () => {
        const { define } = openMenu([state({ selected: 2 })], [1, 2], []);
        expect(define).toHaveAttribute("aria-checked", "true");
        expect(define).toHaveAttribute("data-disabled");
    });
});

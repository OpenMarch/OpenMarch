import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { Timeline } from "../Timeline";
import type { TimelineSelection } from "../TimelineViewModel";
import { openContextMenu } from "../timelineGestures";

/**
 * Tablet 3.4: the selected page box's "…" chip opens the box's full menu, the right-click's
 * entries with **Edit move** first, and a finger's long press on a box (a touch `contextmenu`)
 * opens the same. A mouse's right-click keeps its menu as it was.
 */

afterEach(cleanup);

const BEATS: Beat[] = Array.from({ length: 17 }, (_, index) => ({
    id: index + 1,
    position: index,
    duration: index === 0 ? 0 : 0.5,
    includeInMeasure: true,
    notes: null,
    index,
    timestamp: index === 0 ? 0 : (index - 1) * 0.5,
}));

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

function Show({
    onDeleteFlag,
    onOpenRange,
    disabledReason = null,
}: {
    onDeleteFlag: (pageId: number) => void;
    onOpenRange?: (range: {
        startBeatIndex: number;
        endBeatIndex: number;
    }) => void;
    disabledReason?: string | null;
}) {
    const [selection, setSelection] = useState<TimelineSelection>(null);
    return (
        <Timeline
            mode="expanded"
            beats={BEATS}
            pages={PAGES}
            measures={[]}
            timelines={[]}
            showTransport={false}
            selection={selection}
            onSelectionChange={setSelection}
            onDeletePageFlag={onDeleteFlag}
            onOpenRange={onOpenRange}
            moveCommands={{
                onEdit: vi.fn(),
                onRename: vi.fn(),
                onDelete: vi.fn(),
                disabledReason,
            }}
        />
    );
}

const box = (name: string) => screen.getByRole("button", { name });
const menuEntries = () =>
    screen.getByTestId("timeline-range-menu").querySelectorAll("[data-testid]");

describe("the page box menu on a tablet (3.4)", () => {
    it("puts a … chip on the selected page box only, which opens its full menu with Edit move first", () => {
        const onDeleteFlag = vi.fn();
        const onOpenRange = vi.fn();
        render(<Show onDeleteFlag={onDeleteFlag} onOpenRange={onOpenRange} />);
        expect(screen.queryByTestId("timeline-page-menu-button")).toBeNull();
        fireEvent.click(box("Page 2"));
        const chips = screen.getAllByTestId("timeline-page-menu-button");
        expect(chips).toHaveLength(1);
        expect(chips[0]).toHaveAccessibleName("Page 2 options");
        // Its finger area isn't the selected object's: a keyframe, the playhead or the start flag
        // nearer the finger wins over it (tablet 3.3's rules)
        const area = chips[0]!.querySelector("[data-touch-hit]");
        expect(area).not.toBeNull();
        expect(area!.hasAttribute("data-touch-selected")).toBe(false);
        fireEvent.click(chips[0]!);
        const ids = [...menuEntries()].map((entry) =>
            entry.getAttribute("data-testid"),
        );
        expect(ids[0]).toBe("timeline-range-menu-edit-move");
        expect(ids).toContain("timeline-range-menu-delete-flag");
        // Edit move does what a double-click on the box does: the page's range, in spec beats
        fireEvent.click(screen.getByTestId("timeline-range-menu-edit-move"));
        expect(onOpenRange).toHaveBeenCalledTimes(1);
        fireEvent.dblClick(box("Page 2"));
        expect(onOpenRange.mock.calls[1]![0]).toEqual(
            onOpenRange.mock.calls[0]![0],
        );
    });

    it("runs the menu's own entries from the chip", () => {
        const onDeleteFlag = vi.fn();
        render(<Show onDeleteFlag={onDeleteFlag} onOpenRange={vi.fn()} />);
        fireEvent.click(box("Page 2"));
        fireEvent.click(screen.getByTestId("timeline-page-menu-button"));
        fireEvent.click(screen.getByTestId("timeline-range-menu-delete-flag"));
        expect(onDeleteFlag).toHaveBeenCalledWith(3);
    });

    it("keeps a mouse's right-click menu as it was; a finger's long press adds Edit move", () => {
        render(<Show onDeleteFlag={vi.fn()} onOpenRange={vi.fn()} />);
        fireEvent.contextMenu(box("Page 2"));
        expect(screen.getByTestId("timeline-range-menu")).toBeTruthy();
        expect(
            screen.queryByTestId("timeline-range-menu-edit-move"),
        ).toBeNull();
        fireEvent.keyDown(screen.getByTestId("timeline-range-menu"), {
            key: "Escape",
        });
        expect(screen.queryByTestId("timeline-range-menu")).toBeNull();
        let opened = false;
        act(() => {
            opened = openContextMenu(box("Page 2"), 40, 30);
        });
        expect(opened).toBe(true);
        expect(
            screen.getByTestId("timeline-range-menu-edit-move"),
        ).toBeTruthy();
    });

    it("says why Edit move waits while playing", () => {
        const onOpenRange = vi.fn();
        render(
            <Show
                onDeleteFlag={vi.fn()}
                onOpenRange={onOpenRange}
                disabledReason="Pause to edit a move."
            />,
        );
        fireEvent.click(box("Page 2"));
        fireEvent.click(screen.getByTestId("timeline-page-menu-button"));
        fireEvent.click(screen.getByTestId("timeline-range-menu-edit-move"));
        expect(onOpenRange).not.toHaveBeenCalled();
        expect(
            screen.getByTestId("timeline-range-menu-edit-move-reason")
                .textContent,
        ).toBe("Pause to edit a move.");
        // A tap shows it beside the entry, and a finger's long press reads it (#928)
        expect(
            screen.getByTestId("timeline-range-menu-edit-move-reason-tip"),
        ).toHaveTextContent("Pause to edit a move.");
        expect(
            screen
                .getByTestId("timeline-range-menu-edit-move")
                .getAttribute("data-tip-label"),
        ).toBe("Pause to edit a move.");
    });

    it("a finger's tap outside the open menu only closes it: the box under it isn't selected (#928)", () => {
        const onDeleteFlag = vi.fn();
        render(<Show onDeleteFlag={onDeleteFlag} onOpenRange={vi.fn()} />);
        fireEvent.click(box("Page 2"));
        fireEvent.click(screen.getByTestId("timeline-page-menu-button"));
        expect(screen.getByTestId("timeline-range-menu")).toBeTruthy();
        const other = box("Page 1");
        for (const type of ["pointerdown", "pointerup"]) {
            const event = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                button: 0,
            });
            Object.defineProperty(event, "pointerType", { value: "touch" });
            Object.defineProperty(event, "pointerId", { value: 7 });
            fireEvent(other, event);
        }
        fireEvent.click(other);
        expect(screen.queryByTestId("timeline-range-menu")).toBeNull();
        expect(box("Page 2")).toHaveAttribute("aria-pressed", "true");
        expect(other).toHaveAttribute("aria-pressed", "false");
        expect(onDeleteFlag).not.toHaveBeenCalled();
    });

    it("has no Edit move where boxes can't be opened (Basic), and no chip without any page menu", () => {
        const { unmount } = render(<Show onDeleteFlag={vi.fn()} />);
        fireEvent.click(box("Page 2"));
        fireEvent.click(screen.getByTestId("timeline-page-menu-button"));
        expect(
            screen.queryByTestId("timeline-range-menu-edit-move"),
        ).toBeNull();
        unmount();
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
            />,
        );
        fireEvent.click(box("Page 2"));
        expect(screen.queryByTestId("timeline-page-menu-button")).toBeNull();
    });
});

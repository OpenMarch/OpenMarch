import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { Timeline, type TimelineInput } from "../Timeline";
import type { TimelineSelection } from "../TimelineViewModel";
import type { TimelineAddMarchersMenu } from "../TimelineRangeMenu";

/** Adversarial checks of the P8.14 right-click menu. */

afterEach(cleanup);

// jsdom has no PointerEvent, so fireEvent.pointerDown would drop button and clientX
if (typeof window.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
        }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent =
        PointerEventPolyfill;
}

const BEATS: Beat[] = Array.from({ length: 17 }, (_, index) => ({
    id: index + 1,
    position: index,
    duration: index === 0 ? 0 : 0.5,
    includeInMeasure: true,
    notes: null,
    index,
    timestamp: index === 0 ? 0 : (index - 1) * 0.5,
})) as unknown as Beat[];

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

const clipAt = (start: number, end: number, label = "A1"): TimelineInput => ({
    id: `clip-${label}`,
    linkId: 7,
    targetId: label,
    targetType: "marcher",
    label,
    color: "#2fc4b2",
    startBeatIndex: start,
    endBeatIndex: end,
    legs: [
        {
            id: "leg",
            startBeatIndex: start,
            endBeatIndex: end,
            texture: "move",
        },
    ],
    activitySpans: [{ startBeatIndex: start, endBeatIndex: end, active: true }],
});

const show = ({
    menu,
    timelines = [clipAt(3, 7)],
    selection = null,
    onSelectionChange = vi.fn(),
    onSeek = vi.fn(),
}: {
    menu: TimelineAddMarchersMenu;
    timelines?: TimelineInput[];
    selection?: TimelineSelection;
    onSelectionChange?: (s: TimelineSelection) => void;
    onSeek?: (b: number) => void;
}) =>
    render(
        <Timeline
            mode="expanded"
            beats={BEATS}
            pages={PAGES}
            measures={[]}
            timelines={timelines}
            showTransport={false}
            selection={selection}
            onSelectionChange={onSelectionChange}
            playback={{ positionBeat: 5, isPlaying: false, onSeek }}
            addSelectedMarchers={menu}
        />,
    );

/** A real right-click: pointer and mouse events with button 2, then contextmenu. */
const rightClick = (el: Element, init: Record<string, unknown> = {}) => {
    const opts = { button: 2, buttons: 2, pointerId: 1, ...init };
    fireEvent.pointerDown(el, opts);
    fireEvent.mouseDown(el, opts);
    fireEvent.contextMenu(el, opts);
    fireEvent.pointerUp(el, opts);
    fireEvent.mouseUp(el, opts);
};

const RANGE: TimelineSelection = {
    kind: "range",
    range: { startBeatIndex: 10, endBeatIndex: 14 },
};

describe("right-click menu, adversarial", () => {
    for (const [name, target] of [
        ["page box", () => screen.getByRole("button", { name: "Page 2" })],
        ["clip", () => screen.getByRole("button", { name: /A1 timeline/ })],
        ["dragged range", () => screen.getByTestId("timeline-pointer-surface")],
    ] as const)
        it(`a full right-click on a ${name} neither seeks nor changes the selection`, () => {
            const onSeek = vi.fn();
            const onSelectionChange = vi.fn();
            const onAdd = vi.fn();
            show({
                menu: { onAdd },
                onSeek,
                onSelectionChange,
                selection: RANGE,
            });
            rightClick(target(), { clientX: 12 * 16 });
            expect(screen.queryByRole("menuitem")).not.toBeNull();
            fireEvent.click(screen.getByRole("menuitem"));
            expect(onAdd).toHaveBeenCalledTimes(1);
            expect(onSeek).not.toHaveBeenCalled();
            expect(onSelectionChange).not.toHaveBeenCalled();
        });

    it("control: a plain left press on the surface does seek", () => {
        const onSeek = vi.fn();
        show({ menu: { onAdd: vi.fn() }, onSeek });
        const surface = screen.getByTestId("timeline-pointer-surface");
        const opts = { button: 0, buttons: 1, pointerId: 1, clientX: 5 * 16 };
        fireEvent.pointerDown(surface, opts);
        fireEvent.pointerUp(surface, opts);
        expect(onSeek).toHaveBeenCalled();
    });

    it("macOS ctrl+click (button 0 with ctrlKey) on the surface doesn't seek", () => {
        vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
        const onSeek = vi.fn();
        show({ menu: { onAdd: vi.fn() }, onSeek, selection: RANGE });
        const surface = screen.getByTestId("timeline-pointer-surface");
        const opts = {
            button: 0,
            buttons: 1,
            ctrlKey: true,
            pointerId: 1,
            clientX: 12 * 16,
        };
        fireEvent.pointerDown(surface, opts);
        fireEvent.contextMenu(surface, opts);
        fireEvent.pointerUp(surface, opts);
        expect(onSeek).not.toHaveBeenCalled();
        vi.restoreAllMocks();
    });

    it("a clip whose timeline starts at spec beat 0 sends its stored range [0, 8)", () => {
        const onAdd = vi.fn();
        show({ menu: { onAdd }, timelines: [clipAt(0, 8)] });
        fireEvent.contextMenu(
            screen.getByRole("button", { name: /A1 timeline/ }),
        );
        fireEvent.click(screen.getByRole("menuitem"));
        expect(onAdd).toHaveBeenCalledWith({
            startBeatIndex: 0,
            endBeatIndex: 8,
        });
    });

    it("disabled with a reason: Enter and click do nothing", () => {
        const onAdd = vi.fn();
        show({ menu: { onAdd, disabledReason: "Select marchers first" } });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 1" }));
        const item = screen.getByRole("menuitem");
        expect(item.getAttribute("aria-disabled")).toBe("true");
        fireEvent.keyDown(item, { key: "Enter" });
        fireEvent.click(item);
        expect(onAdd).not.toHaveBeenCalled();
        expect(
            screen.getByTestId("timeline-range-menu-reason").textContent,
        ).toBe("Select marchers first");
    });

    it("the initial page box (home) offers no menu", () => {
        show({ menu: { onAdd: vi.fn() } });
        const labels = screen
            .getAllByRole("button")
            .map((b) => b.getAttribute("aria-label"));
        const home = screen
            .getAllByRole("button")
            .find((b) => /Page 0/.test(b.getAttribute("aria-label") ?? ""));
        expect(home, JSON.stringify(labels)).toBeDefined();
        fireEvent.contextMenu(home!);
        expect(screen.queryByRole("menuitem")).toBeNull();
    });
});

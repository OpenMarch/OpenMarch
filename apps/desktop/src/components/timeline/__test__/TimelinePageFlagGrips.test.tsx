import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { Timeline } from "../Timeline";
import type { TimelinePageFlagLimits } from "../TimelineViewModel";
import { describePageFlagBlock } from "../TimelineModePanel";

/**
 * Page flag grips (docs/timeline/research/move-page-flag). The show: home, then pages "1" over
 * spec beats [1, 9) and "2" over [9, 17), so their flags are at spec beats 9 and 17. The timeline
 * hides the zero-length beat 0, so they're drawn at view beats 8 and 16, 10px a beat here
 * (jsdom puts the surface at x = 0).
 */

afterEach(cleanup);
beforeEach(() => useTimelineSelectionStore.getState().reset());

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

/** Page "1"'s flag (id 2), in spec beats: the neighbors' limits unless given others */
const LIMITS: TimelinePageFlagLimits = {
    flag: 9,
    min: 2,
    max: 16,
    minReason: "Page 0's flag",
    maxReason: "Page 2's flag",
};

const show = ({
    limits = LIMITS,
    isPlaying = false,
    withMove = true,
}: {
    limits?: TimelinePageFlagLimits;
    isPlaying?: boolean;
    withMove?: boolean;
} = {}) => {
    const commit = vi.fn();
    const onSelectionChange = vi.fn();
    const limitsOf = vi.fn(async () => limits);
    render(
        <Timeline
            mode="expanded"
            beats={BEATS}
            pages={PAGES}
            measures={[]}
            timelines={[]}
            showTransport={false}
            pixelsPerBeat={10}
            playback={{ positionBeat: 3, isPlaying }}
            selection={null}
            onSelectionChange={onSelectionChange}
            pageFlagMove={withMove ? { limits: limitsOf, commit } : undefined}
        />,
    );
    return { commit, onSelectionChange, limitsOf };
};

const grips = () => screen.queryAllByTestId("timeline-page-flag-grip");
const grip = (pageId: number) =>
    grips().find((g) => g.getAttribute("data-page-id") === String(pageId))!;

const pointer = (
    target: Element,
    type: string,
    clientX: number,
    altKey = false,
) =>
    fireEvent(
        target,
        new MouseEvent(type, { bubbles: true, button: 0, clientX, altKey }),
    );

/** Lets the limits promise answer */
const settle = () => act(async () => {});

const readout = () => screen.queryByTestId("timeline-page-flag-readout");

describe("page flag grips", () => {
    it("sit on every flag but home's, and only while flags can move", () => {
        show();
        expect(grips().map((g) => g.getAttribute("data-page-id"))).toEqual([
            "2",
            "3",
        ]);
        expect(grip(2).style.left).toBe("80px");
        expect(grip(3).style.left).toBe("160px");
        cleanup();
        show({ isPlaying: true });
        expect(grips()).toEqual([]);
        cleanup();
        show({ withMove: false });
        expect(grips()).toEqual([]);
    });

    it("drags a flag: the boxes and counts follow, and the release writes once, in spec beats", async () => {
        const { commit, limitsOf } = show();
        pointer(grip(2), "pointerdown", 80);
        await settle();
        expect(limitsOf).toHaveBeenCalledWith(2);
        pointer(grip(2), "pointermove", 112);
        expect(readout()!.textContent).toContain("Page 1: 8 → 11 counts");
        expect(readout()!.textContent).toContain("Page 2: 8 → 5 counts");
        expect(screen.getByRole("button", { name: "Page 1" }).style.width).toBe(
            "110px",
        );
        expect(commit).not.toHaveBeenCalled();
        pointer(grip(2), "pointerup", 112);
        expect(commit).toHaveBeenCalledTimes(1);
        // View beat 11 is spec beat 12
        expect(commit).toHaveBeenCalledWith(2, 12);
    });

    it("the grip is the page line through the page-box row only (owner)", async () => {
        const { commit } = show();
        expect(grip(2).style.top).toBe("0px");
        expect(grip(2).style.height).toBe("28px");
        expect(screen.queryAllByTestId("timeline-page-flag-grip-rows")).toEqual(
            [],
        );
        pointer(grip(2), "pointerdown", 80);
        await settle();
        pointer(grip(2), "pointermove", 112);
        pointer(grip(2), "pointerup", 112);
        expect(commit).toHaveBeenCalledWith(2, 12);
    });

    it("stops where the limits say, and says why", async () => {
        const { commit } = show({
            limits: {
                ...LIMITS,
                min: 7,
                max: 12,
                maxReason: '"Breakaway" is in the way',
            },
        });
        pointer(grip(2), "pointerdown", 80);
        await settle();
        pointer(grip(2), "pointermove", 150);
        expect(readout()!.textContent).toContain('"Breakaway" is in the way');
        expect(
            screen.getByTestId("timeline-page-flag-drag-line").style.left,
        ).toBe("110px");
        pointer(grip(2), "pointerup", 150);
        expect(commit).toHaveBeenCalledWith(2, 12);
    });

    it("passes over a hole and lands just before it, saying why", async () => {
        const { commit } = show({
            limits: {
                ...LIMITS,
                holes: [
                    {
                        beat: 12,
                        reason: '"Breakaway" already has these counts',
                    },
                ],
            },
        });
        pointer(grip(2), "pointerdown", 80);
        await settle();
        // View 11 is spec 12, the hole: back to view 10 (spec 11)
        pointer(grip(2), "pointermove", 110);
        expect(readout()!.textContent).toContain("already has these counts");
        pointer(grip(2), "pointerup", 110);
        expect(commit).toHaveBeenLastCalledWith(2, 11);
        await settle();
        // Past it, it lands
        pointer(grip(2), "pointerdown", 80);
        await settle();
        pointer(grip(2), "pointermove", 120);
        pointer(grip(2), "pointerup", 120);
        expect(commit).toHaveBeenLastCalledWith(2, 13);
    });

    it("snaps to the playhead near it, and Alt turns that off", async () => {
        // The playhead is at spec beat 3, view beat 2
        const { commit } = show();
        pointer(grip(2), "pointerdown", 80);
        await settle();
        pointer(grip(2), "pointermove", 25);
        pointer(grip(2), "pointerup", 25);
        expect(commit).toHaveBeenLastCalledWith(2, 3);
        await settle();
        pointer(grip(2), "pointerdown", 80);
        await settle();
        pointer(grip(2), "pointermove", 25, true);
        // Alt: the nearest whole beat, 2.5 → 3 (view), spec 4
        pointer(grip(2), "pointerup", 25, true);
        expect(commit).toHaveBeenLastCalledWith(2, 4);
    });

    it("writes nothing for Esc, a lost capture, or a drag brought back", async () => {
        const { commit } = show();
        pointer(grip(2), "pointerdown", 80);
        await settle();
        pointer(grip(2), "pointermove", 112);
        fireEvent.keyDown(grip(2), { key: "Escape" });
        expect(readout()).toBeNull();
        pointer(grip(2), "pointerup", 112);

        pointer(grip(2), "pointerdown", 80);
        pointer(grip(2), "pointermove", 112);
        fireEvent(
            grip(2),
            new MouseEvent("lostpointercapture", { bubbles: true }),
        );
        pointer(grip(2), "pointerup", 112);

        pointer(grip(2), "pointerdown", 80);
        pointer(grip(2), "pointermove", 112);
        pointer(grip(2), "pointermove", 81);
        pointer(grip(2), "pointerup", 81);
        await settle();
        expect(commit).not.toHaveBeenCalled();
    });

    it("a press that doesn't move is a click on the box on that side", () => {
        const { commit, onSelectionChange } = show();
        const target = grip(2);
        target.getBoundingClientRect = () =>
            ({ left: 74, width: 12 }) as DOMRect;
        pointer(target, "pointerdown", 78);
        pointer(target, "pointerup", 78);
        expect(onSelectionChange).toHaveBeenLastCalledWith({
            kind: "range",
            range: { startBeatIndex: 1, endBeatIndex: 9 },
        });
        pointer(target, "pointerdown", 82);
        pointer(target, "pointerup", 82);
        expect(onSelectionChange).toHaveBeenLastCalledWith({
            kind: "range",
            range: { startBeatIndex: 9, endBeatIndex: 17 },
        });
        expect(commit).not.toHaveBeenCalled();
    });

    it("arrow keys move a focused flag one beat, within the limits", async () => {
        const { commit } = show({ limits: { ...LIMITS, max: 9 } });
        fireEvent.keyDown(grip(2), { key: "ArrowLeft" });
        await settle();
        expect(commit).toHaveBeenCalledWith(2, 8);
        commit.mockClear();
        // At its limit, a step does nothing
        fireEvent.keyDown(grip(2), { key: "ArrowRight" });
        await settle();
        expect(commit).not.toHaveBeenCalled();
    });
});

describe("followPageFlagMove (case 14)", () => {
    const boxes = [
        { start: 1, end: 9 },
        { start: 9, end: 17 },
        { start: 17, end: 25 },
    ];
    beforeEach(() => useTimelineSelectionStore.getState().setPageBoxes(boxes));

    it("takes the playhead on the moved flag with it, so the page stays selected", () => {
        const store = useTimelineSelectionStore.getState();
        store.selectRange(9, 17);
        store.followPageFlagMove(17, 20);
        const s = useTimelineSelectionStore.getState();
        expect(s.selection).toEqual({ kind: "range", start: 9, end: 20 });
        expect(s.playheadBeat).toBe(20);
        expect(s.startBeat).toBe(9);
        expect(s.pageBoxes[1]).toEqual({ start: 9, end: 20 });
        expect(s.pageBoxes[2]).toEqual({ start: 20, end: 25 });
    });

    it("takes a start flag on it too, and leaves a playhead elsewhere", () => {
        const store = useTimelineSelectionStore.getState();
        store.selectRange(17, 25);
        store.followPageFlagMove(17, 14);
        const s = useTimelineSelectionStore.getState();
        expect(s.selection).toEqual({ kind: "range", start: 14, end: 25 });
        expect(s.startPinned).toBe(false);
        expect(s.playheadBeat).toBe(25);
    });
});

describe("describePageFlagBlock", () => {
    const pages = [
        { id: 1, name: "0", beats: [{ index: 0 }] },
        { id: 2, name: "1", beats: [1, 2, 3, 4].map((index) => ({ index })) },
        { id: 3, name: "2", beats: [5, 6, 7, 8].map((index) => ({ index })) },
    ];
    const tracks = [
        { linkId: 4, label: "Timeline 4", startBeatIndex: 1, endBeatIndex: 5 },
        { linkId: 5, label: "Timeline 5", startBeatIndex: 2, endBeatIndex: 7 },
        { linkId: 6, label: "Breakaway", startBeatIndex: 3, endBeatIndex: 7 },
    ];
    it("names the flag, the show's end, or the move", () => {
        expect(
            describePageFlagBlock({ kind: "flag", pageId: 3 }, pages, tracks),
        ).toBe("Page 2's flag");
        expect(
            describePageFlagBlock({ kind: "flag", pageId: 1 }, pages, tracks),
        ).toBe("Home");
        expect(describePageFlagBlock({ kind: "show-end" }, pages, tracks)).toBe(
            "The end of the show",
        );
        expect(
            describePageFlagBlock(
                { kind: "move", timelineId: 4, message: "E-A3 …" },
                pages,
                tracks,
            ),
        ).toBe("Page 1's move is in the way");
        expect(
            describePageFlagBlock(
                {
                    kind: "move",
                    timelineId: 6,
                    message: "two moves would share beats [3, 7)",
                },
                pages,
                tracks,
            ),
        ).toBe('"Breakaway" already has these counts');
        expect(
            describePageFlagBlock(
                {
                    kind: "move",
                    timelineId: 5,
                    message: "a move on the flag would be left behind",
                },
                pages,
                tracks,
            ),
        ).toBe("A move starts or ends on this flag");
    });
});

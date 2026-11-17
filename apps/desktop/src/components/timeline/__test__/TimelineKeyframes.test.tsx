import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { Timeline } from "../Timeline";
import type {
    TimelineKeyframe,
    TimelineKeyframeMenu,
} from "../TimelineKeyframes";
import {
    BasicTimeline,
    CollapsedTimeline,
    ExpandedTimeline,
} from "../TimelineVariants";
import { timelineStoryModel } from "../TimelineStoryFixtures";

/**
 * The selection's keyframes on the timeline (#303): a diamond at every count where a selected
 * marcher is Set, filled where all of them are, hollow where some are. A click moves the playhead
 * there. They replace the page boxes' hold marks, in Basic and Expert.
 */

beforeAll(async () => {
    await tolgee.run();
});

afterEach(cleanup);

const commonProps = {
    model: timelineStoryModel,
    positionBeat: 11,
    isPlaying: false,
    pixelsPerBeat: 16,
    showTransport: false,
};

/** Page 2's flag (beat 16), mid Page 2A (beat 20), and Page 4's count 2 (beat 26) */
const KEYFRAMES: readonly TimelineKeyframe[] = [
    {
        beat: 16,
        set: 3,
        total: 3,
        marcherIds: [1, 2, 3],
        names: "B1, B2 and B3",
    },
    { beat: 20, set: 1, total: 3, marcherIds: [2] },
    { beat: 26, set: 2, total: 3, marcherIds: [1, 3], names: null },
];

const diamonds = () =>
    screen
        .queryAllByTestId(/^timeline-keyframe-/)
        .map((d) => d.getAttribute("data-testid"));

describe.each([
    ["Expert", ExpandedTimeline],
    ["Basic", BasicTimeline],
    ["Expert, compact", CollapsedTimeline],
] as const)("the selection's keyframes in %s", (_, Variant) => {
    it("draw none with nothing selected", () => {
        render(<Variant {...commonProps} />);
        expect(diamonds()).toEqual([]);
        render(<Variant {...commonProps} keyframes={[]} />);
        expect(diamonds()).toEqual([]);
    });

    it("draw a diamond at each Set count, filled where all the selection is Set, hollow where some is", () => {
        render(<Variant {...commonProps} keyframes={KEYFRAMES} />);
        expect(diamonds()).toEqual([
            "timeline-keyframe-16-filled",
            "timeline-keyframe-20-hollow",
            "timeline-keyframe-26-hollow",
        ]);
        // At its exact beat: centered on the beat's x
        expect(
            screen.getByTestId("timeline-keyframe-20-hollow").style.left,
        ).toBe(`${20 * 16}px`);
    });

    it("are named Keyframe with their count, and say who of the selection has them", () => {
        render(<Variant {...commonProps} keyframes={KEYFRAMES} />);
        expect(
            screen.getByTestId("timeline-keyframe-16-filled"),
        ).toHaveAccessibleName(
            "Keyframe · Page 2, count 8. 3 of 3 selected: B1, B2 and B3",
        );
        // Names not known: only counted
        expect(
            screen.getByTestId("timeline-keyframe-26-hollow"),
        ).toHaveAccessibleName("Keyframe · Page 4, count 2. 2 of 3 selected");
    });

    it("say only Keyframe and the count with one marcher selected", () => {
        render(
            <Variant
                {...commonProps}
                keyframes={[
                    {
                        beat: 20,
                        set: 1,
                        total: 1,
                        marcherIds: [2],
                        names: "B2",
                    },
                ]}
            />,
        );
        expect(
            screen.getByTestId("timeline-keyframe-20-filled"),
        ).toHaveAccessibleName("Keyframe · Page 2A, count 4");
    });

    it("move the playhead to the diamond's count on a click, without a scrub", () => {
        const onSeek = vi.fn();
        render(
            <Variant {...commonProps} keyframes={KEYFRAMES} onSeek={onSeek} />,
        );
        const diamond = screen.getByTestId("timeline-keyframe-20-hollow");
        fireEvent.pointerDown(diamond, { button: 0, clientX: 320 });
        fireEvent.pointerUp(diamond, { button: 0, clientX: 320 });
        fireEvent.click(diamond, { detail: 1 });
        expect(onSeek.mock.calls).toEqual([[20]]);
    });
});

/** A diamond menu that can Unset at any count, and names Pages 3–4 as following at beat 16 */
const keyframeMenu = (
    state: Partial<ReturnType<TimelineKeyframeMenu["stateFor"]>> = {},
) => {
    const menu = {
        stateFor: vi.fn((beat: number) => ({
            canUnset: true,
            followingLabel:
                beat === 16 ? "Remove keyframe, Pages 3–4 move back too" : null,
            ...state,
        })),
        onUnset: vi.fn(),
        onUnsetAndFollowing: vi.fn(),
    };
    return menu;
};

const menuItems = () =>
    screen.queryAllByRole("menuitem").map((item) => item.textContent);

describe.each([
    ["Expert", ExpandedTimeline],
    ["Basic", BasicTimeline],
    ["Expert, compact", CollapsedTimeline],
] as const)(
    "a keyframe diamond's right-click menu in %s (#306)",
    (_, Variant) => {
        it("offers both Unset actions where pages follow the count, and they act on the diamond's count", () => {
            const menu = keyframeMenu();
            const onSeek = vi.fn();
            render(
                <Variant
                    {...commonProps}
                    keyframes={KEYFRAMES}
                    keyframeMenu={menu}
                    onSeek={onSeek}
                />,
            );
            fireEvent.contextMenu(
                screen.getByTestId("timeline-keyframe-16-filled"),
            );
            expect(menuItems()).toEqual([
                "Remove keyframe",
                "Remove keyframe, Pages 3–4 move back too",
            ]);
            expect(menu.stateFor).toHaveBeenCalledWith(16);
            fireEvent.click(
                screen.getByRole("menuitem", { name: "Remove keyframe" }),
            );
            expect(menu.onUnset.mock.calls).toEqual([[16]]);

            fireEvent.contextMenu(
                screen.getByTestId("timeline-keyframe-16-filled"),
            );
            fireEvent.click(
                screen.getByRole("menuitem", {
                    name: "Remove keyframe, Pages 3–4 move back too",
                }),
            );
            expect(menu.onUnsetAndFollowing.mock.calls).toEqual([[16]]);
            // The playhead stays where it is
            expect(onSeek).not.toHaveBeenCalled();
        });

        it("offers only Unset here where no pages follow, on a hollow diamond too", () => {
            const menu = keyframeMenu();
            render(
                <Variant
                    {...commonProps}
                    keyframes={KEYFRAMES}
                    keyframeMenu={menu}
                />,
            );
            fireEvent.contextMenu(
                screen.getByTestId("timeline-keyframe-20-hollow"),
            );
            expect(menuItems()).toEqual(["Remove keyframe"]);
            fireEvent.click(
                screen.getByRole("menuitem", { name: "Remove keyframe" }),
            );
            expect(menu.onUnset.mock.calls).toEqual([[20]]);
        });

        it("greys out Unset here when it can't run (playing)", () => {
            const menu = keyframeMenu({
                canUnset: false,
                followingLabel: null,
            });
            render(
                <Variant
                    {...commonProps}
                    keyframes={KEYFRAMES}
                    keyframeMenu={menu}
                />,
            );
            fireEvent.contextMenu(
                screen.getByTestId("timeline-keyframe-16-filled"),
            );
            const item = screen.getByRole("menuitem", {
                name: "Remove keyframe",
            });
            expect(item).toHaveAttribute("aria-disabled", "true");
            fireEvent.click(item);
            expect(menu.onUnset).not.toHaveBeenCalled();
        });

        it("lights the pages that would follow back while that entry is focused or hovered, and stops on leave and close (#477)", () => {
            const light = {
                marcherIds: [1],
                ranges: [{ start: 16, end: 32 }],
            };
            const menu = {
                ...keyframeMenu({ followingLight: light }),
                onFollowingPreview: vi.fn(),
            };
            render(
                <Variant
                    {...commonProps}
                    keyframes={KEYFRAMES}
                    keyframeMenu={menu}
                />,
            );
            fireEvent.contextMenu(
                screen.getByTestId("timeline-keyframe-16-filled"),
            );
            const followBack = screen.getByTestId(
                "timeline-keyframe-menu-follow-back",
            );
            fireEvent.focus(followBack);
            expect(menu.onFollowingPreview).toHaveBeenLastCalledWith(light);
            fireEvent.blur(followBack);
            expect(menu.onFollowingPreview).toHaveBeenLastCalledWith(null);
            fireEvent.focus(followBack);
            fireEvent.keyDown(followBack, { key: "Escape" });
            expect(menuItems()).toEqual([]);
            expect(menu.onFollowingPreview).toHaveBeenLastCalledWith(null);
        });

        it.each([
            ["the context-menu key", { key: "ContextMenu" }],
            ["Shift+F10", { key: "F10", shiftKey: true }],
        ])("opens from the keyboard with %s on a focused diamond", (_, key) => {
            const menu = keyframeMenu();
            render(
                <Variant
                    {...commonProps}
                    keyframes={KEYFRAMES}
                    keyframeMenu={menu}
                />,
            );
            const diamond = screen.getByTestId("timeline-keyframe-16-filled");
            diamond.focus();
            fireEvent.keyDown(diamond, key);
            expect(menuItems()).toEqual([
                "Remove keyframe",
                "Remove keyframe, Pages 3–4 move back too",
            ]);
        });

        it("opens no menu without one", () => {
            render(<Variant {...commonProps} keyframes={KEYFRAMES} />);
            fireEvent.contextMenu(
                screen.getByTestId("timeline-keyframe-16-filled"),
            );
            expect(menuItems()).toEqual([]);
        });
    },
);

describe("beside the selection's keyframes", () => {
    it("the page boxes still select on a click and scrub on a drag", () => {
        const onSeek = vi.fn();
        const onSelectionChange = vi.fn();
        render(
            <ExpandedTimeline
                {...commonProps}
                keyframes={KEYFRAMES}
                onSeek={onSeek}
                onSelectionChange={onSelectionChange}
            />,
        );
        const box = screen.getByRole("button", { name: "Page 2A" });
        fireEvent.click(box, { detail: 1 });
        expect(onSelectionChange).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "range" }),
        );
        const press = (type: string, clientX: number) =>
            fireEvent(
                box,
                new MouseEvent(type, { bubbles: true, button: 0, clientX }),
            );
        press("pointerdown", 130);
        press("pointermove", 200);
        expect(onSeek).toHaveBeenCalledWith(13, { gesture: "drag" });
        press("pointerup", 200);
    });

    it("the page boxes carry no hold marks or hold words", () => {
        render(<ExpandedTimeline {...commonProps} keyframes={KEYFRAMES} />);
        expect(screen.queryAllByTestId("page-hold-mark")).toEqual([]);
        expect(
            screen.getByRole("button", { name: "Page 2" }),
        ).not.toHaveAttribute("aria-describedby");
    });
});

/** The zero-length beat 0, then `count` timed beats: the view axis is one beat behind the show's */
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

const appPage = (id: number, name: string, beats: Beat[]): Page =>
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

// Home, then pages 2, 3 and 4 of eight beats each: page 2's flag is the show's beat 17
const PAGES = [
    appPage(1, "1", [BEATS[0]!]),
    appPage(2, "2", BEATS.slice(1, 9)),
    appPage(3, "3", BEATS.slice(9, 17)),
    appPage(4, "4", BEATS.slice(17, 25)),
];

const showTimeline = (props: Partial<Parameters<typeof Timeline>[0]> = {}) =>
    render(
        <Timeline
            mode="expanded"
            beats={BEATS}
            pages={PAGES}
            measures={[]}
            timelines={[]}
            showTransport={false}
            pixelsPerBeat={16}
            keyframes={[{ beat: 17, set: 1, total: 1, marcherIds: [1] }]}
            {...props}
        />,
    );

describe("a keyframe diamond's menu in the Timeline (#306)", () => {
    it("acts on the show's beat, not the timeline's", () => {
        const menu = keyframeMenu();
        showTimeline({ keyframeMenu: menu });
        // Drawn at the timeline's beat 16, one behind the show's
        fireEvent.contextMenu(
            screen.getByTestId("timeline-keyframe-16-filled"),
        );
        expect(menu.stateFor).toHaveBeenCalledWith(17);
        fireEvent.click(
            screen.getByRole("menuitem", { name: "Remove keyframe" }),
        );
        expect(menu.onUnset.mock.calls).toEqual([[17]]);
    });

    it("without a menu, a right-click on a diamond over a dragged range opens nothing", () => {
        // A dragged range alone no longer has a timeline menu entry
        showTimeline({
            onDeletePageFlag: vi.fn(),
            selection: {
                kind: "range",
                range: { startBeatIndex: 15, endBeatIndex: 19 },
            },
        });
        fireEvent.contextMenu(
            screen.getByTestId("timeline-keyframe-16-filled"),
            { clientX: 16 * 16 },
        );
        expect(screen.queryByTestId("timeline-range-menu")).toBeNull();
        expect(screen.queryByTestId("timeline-keyframe-menu")).toBeNull();
    });
});

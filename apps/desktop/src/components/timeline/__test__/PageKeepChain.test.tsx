import { TIMELINE_HEADROOM_HEIGHT } from "../TimelineGeometry";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    pageChainWords,
    type PageKeepState,
} from "@/timeline/timelineKeepLater";
import { setAsShownMenu } from "@/timeline/timelineSetAsShown";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { Timeline } from "../Timeline";
import { isTimelineOwnKey } from "../timelineHotkeys";
import type { TimelineSelection } from "../TimelineViewModel";
import type {
    TimelineClearPageMenu,
    TimelineSetAsShownMenu,
} from "../TimelineRangeMenu";
import {
    CHAIN_INSET,
    chainFit,
    REVEAL_PRESS_DELAY,
    type PageKeepChain,
    type PageKeepChains,
} from "../PageKeepChain";

/**
 * UI-18 keep later pages: the chains on the page boxes where the selected marchers follow (Not
 * set), with tooltips that name whom a click sets as shown; a click runs the command and never
 * selects, scrubs or drags the box; the page box menu has the same command. A chain sits at the
 * bottom left of its box, clear of the page number, and gives way to nothing where the box is too
 * narrow. Kept spots, with their chips, mixed badges, dots and K, are gone (holds, #467).
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

const LABEL =
    "2 marchers have no position of their own here, shown where Page 2 left them";
const chain = (extra: Partial<PageKeepChain> = {}): PageKeepChain => ({
    label: LABEL,
    hint: "Click to make them defined here, where they're shown",
    menuLabel: LABEL,
    menuHint: "Right-click the page to change this",
    marcherIds: [1, 2],
    onToggle: vi.fn(),
    ...extra,
});

const show = ({
    keepChains,
    setAsShown,
    clearPage,
    selection = null,
    onSelectionChange = vi.fn(),
    pixelsPerBeat = 16,
    positionBeat,
    onSeek,
}: {
    /** Where the playhead is, paused */
    positionBeat?: number;
    /** Seeks, with the playhead at beat 0 unless `positionBeat` says otherwise */
    onSeek?: (beat: number, options?: unknown) => void;
    keepChains?: PageKeepChains;
    setAsShown?: TimelineSetAsShownMenu;
    clearPage?: TimelineClearPageMenu;
    selection?: TimelineSelection;
    onSelectionChange?: (selection: TimelineSelection) => void;
    /**
     * 16: 128px boxes; 5: 40px, the label and no room for a chain; 3: 24px; 2: 16px, no label;
     * 1.5: 12px
     */
    pixelsPerBeat?: number;
}) =>
    render(
        <Timeline
            mode="expanded"
            beats={BEATS}
            pages={PAGES}
            measures={[]}
            timelines={[]}
            showTransport={false}
            selection={selection}
            onSelectionChange={onSelectionChange}
            keepChains={keepChains}
            setAsShown={setAsShown}
            clearPage={clearPage}
            pixelsPerBeat={pixelsPerBeat}
            playback={
                positionBeat === undefined && !onSeek
                    ? undefined
                    : {
                          positionBeat: positionBeat ?? 0,
                          isPlaying: false,
                          onSeek,
                      }
            }
        />,
    );

const chains = () => screen.queryAllByTestId("page-keep-chain");

describe("the chains on the page boxes", () => {
    it("draw nothing without chains (nothing selected)", () => {
        show({});
        expect(chains()).toEqual([]);
    });

    it("a linked chain says whom a click sets as shown; the click runs it and doesn't select the box", () => {
        const linked = chain();
        const onSelectionChange = vi.fn();
        show({ keepChains: new Map([[3, linked]]), onSelectionChange });
        const [button] = chains();
        expect(button).toHaveAttribute("data-chain", "follows");
        expect(button).toHaveAccessibleName(
            `Page 3: ${LABEL}. Click to make them defined here, where they're shown`,
        );
        // Full size in a wide box
        expect(button!.style.width).toBe("16px");
        expect(button!.style.height).toBe("16px");
        // A sibling of the box, not inside it
        const box = screen.getByRole("button", { name: "Page 3" });
        expect(box.contains(button!)).toBe(false);
        fireEvent.pointerDown(button!);
        fireEvent.mouseDown(button!);
        fireEvent.pointerUp(button!);
        fireEvent.click(button!);
        expect(linked.onToggle).toHaveBeenCalledTimes(1);
        expect(onSelectionChange).not.toHaveBeenCalled();
        // Enter and Space press it, not the app's shortcuts (pre-merge review U3)
        for (const k of ["Enter", " "])
            expect(
                isTimelineOwnKey(
                    { key: k, code: k, ctrlKey: false, metaKey: false },
                    button!,
                ),
            ).toBe(true);
    });

    it("a linked chain is only an outline, never filled", () => {
        show({ keepChains: new Map([[3, chain()]]) });
        const [button] = chains();
        expect(button!.className).toMatch(/\bborder\b/);
        expect(button!.className).not.toMatch(/(^|\s)bg-accent(\s|$)/);
    });

    it("a linked chain shows on the selected page; elsewhere only while its box is hovered", () => {
        // Page 3 selected: its box from beat 9 to 17
        show({
            keepChains: new Map([
                [3, chain()],
                [4, chain()],
            ]),
            selection: {
                kind: "range",
                range: { startBeatIndex: 9, endBeatIndex: 17 },
            },
        });
        const [here, next] = chains();
        expect(here).not.toHaveAttribute("data-reveal");
        expect(here!.className).not.toMatch(/\bopacity-0\b/);
        // Hidden until its box (just before it) or itself is hovered, or it has focus
        expect(next).toHaveAttribute("data-reveal", "hover");
        expect(next!.className).toMatch(/\bopacity-0\b/);
        expect(next!.className).toContain("[:hover+&]:opacity-100");
        expect(next!.previousElementSibling).toBe(
            screen.getByRole("button", { name: "Page 4" }),
        );
    });

    it("a hidden linked chain takes no pointer; its box's hover lets it, after a pause", () => {
        show({
            keepChains: new Map([
                [3, chain()],
                [4, chain()],
            ]),
            selection: {
                kind: "range",
                range: { startBeatIndex: 9, endBeatIndex: 17 },
            },
        });
        const [here, next] = chains();
        // Hidden, a press there goes to the box under it (review, 2026-10-12)
        expect(next!.className).toMatch(/(^|\s)pointer-events-none(\s|$)/);
        // Shown by its box's hover, it takes the pointer only REVEAL_PRESS_DELAY later
        expect(next!.className).toContain("[:hover+&]:pointer-events-auto");
        expect(next!.className).toContain(
            `[:hover+&]:[transition:pointer-events_0s_${REVEAL_PRESS_DELAY}ms_allow-discrete]`,
        );
        // Its own hover holds it once the pointer is on it; focus shows it and lets it be clicked
        expect(next!.className).toContain("hover:pointer-events-auto");
        expect(next!.className).toContain("focus-visible:pointer-events-auto");
        // Still a tab stop, as before
        expect(next).not.toHaveAttribute("tabindex", "-1");
        // A chain that shows takes the pointer as before
        expect(here!.className).not.toMatch(/pointer-events-none/);
    });

    it("a click runs only after a press on the chain itself, or from the keyboard", () => {
        const linked = chain();
        show({ keepChains: new Map([[3, linked]]) });
        const [button] = chains();
        const box = screen.getByRole("button", { name: "Page 3" });
        // A tap whose press went to the box, ending as a click on the chain once it shows
        fireEvent.pointerDown(box);
        fireEvent.click(button!, { detail: 1 });
        expect(linked.onToggle).not.toHaveBeenCalled();
        fireEvent.pointerDown(button!);
        fireEvent.click(button!, { detail: 1 });
        expect(linked.onToggle).toHaveBeenCalledTimes(1);
        // Enter or Space (detail 0)
        fireEvent.click(button!, { detail: 0 });
        expect(linked.onToggle).toHaveBeenCalledTimes(2);
    });

    it("sits at the bottom left, in from the flag before it", () => {
        show({ keepChains: new Map([[3, chain()]]) });
        const [button] = chains();
        const box = screen.getByRole("button", { name: "Page 3" });
        expect(
            parseFloat(button!.style.left) - parseFloat(box.style.left),
        ).toBe(CHAIN_INSET);
        // Its bottom 2px above the box's
        expect(button!.style.bottom).toBe("2px");
        expect(button!.style.top).toBe("");
    });

    it("on the selected page, is clear of the start flag's pennant, the playhead and the flag's grip", () => {
        // Page 3 selected: its box from beat 9 to 17, the start flag on beat 9
        show({
            keepChains: new Map([[3, chain()]]),
            selection: {
                kind: "range",
                range: { startBeatIndex: 9, endBeatIndex: 17 },
            },
        });
        const [button] = chains();
        const ruler = screen.getByTestId("timeline-page-ruler");
        const pennant = screen.getByTestId("timeline-start-pennant");
        const box = screen.getByRole("button", { name: "Page 3" });
        // The flag's x in the layer the pennant and the playhead are drawn in: the box starts on
        // it, and the pennant's handle starts 1px left of it
        const flagX = parseFloat(ruler.style.left) + parseFloat(box.style.left);
        expect(parseFloat(pennant.style.left)).toBe(flagX - 1);
        // UI-20: the pennant sits in the headroom strip above the page row, so the chain (in the
        // page row) never meets it
        expect(pennant.style.height).toBe(`${TIMELINE_HEADROOM_HEIGHT}px`);
        // The chain's x in that layer: the ruler starts `initialPageWidth` left, inside its 1px border
        const chainX =
            parseFloat(ruler.style.left) + 1 + parseFloat(button!.style.left);
        // Still past where the pennant's 14px handle would reach
        expect(chainX).toBeGreaterThan(flagX + 14);
        // The playhead's handle (and the start flag's, and the grip at most) is 12px centered on
        // its beat: 6px into the box
        const playhead = screen.getByTestId("timeline-playhead");
        expect(playhead.className).toMatch(/\bw-12\b/);
        expect(playhead.className).toMatch(/-translate-x-1\/2/);
        expect(chainX).toBeGreaterThan(flagX + 6);
        // And clear of the playhead on the box's own flag, at its right
        expect(chainX + 16).toBeLessThan(
            flagX + parseFloat(box.style.width) - 6,
        );
    });

    it("keeps the label from sliding onto it: the box's padding ends past the chain", () => {
        // The label is sticky to the viewport's right edge; a sticky element never leaves its
        // box's padding, so with the box running off the right edge it stops before the chain
        show({ keepChains: new Map([[3, chain()]]) });
        const [button] = chains();
        const box = screen.getByRole("button", { name: "Page 3" });
        const label = box.querySelector(".sticky")!;
        expect(label.textContent).toBe("3");
        expect(parseFloat(box.style.paddingLeft)).toBeGreaterThanOrEqual(
            parseFloat(button!.style.left) -
                parseFloat(box.style.left) +
                parseFloat(button!.style.width),
        );
        // A box without a chain keeps its usual padding
        expect(
            screen.getByRole("button", { name: "Page 2" }).style.paddingLeft,
        ).toBe("");
    });

    it("fits beside the label at the largest size that leaves it clear, else not at all", () => {
        // 16px where there's room, 12px where only that fits beside a one-digit label
        expect(chainFit(128, 1)).toEqual({ size: 16, offset: CHAIN_INSET });
        expect(chainFit(49, 1)).toEqual({ size: 16, offset: CHAIN_INSET });
        expect(chainFit(48, 1)).toEqual({ size: 12, offset: CHAIN_INSET });
        expect(chainFit(45, 1)).toEqual({ size: 12, offset: CHAIN_INSET });
        expect(chainFit(44, 1)).toBeNull();
        // A longer label needs more room
        expect(chainFit(48, 2)).toBeNull();
        // No label: in from the flag and clear of the flag at the right, or not at all; never
        // centered over the flags' handles, however narrow the box
        expect(chainFit(38, 0)).toEqual({ size: 16, offset: CHAIN_INSET });
        expect(chainFit(34, 0)).toEqual({ size: 12, offset: CHAIN_INSET });
        for (const width of [14, 16, 21, 30, 33])
            expect(chainFit(width, 0)).toBeNull();
    });

    it("never covers the page number: a narrow box shows no chain, and no mark of its own", () => {
        show({
            keepChains: new Map([
                [2, chain()],
                [3, chain()],
                [4, chain()],
            ]),
            pixelsPerBeat: 3,
        });
        expect(chains()).toEqual([]);
        expect(screen.queryAllByTestId("page-keep-dot")).toEqual([]);
        expect(screen.queryAllByTestId("page-keep-chain-count")).toEqual([]);
    });

    it("a narrow box takes on its chain's words, with the menu doing what the chain's click would", () => {
        show({
            keepChains: new Map([
                [3, chain()],
                [4, chain()],
            ]),
            pixelsPerBeat: 3,
        });
        expect(chains()).toEqual([]);
        for (const name of ["Page 3", "Page 4"])
            expect(
                screen.getByRole("button", { name }),
            ).toHaveAccessibleDescription(
                `${LABEL}. Right-click the page to change this`,
            );
        // A box without a chain has no words
        expect(
            screen.getByRole("button", { name: "Page 2" }),
        ).not.toHaveAttribute("aria-describedby");
    });

    it("a narrow box names whom the menu changes, with no K", async () => {
        show({
            keepChains: new Map([
                [
                    3,
                    chain({
                        menuLabel:
                            "OT1 and OT4 have no position of their own here, shown where earlier pages left them",
                    }),
                ],
            ]),
            pixelsPerBeat: 3,
        });
        const box = screen.getByRole("button", { name: "Page 3" });
        expect(box).not.toHaveAttribute("aria-keyshortcuts");
        expect(box).toHaveAccessibleDescription(
            "OT1 and OT4 have no position of their own here, shown where earlier pages left them. Right-click the page to change this",
        );
        fireEvent.focus(box);
        expect(
            (
                await screen.findAllByText(
                    "OT1 and OT4 have no position of their own here, shown where earlier pages left them",
                )
            ).length,
        ).toBeGreaterThan(0);
    });

    it("a box too narrow for its chain keeps its label's usual padding", () => {
        show({
            keepChains: new Map([[3, chain()]]),
            pixelsPerBeat: 5,
        });
        expect(chains()).toEqual([]);
        expect(
            screen.getByRole("button", { name: "Page 3" }).style.paddingLeft,
        ).toBe("");
    });

    it("a box too narrow for its label shows no chain over the flags' handles", () => {
        // 16px: before, a 12px chain was centered here, under the flags' handles
        show({
            keepChains: new Map([
                [3, chain()],
                [4, chain()],
            ]),
            pixelsPerBeat: 2,
        });
        expect(chains()).toEqual([]);
    });
});

describe("the page box menu", () => {
    const setAsShown = (): TimelineSetAsShownMenu => ({
        reasonFor: vi.fn(() => null),
        onSet: vi.fn(),
    });
    const item = (testId: string) => screen.queryByTestId(testId);

    it("has no Keep or Follow again entries, only Set as shown", () => {
        const menu = setAsShown();
        show({ setAsShown: menu, keepChains: new Map([[3, chain()]]) });
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

    it("a right-click on a chain opens its box's menu", () => {
        const menu = setAsShown();
        show({ setAsShown: menu, keepChains: new Map([[3, chain()]]) });
        fireEvent.contextMenu(chains()[0]!);
        expect(menu.reasonFor).toHaveBeenCalledWith("3");
        expect(item("timeline-range-menu-set-as-shown")).not.toBeNull();
    });
});

describe("a narrow box's words and its menu change the same marchers", () => {
    // Page 3: OT1 follows page 2; OT4 hasn't moved yet, so it follows the start
    const state = (): PageKeepState => ({
        pageId: 3,
        pageName: "3",
        box: { start: 9, end: 17 },
        follows: [1, 4],
        fromStart: [4],
        from: ["2"],
        selected: 2,
    });
    const nameOf = (id: number) => `OT${id}`;

    it("a linked chain sets only OT1; the box's words name the menu's OT1 and OT4", () => {
        const words = pageChainWords(state(), undefined, nameOf)!;
        expect(words.marcherIds).toEqual([1]);
        expect(words.label).toBe(
            "OT1 has no position of its own here, shown where Page 2 left it",
        );
        expect(words.menuLabel).toBe(
            "OT1 and OT4 have no position of their own here, shown where earlier pages left them",
        );
        expect(words.menuHint).toBe(
            "Changes to earlier pages carry onto Page 3. Right-click the page and choose Define as shown to keep them here",
        );
        const run = vi.fn();
        setAsShownMenu([state()], run).onSet(3);
        expect(run).toHaveBeenLastCalledWith(state().box, [1, 4]);
    });

    it("where all have moved, the box's words are the chain's", () => {
        const moved = { ...state(), follows: [1], fromStart: [] };
        const words = pageChainWords(moved)!;
        expect(words.menuLabel).toBe(words.label);
    });
});

const tooltip = () => screen.queryByRole("tooltip");
/** Longer than the tooltip's 500ms hover delay */
const pastTheDelay = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 700)));
const press = (target: Element, type: string, clientX: number, button = 0) =>
    fireEvent(target, new MouseEvent(type, { bubbles: true, button, clientX }));

/** Page 3 too narrow for its chain (24px boxes), so the box carries the chain's words */
const NARROW = {
    keepChains: new Map([[3, chain()]]),
    pixelsPerBeat: 3,
};

describe("a narrow box's tooltip, with its chain's words", () => {
    it("shows the words and their hint above the box after a hover", async () => {
        show(NARROW);
        const box = screen.getByRole("button", { name: "Page 3" });
        fireEvent.pointerMove(box);
        // Not straight away: a pass over the ruler doesn't flash one
        expect(tooltip()).not.toBeInTheDocument();
        const shown = await screen.findByRole("tooltip", {}, { timeout: 2000 });
        expect(shown).toHaveTextContent(
            `${LABEL}Right-click the page to change this`,
        );
        expect(
            document.querySelector('[data-side="top"]'),
            "above the box",
        ).not.toBeNull();
        // A real tooltip, not the native one
        expect(box).not.toHaveAttribute("title");
        fireEvent.pointerLeave(box);
        await waitFor(() => expect(tooltip()).not.toBeInTheDocument());
    });

    it("shows on keyboard focus", async () => {
        show(NARROW);
        const box = screen.getByRole("button", { name: "Page 3" });
        act(() => box.focus());
        expect(await screen.findByRole("tooltip")).toHaveTextContent(LABEL);
        act(() => box.blur());
        await waitFor(() => expect(tooltip()).not.toBeInTheDocument());
    });

    it("has none on a box without a chain", async () => {
        show(NARROW);
        const box = screen.getByRole("button", { name: "Page 4" });
        fireEvent.pointerMove(box);
        act(() => box.focus());
        await pastTheDelay();
        expect(tooltip()).not.toBeInTheDocument();
    });

    it("closes on a press, and the press still selects the box", async () => {
        const onSelectionChange = vi.fn();
        show({ ...NARROW, onSelectionChange });
        const box = screen.getByRole("button", { name: "Page 3" });
        fireEvent.pointerMove(box);
        await screen.findByRole("tooltip", {}, { timeout: 2000 });
        press(box, "pointerdown", 60);
        await waitFor(() => expect(tooltip()).not.toBeInTheDocument());
        press(box, "pointerup", 60);
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
        show({ ...NARROW, onSeek });
        const box = screen.getByRole("button", { name: "Page 3" });
        fireEvent.pointerMove(box);
        press(box, "pointerdown", 60);
        press(box, "pointermove", 120);
        await pastTheDelay();
        expect(tooltip()).not.toBeInTheDocument();
        expect(onSeek).toHaveBeenCalledWith(
            expect.any(Number),
            expect.objectContaining({ gesture: "drag" }),
        );
        press(box, "pointerup", 120);
        expect(tooltip()).not.toBeInTheDocument();
    });

    it("never opens on a right-click (the box's menu)", async () => {
        show(NARROW);
        const box = screen.getByRole("button", { name: "Page 3" });
        fireEvent.pointerMove(box);
        press(box, "pointerdown", 60, 2);
        fireEvent.contextMenu(box);
        await pastTheDelay();
        expect(tooltip()).not.toBeInTheDocument();
    });
});

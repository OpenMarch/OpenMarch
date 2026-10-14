import { TIMELINE_HEADROOM_HEIGHT } from "../TimelineGeometry";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keepOnPage } from "@/timeline/timelineKeepCommands";
import {
    keepToggle,
    pageChainWords,
    type PageKeepState,
} from "@/timeline/timelineKeepLater";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { Timeline } from "../Timeline";
import { isTimelineOwnKey } from "../timelineHotkeys";
import type { TimelineSelection } from "../TimelineViewModel";
import type { TimelineKeepHereMenu } from "../TimelineRangeMenu";
import type { LabeledHoldMarks } from "../PageHoldMark";
import {
    CHAIN_INSET,
    chainFit,
    keepDotFit,
    keepHereMenu,
    REVEAL_PRESS_DELAY,
    pageKeepChains,
    type PageKeepChain,
    type PageKeepChains,
} from "../PageKeepChain";

/**
 * UI-18 keep later pages: the chains on the page boxes for the selected marchers (linked, kept,
 * or a count for a mix), with tooltips that name whom a click changes; a click runs the command
 * and never selects, scrubs or drags the box; the page box menu has the same commands, enabled by
 * state. A chain sits at the bottom left of its box, clear of the page number, and gives way to a
 * dot (kept, mixed) or nothing (linked) where the box is too narrow.
 */

// The menu's commands write the show; these tests only check whom they'd change
vi.mock("@/timeline/timelineKeepCommands", () => ({
    keepOnPage: vi.fn(async () => {}),
    followAgainOn: vi.fn(async () => {}),
}));

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

const chain = (
    kind: PageKeepChain["kind"],
    extra: Partial<PageKeepChain> = {},
): PageKeepChain => {
    const label =
        kind === "follows"
            ? "Keep 2 marchers on Page 3"
            : kind === "kept"
              ? "2 marchers kept on Page 3"
              : "2 of the 8 selected are kept on Page 3 (OT1, OT8)";
    return {
        kind,
        label,
        hint:
            kind === "follows"
                ? "They won't follow Page 2 any more"
                : kind === "kept"
                  ? "Click to follow Page 2 again"
                  : "Click to keep the other 6 too",
        menuLabel: label,
        menuHint: "Right-click the page to change this",
        action: kind === "kept" ? "follow" : "keep",
        marcherIds: [1, 2],
        keptCount: kind === "follows" ? 0 : 2,
        onToggle: vi.fn(),
        ...extra,
    };
};

const show = ({
    keepChains,
    keepHere,
    selection = null,
    onSelectionChange = vi.fn(),
    pixelsPerBeat = 16,
    holdMarks,
    positionBeat,
    onAddPageFlag,
}: {
    holdMarks?: LabeledHoldMarks;
    /** Where the playhead is, paused */
    positionBeat?: number;
    /** Shows the add-page-flag **+** after the playhead */
    onAddPageFlag?: () => void;
    keepChains?: PageKeepChains;
    keepHere?: TimelineKeepHereMenu;
    selection?: TimelineSelection;
    onSelectionChange?: (selection: TimelineSelection) => void;
    /**
     * 16: 128px boxes; 5: 40px, the label and no room for a chain but room for a dot; 3: 24px, the
     * label and no room for either; 2: 16px, no label; 1.5: 12px
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
            keepHere={keepHere}
            pixelsPerBeat={pixelsPerBeat}
            holdMarks={holdMarks}
            playback={
                positionBeat === undefined
                    ? undefined
                    : { positionBeat, isPlaying: false }
            }
            onAddPageFlag={onAddPageFlag}
        />,
    );

const chains = () => screen.queryAllByTestId("page-keep-chain");

describe("the chains on the page boxes", () => {
    it("draw nothing without chains (nothing selected)", () => {
        show({});
        expect(chains()).toEqual([]);
    });

    it("a linked chain says whom a click keeps; the click keeps them and doesn't select the box", () => {
        const linked = chain("follows");
        const onSelectionChange = vi.fn();
        show({ keepChains: new Map([[3, linked]]), onSelectionChange });
        const [button] = chains();
        expect(button).toHaveAttribute("data-chain", "follows");
        expect(button).toHaveAccessibleName(
            "Page 3: Keep 2 marchers on Page 3. They won't follow Page 2 any more",
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

    it("a kept chain is broken and filled in the accent, so it can't be read as linked", () => {
        const kept = chain("kept");
        show({ keepChains: new Map([[3, kept]]) });
        const [button] = chains();
        expect(button).toHaveAttribute("data-chain", "kept");
        expect(button!.className).toMatch(/\bbg-accent\b/);
        expect(button!.className).toMatch(/\btext-text-invert\b/);
        expect(button!.className).not.toMatch(/\bborder\b/);
        expect(button).toHaveAccessibleName(
            "Page 3: 2 marchers kept on Page 3. Click to follow Page 2 again",
        );
        fireEvent.click(button!);
        expect(kept.onToggle).toHaveBeenCalledTimes(1);
    });

    it("a linked chain is only an outline, never filled", () => {
        show({ keepChains: new Map([[3, chain("follows")]]) });
        const [button] = chains();
        expect(button!.className).toMatch(/\bborder\b/);
        expect(button!.className).not.toMatch(/(^|\s)bg-accent(\s|$)/);
    });

    it("says (K) where K does what a click does, and nowhere else", async () => {
        show({
            keepChains: new Map([
                [3, chain("follows", { withK: true })],
                [4, chain("follows")],
            ]),
        });
        const [here, next] = chains();
        expect(here).toHaveAttribute("aria-keyshortcuts", "K");
        expect(next).not.toHaveAttribute("aria-keyshortcuts");
        fireEvent.focus(here!);
        expect(
            (await screen.findAllByText("Keep 2 marchers on Page 3 (K)"))
                .length,
        ).toBeGreaterThan(0);
    });

    it("a mixed chain shows the kept count", () => {
        show({ keepChains: new Map([[3, chain("mixed")]]) });
        const [button] = chains();
        expect(button).toHaveAttribute("data-chain", "mixed");
        expect(button!.className).toMatch(/\bborder-accent\b/);
        expect(screen.getByTestId("page-keep-chain-count").textContent).toBe(
            "2",
        );
        expect(button).toHaveAccessibleName(
            "Page 3: 2 of the 8 selected are kept on Page 3 (OT1, OT8). Click to keep the other 6 too",
        );
    });

    it("a linked chain shows on the selected page; elsewhere only while its box is hovered", () => {
        // Page 3 selected: its box from beat 9 to 17
        show({
            keepChains: new Map([
                [3, chain("follows")],
                [4, chain("follows")],
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
                [3, chain("follows")],
                [4, chain("follows")],
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

    it("a click keeps only after a press on the chain itself, or from the keyboard", () => {
        const linked = chain("follows");
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

    it("K's page shows its linked chain, and kept and mixed chains always show", () => {
        show({
            keepChains: new Map([
                [2, chain("follows", { withK: true })],
                [3, chain("kept")],
                [4, chain("mixed")],
            ]),
        });
        for (const button of chains())
            expect(button).not.toHaveAttribute("data-reveal");
    });

    it("sits at the bottom left, in from the flag before it", () => {
        show({ keepChains: new Map([[3, chain("kept")]]) });
        const [button] = chains();
        const box = screen.getByRole("button", { name: "Page 3" });
        expect(
            parseFloat(button!.style.left) - parseFloat(box.style.left),
        ).toBe(CHAIN_INSET);
        // On the hold bar: its bottom 2px above the box's, as the dot's
        expect(button!.style.bottom).toBe("2px");
        expect(button!.style.top).toBe("");
    });

    it("on the selected page, is clear of the start flag's pennant, the playhead and the flag's grip", () => {
        // Page 3 selected: its box from beat 9 to 17, the start flag on beat 9
        show({
            keepChains: new Map([[3, chain("follows")]]),
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

    it("the add-page-flag + moves past the chain of the playhead's box rather than cover it", () => {
        // Page 3's box from x 128; the playhead a beat in (x 144), so the + (8px after it, 16px
        // wide, drawn above the chain) would land on the chain
        show({
            keepChains: new Map([[3, chain("follows")]]),
            selection: {
                kind: "range",
                range: { startBeatIndex: 9, endBeatIndex: 17 },
            },
            positionBeat: 10,
            onAddPageFlag: vi.fn(),
        });
        const [button] = chains();
        const ruler = screen.getByTestId("timeline-page-ruler");
        const plus = screen.getByTestId("timeline-add-page-flag");
        // The chain's x in the layer the + is drawn in: inside the ruler's 1px border
        const chainX =
            parseFloat(ruler.style.left) + 1 + parseFloat(button!.style.left);
        const chainEnd = chainX + parseFloat(button!.style.width);
        expect(parseFloat(plus.style.left)).toBeGreaterThanOrEqual(chainEnd);
    });

    it("zoomed out, the + moves past the next box's chain from a beat before its flag", () => {
        // At 6px a beat page 3's box is 48px, room for a 12px chain beside its number. The
        // playhead on page 2's last beat sits 6px before page 3's flag, so the + (8px after it,
        // 16px wide) would reach that chain; page 3 is selected, so the linked chain shows
        show({
            keepChains: new Map([[3, chain("follows")]]),
            selection: {
                kind: "range",
                range: { startBeatIndex: 9, endBeatIndex: 17 },
            },
            pixelsPerBeat: 6,
            positionBeat: 8,
            onAddPageFlag: vi.fn(),
        });
        const [button] = chains();
        expect(button!.style.width).toBe("12px");
        const ruler = screen.getByTestId("timeline-page-ruler");
        const plus = screen.getByTestId("timeline-add-page-flag");
        const chainX =
            parseFloat(ruler.style.left) + 1 + parseFloat(button!.style.left);
        const chainEnd = chainX + parseFloat(button!.style.width);
        expect(parseFloat(plus.style.left)).toBeGreaterThanOrEqual(chainEnd);
    });

    it("the + stays 8px after the playhead where it can't reach a chain", () => {
        // Three beats into page 3 (x 176): already past its chain
        show({
            keepChains: new Map([[3, chain("kept")]]),
            positionBeat: 12,
            onAddPageFlag: vi.fn(),
        });
        expect(screen.getByTestId("timeline-add-page-flag").style.left).toBe(
            "184px",
        );
        cleanup();
        // A beat into page 3 (x 144) with no chain there (only page 4 has one)
        show({
            keepChains: new Map([[4, chain("kept")]]),
            positionBeat: 10,
            onAddPageFlag: vi.fn(),
        });
        expect(screen.getByTestId("timeline-add-page-flag").style.left).toBe(
            "152px",
        );
    });

    it("keeps the label from sliding onto it: the box's padding ends past the chain", () => {
        // The label is sticky to the viewport's right edge; a sticky element never leaves its
        // box's padding, so with the box running off the right edge it stops before the chain
        show({ keepChains: new Map([[3, chain("kept")]]) });
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

    it("puts a dot as far in as a chain where the label leaves room, never nearer the flag than 3px", () => {
        // As a chain would sit, clear of the label
        expect(keepDotFit(128, 1)).toEqual({
            offset: CHAIN_INSET,
            clear: true,
        });
        // Nearer the flag where the label needs the room
        expect(keepDotFit(40, 1)).toEqual({ offset: 13, clear: true });
        // No room beside the label: at the minimum
        expect(keepDotFit(24, 1)).toEqual({ offset: 3, clear: false });
        // No label: in from the flag, or centered in a box too narrow for that
        expect(keepDotFit(30, 0)).toEqual({ offset: 14, clear: true });
        expect(keepDotFit(16, 0)).toEqual({ offset: 5, clear: true });
        expect(keepDotFit(12, 0)).toEqual({ offset: 2, clear: true });
    });

    it("never covers the page number: a narrow box shows a dot for kept or mixed, nothing for linked", () => {
        show({
            keepChains: new Map([
                [2, chain("follows")],
                [3, chain("kept")],
                [4, chain("mixed")],
            ]),
            pixelsPerBeat: 3,
        });
        expect(chains()).toEqual([]);
        const dots = screen.getAllByTestId("page-keep-dot");
        expect(dots.map((dot) => dot.getAttribute("data-chain"))).toEqual([
            "kept",
            "mixed",
        ]);
        // Beside the label, at the start of the bar
        expect(dots[0]!.style.left).toBe("3px");
        // Inside the box, which still selects on a click
        const box = screen.getByRole("button", { name: "Page 3" });
        expect(box.contains(dots[0]!)).toBe(true);
    });

    it("a narrow box takes on its chain's words, with the menu doing what the chain's click would", () => {
        const holds = {
            mark: { kind: "holds", from: "2", kept: true },
            label: "Selected marchers are kept here",
            hint: "They stand where you kept them",
        } as const;
        show({
            keepChains: new Map([[3, chain("kept")]]),
            holdMarks: new Map([
                [3, holds],
                [4, holds],
            ]) as LabeledHoldMarks,
            pixelsPerBeat: 3,
        });
        expect(
            screen.getByRole("button", { name: "Page 3" }),
        ).toHaveAccessibleDescription(
            "2 marchers kept on Page 3. Right-click the page to change this",
        );
        // A box without a chain keeps its hold mark's words
        expect(
            screen.getByRole("button", { name: "Page 4" }),
        ).toHaveAccessibleDescription(
            "Selected marchers are kept here. They stand where you kept them",
        );
    });

    it("a narrow box takes on its chain's words without a hold mark too", () => {
        // A chain whose page has no hold mark (none passed): before, it vanished with no words
        show({
            keepChains: new Map([
                [3, chain("kept")],
                [4, chain("follows")],
            ]),
            pixelsPerBeat: 3,
        });
        expect(chains()).toEqual([]);
        expect(
            screen.getByRole("button", { name: "Page 3" }),
        ).toHaveAccessibleDescription(
            "2 marchers kept on Page 3. Right-click the page to change this",
        );
        // A linked chain gets no dot, but its words still reach the box
        expect(
            screen.getByRole("button", { name: "Page 4" }),
        ).toHaveAccessibleDescription(
            "Keep 2 marchers on Page 3. Right-click the page to change this",
        );
        // No hold mark is drawn for words alone
        expect(screen.queryAllByTestId("page-hold-mark")).toEqual([]);
    });

    it("a narrow box names whom the menu changes, and says (K) where K does the same", async () => {
        show({
            keepChains: new Map([
                [
                    3,
                    chain("follows", {
                        withK: false,
                        menuWithK: true,
                        menuLabel:
                            "OT1 and OT4 hold where earlier pages left them",
                    }),
                ],
                [4, chain("follows")],
            ]),
            pixelsPerBeat: 3,
        });
        const box = screen.getByRole("button", { name: "Page 3" });
        expect(box).toHaveAttribute("aria-keyshortcuts", "K");
        expect(box).toHaveAccessibleDescription(
            "OT1 and OT4 hold where earlier pages left them. Right-click the page to change this",
        );
        expect(
            screen.getByRole("button", { name: "Page 4" }),
        ).not.toHaveAttribute("aria-keyshortcuts");
        fireEvent.focus(box);
        expect(
            (
                await screen.findAllByText(
                    "OT1 and OT4 hold where earlier pages left them (K)",
                )
            ).length,
        ).toBeGreaterThan(0);
    });

    it("a wide box's chain says (K) only by withK, not by the menu's K", () => {
        show({
            keepChains: new Map([
                [3, chain("follows", { withK: false, menuWithK: true })],
            ]),
        });
        expect(chains()[0]).not.toHaveAttribute("aria-keyshortcuts");
        expect(
            screen.getByRole("button", { name: "Page 3" }),
        ).not.toHaveAttribute("aria-keyshortcuts");
    });

    it("a dot sits in from the flag where the label leaves room, and the label stops before it", () => {
        show({
            keepChains: new Map([[3, chain("kept")]]),
            pixelsPerBeat: 5,
        });
        expect(chains()).toEqual([]);
        const dot = screen.getByTestId("page-keep-dot");
        expect(dot.style.left).toBe("13px");
        expect(
            screen.getByRole("button", { name: "Page 3" }).style.paddingLeft,
        ).toBe("23px");
    });

    it("a box too narrow for its label shows a dot, not a chain over the flags' handles", () => {
        // 16px: before, a 12px chain was centered here, under the flags' handles
        show({
            keepChains: new Map([
                [3, chain("kept")],
                [4, chain("follows")],
            ]),
            pixelsPerBeat: 2,
        });
        expect(chains()).toEqual([]);
        const dots = screen.getAllByTestId("page-keep-dot");
        expect(dots).toHaveLength(1);
        expect(dots[0]!.style.left).toBe("5px");
    });
});

describe("the page box menu's keep entries", () => {
    const menu = (
        state: {
            canKeep: boolean;
            canFollow: boolean;
            keepShortcut?: string;
            followShortcut?: string;
        } | null,
    ): TimelineKeepHereMenu => ({
        stateFor: vi.fn(() => state),
        onKeep: vi.fn(),
        onFollow: vi.fn(),
    });
    const item = (testId: string) => screen.queryByTestId(testId);

    it("Keep selected marchers here, when some follow there", () => {
        const keepHere = menu({ canKeep: true, canFollow: false });
        show({ keepHere });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 3" }));
        expect(keepHere.stateFor).toHaveBeenCalledWith("3");
        const keep = item("timeline-range-menu-keep-here")!;
        expect(keep.textContent).toBe("Keep selected marchers here");
        expect(keep).not.toHaveAttribute("data-disabled");
        expect(item("timeline-range-menu-follow-again")).toHaveAttribute(
            "data-disabled",
        );
        fireEvent.click(keep);
        expect(keepHere.onKeep).toHaveBeenCalledWith("3");
    });

    it("Let selected marchers follow again, when some were kept there", () => {
        const keepHere = menu({ canKeep: false, canFollow: true });
        show({ keepHere });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 3" }));
        expect(item("timeline-range-menu-keep-here")).toHaveAttribute(
            "data-disabled",
        );
        const follow = item("timeline-range-menu-follow-again")!;
        expect(follow.textContent).toBe("Let selected marchers follow again");
        fireEvent.click(follow);
        expect(keepHere.onFollow).toHaveBeenCalledWith("3");
    });

    it("shows K after the entry K would run, quietly", () => {
        const keepHere = menu({
            canKeep: true,
            canFollow: false,
            keepShortcut: "K",
        });
        show({ keepHere });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 3" }));
        const keep = item("timeline-range-menu-keep-here")!;
        expect(keep.textContent).toBe("Keep selected marchers hereK");
        expect(keep).toHaveAttribute("aria-keyshortcuts", "K");
        const [shortcut] = screen.getAllByTestId("timeline-menu-shortcut");
        expect(shortcut!.className).toMatch(/text-text-subtitle/);
        expect(shortcut!.className).toMatch(/ml-auto/);
        expect(item("timeline-range-menu-follow-again")!.textContent).toBe(
            "Let selected marchers follow again",
        );
    });

    it("names K only on the entry K would run from the current page", () => {
        const state = (pageId: number, follows: number[], kept: number[]) => ({
            pageId,
            pageName: String(pageId),
            box: { start: pageId * 8 - 15, end: pageId * 8 - 7 },
            follows,
            fromStart: [],
            kept,
            from: ["2"],
            selected: 2,
        });
        const states = [state(3, [1], [2]), state(4, [1, 2], [])];
        const menuFor = keepHereMenu(states, {
            action: "keep",
            pageId: 3,
            box: states[0]!.box,
            marcherIds: [1],
        });
        expect(menuFor.stateFor("3")).toEqual({
            canKeep: true,
            canFollow: true,
            keepShortcut: "K",
            followShortcut: undefined,
        });
        expect(menuFor.stateFor(4)?.keepShortcut).toBeUndefined();
        expect(keepHereMenu(states).stateFor(3)?.keepShortcut).toBeUndefined();
    });

    it("has no keep entries with nothing selected", () => {
        show({ keepHere: menu(null) });
        fireEvent.contextMenu(screen.getByRole("button", { name: "Page 3" }));
        expect(item("timeline-range-menu-keep-here")).toBeNull();
        expect(item("timeline-range-menu-follow-again")).toBeNull();
    });

    it("a right-click on a chain opens its box's menu", () => {
        const keepHere = menu({ canKeep: true, canFollow: false });
        show({ keepHere, keepChains: new Map([[3, chain("follows")]]) });
        fireEvent.contextMenu(chains()[0]!);
        expect(keepHere.stateFor).toHaveBeenCalledWith("3");
        expect(item("timeline-range-menu-keep-here")).not.toBeNull();
    });
});

describe("a narrow box's words and its menu change the same marchers", () => {
    // Page 3: OT1 follows page 2; OT4 hasn't moved yet, so it follows the start
    const state = (kept: number[] = []): PageKeepState => ({
        pageId: 3,
        pageName: "3",
        box: { start: 9, end: 17 },
        follows: [1, 4],
        fromStart: [4],
        kept,
        from: ["2"],
        selected: 2 + kept.length,
    });
    const nameOf = (id: number) => `OT${id}`;

    it("a linked chain keeps only OT1; the box's words name the menu's OT1 and OT4", () => {
        const words = pageChainWords(state(), undefined, nameOf)!;
        expect(words.marcherIds).toEqual([1]);
        expect(words.label).toBe("OT1 holds where Page 2 left it");
        expect(words.menuLabel).toBe(
            "OT1 and OT4 hold where earlier pages left them",
        );
        expect(words.menuHint).toBe(
            "Changes to earlier pages carry onto Page 3. Right-click the page to keep them here instead",
        );
        keepHereMenu([state()]).onKeep(3);
        expect(keepOnPage).toHaveBeenLastCalledWith(state().box, [1, 4]);
    });

    it("a mixed chain counts the menu's rest, not-yet-moved ones too", () => {
        const words = pageChainWords(state([2]))!;
        expect(words.kind).toBe("mixed");
        expect(words.menuLabel).toBe("1 of the 3 selected is kept on Page 3");
        expect(words.menuHint).toBe(
            "The other 2 follow earlier pages. Right-click the page to keep them here too",
        );
        keepHereMenu([state([2])]).onKeep(3);
        expect(keepOnPage).toHaveBeenLastCalledWith(state().box, [1, 4]);
    });

    it("where all have moved, the box's words are the chain's", () => {
        const moved = { ...state(), follows: [1], fromStart: [] };
        const words = pageChainWords(moved)!;
        expect(words.menuLabel).toBe(words.label);
    });

    it("says (K) on the box where K keeps the menu's marchers, though not the chain's", () => {
        const states = [state()];
        const k = keepToggle(states, 3, 1);
        expect(k?.marcherIds).toEqual([1, 4]);
        expect(
            pageKeepChains(states, undefined, nameOf, k).get(3),
        ).toMatchObject({ withK: false, menuWithK: true });
        // No (K) where K would do something else there
        expect(pageKeepChains(states).get(3)).toMatchObject({
            withK: false,
            menuWithK: false,
        });
    });
});

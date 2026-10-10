import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";
import { Timeline } from "../Timeline";
import { isTimelineOwnKey } from "../timelineHotkeys";
import type { TimelineSelection } from "../TimelineViewModel";
import type { TimelineKeepHereMenu } from "../TimelineRangeMenu";
import {
    CHAIN_INSET,
    chainOffset,
    keepHereMenu,
    type PageKeepChain,
    type PageKeepChains,
} from "../PageKeepChain";

/**
 * UI-18 keep later pages: the chains on the page boxes for the selected marchers (linked, kept,
 * or a count for a mix), with tooltips that name whom a click changes; a click runs the command
 * and never selects, scrubs or drags the box; the page box menu has the same commands, enabled by
 * state.
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

const chain = (
    kind: PageKeepChain["kind"],
    extra: Partial<PageKeepChain> = {},
): PageKeepChain => ({
    kind,
    label:
        kind === "follows"
            ? "Keep 2 marchers on Page 3"
            : kind === "kept"
              ? "2 marchers kept on Page 3"
              : "2 of the 8 selected are kept on Page 3 (OT1, OT8)",
    hint:
        kind === "follows"
            ? "They won't follow Page 2 any more"
            : kind === "kept"
              ? "Click to follow Page 2 again"
              : "Click to keep the other 6 too",
    action: kind === "kept" ? "follow" : "keep",
    marcherIds: [1, 2],
    keptCount: kind === "follows" ? 0 : 2,
    onToggle: vi.fn(),
    ...extra,
});

const show = ({
    keepChains,
    keepHere,
    selection = null,
    onSelectionChange = vi.fn(),
}: {
    keepChains?: PageKeepChains;
    keepHere?: TimelineKeepHereMenu;
    selection?: TimelineSelection;
    onSelectionChange?: (selection: TimelineSelection) => void;
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
        // Big enough to hit
        expect(button!.style.width).toBe("20px");
        expect(button!.style.height).toBe("20px");
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

    it("the selected page keeps its chain, clear of its flags", () => {
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
        expect(chains()).toHaveLength(2);
        const box = screen.getByRole("button", { name: "Page 3" });
        expect(box).toHaveAttribute("aria-pressed", "true");
        const chainLeft = parseFloat(chains()[0]!.style.left);
        const boxLeft = parseFloat(box.style.left);
        expect(chainLeft - boxLeft).toBe(CHAIN_INSET);
    });

    it("sits in from the flag before it, or centered in a narrow box", () => {
        expect(chainOffset(200)).toBe(CHAIN_INSET);
        expect(chainOffset(40)).toBe(10);
        expect(chainOffset(10)).toBe(0);
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

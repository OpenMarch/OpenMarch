import { useMemo, useRef } from "react";
import { useTranslate } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { LinkBreakIcon, LinkSimpleIcon } from "@phosphor-icons/react";
import {
    pageChainWords,
    type KeepToggle,
    type KeepTranslate,
    type MarcherNameOf,
    type PageChainWords,
    type PageKeepState,
} from "@/timeline/timelineKeepLater";
import { followAgainOn, keepOnPage } from "@/timeline/timelineKeepCommands";
import { OWN_KEYS_WITH_SPACE } from "./timelineHotkeys";
import { ShortcutTooltip } from "./ShortcutTooltip";
import {
    timelineRangeTargetProps,
    type TimelineKeepHereMenu,
} from "./TimelineRangeMenu";
import type {
    TimelineBeatRange,
    TimelinePageMarker,
} from "./TimelineViewModel";
import { beatToX, pageLabelFits, pageLabelRoom } from "./TimelineGeometry";

/** A page box's chain (`pageChainWords`), with what a click does. */
export interface PageKeepChain extends PageChainWords {
    readonly onToggle: () => void;
    /** **K** does what a click does, so the tooltip says so */
    readonly withK?: boolean;
    /** **K** does what the page's menu does for `menuLabel`'s marchers (a box too narrow for it) */
    readonly menuWithK?: boolean;
}

/** The keyboard shortcut that toggles keep (`toggleKeepOnPage`), as menus and tooltips show it */
export const KEEP_SHORTCUT = "K";

/** Whether **K** (`keep`) would do `action` on the page `pageId`. */
const kDoes = (
    k: KeepToggle | null | undefined,
    pageId: string | number,
    action: KeepToggle["action"],
) => !!k && String(k.pageId) === String(pageId) && k.action === action;

/** Each page box's chain, by page id; boxes without one aren't in it. */
export type PageKeepChains = ReadonlyMap<string | number, PageKeepChain>;

/**
 * The page box menu's keep entries (`TimelineKeepHereMenu`) from the selection's keep states:
 * **Keep selected marchers here** for the ones that follow on the box, **Let selected marchers
 * follow again** for the kept ones. Neither shows without a selection. The entry **K** would run
 * shows the key.
 *
 * @param k what **K** does from the current page (`keepToggle`)
 */
export function keepHereMenu(
    states: readonly PageKeepState[],
    k: KeepToggle | null = null,
): TimelineKeepHereMenu {
    const of = (pageId: string | number) =>
        states.find((s) => String(s.pageId) === String(pageId));
    return {
        stateFor: (pageId) => {
            const state = of(pageId);
            return state
                ? {
                      canKeep: state.follows.length > 0,
                      canFollow: state.kept.length > 0,
                      keepShortcut: kDoes(k, pageId, "keep")
                          ? KEEP_SHORTCUT
                          : undefined,
                      followShortcut: kDoes(k, pageId, "follow")
                          ? KEEP_SHORTCUT
                          : undefined,
                  }
                : null;
        },
        onKeep: (pageId) => {
            const state = of(pageId);
            if (state && state.follows.length > 0)
                void keepOnPage(state.box, state.follows);
        },
        onFollow: (pageId) => {
            const state = of(pageId);
            if (state && state.kept.length > 0)
                void followAgainOn(state.box, state.kept);
        },
    };
}

const NO_CHAINS: PageKeepChains = new Map();

/**
 * The chains on the page boxes for the selected marchers (UI-18 keep later pages): one per box
 * they follow into, or were kept on. None without a selection (owner, 2026-10-09). A click keeps
 * or lets follow again exactly the marchers its words name, as one undo step.
 *
 * @param states the selection's keep states (`usePageKeepStates`)
 * @param nameOf the selected marchers' names, for the words
 * @param k what **K** does from the current page (`keepToggle`): that chain's tooltip says (K)
 */
export function usePageKeepChains(
    states: readonly PageKeepState[],
    nameOf?: MarcherNameOf,
    k: KeepToggle | null = null,
): PageKeepChains {
    const { t } = useTranslate();
    return useMemo(
        () =>
            pageKeepChains(
                states,
                (key, defaultValue, params) =>
                    t(key, { defaultValue, ...params }),
                nameOf,
                k,
            ),
        [states, t, nameOf, k],
    );
}

/** The chains `usePageKeepChains` gives, worded by `translate`. */
export function pageKeepChains(
    states: readonly PageKeepState[],
    translate?: KeepTranslate,
    nameOf?: MarcherNameOf,
    k: KeepToggle | null = null,
): PageKeepChains {
    if (states.length === 0) return NO_CHAINS;
    const chains = new Map<number, PageKeepChain>();
    for (const state of states) {
        const words = pageChainWords(state, translate, nameOf);
        if (!words) continue;
        chains.set(state.pageId, {
            ...words,
            // Only where K changes exactly the chain's marchers
            withK:
                kDoes(k, state.pageId, words.action) &&
                k!.marcherIds.join() === words.marcherIds.join(),
            // K changes whom the menu does (`keepToggle`, `keepHereMenu`) wherever it acts the same
            menuWithK: kDoes(k, state.pageId, words.action),
            onToggle: () =>
                void (words.action === "keep" ? keepOnPage : followAgainOn)(
                    state.box,
                    words.marcherIds,
                ),
        });
    }
    return chains;
}

/*
 * What a page box's chain must stay clear of (measured 2026-10-12, all drawn above it and all
 * taking the pointer): the playhead and the start flag (12px handles centered on their beat, the
 * full ruler height), the flag's grip (`TimelinePageFlagGrips`, at most 12px, centered on the
 * flag), and the start flag's pennant (a 14x14 handle from the flag rightward, the ruler's top 14px).
 * The box starts 1px past its flag (the ruler's border). On the selected page the start flag sits
 * on the box's left flag and the playhead on either flag, so both edges matter. The playhead's
 * add-page-flag **+** (16px, 8px right of the playhead, the ruler's top 6..22px) would cover the
 * chain of the box the playhead is in up to about 23px past its flag, and zoomed out the next
 * box's chain from a beat before its flag, so it moves past any chain it would cover
 * (`addPageFlagLeft`).
 */

/**
 * How far in from its box's left edge a chain sits: past the start flag's pennant, which reaches
 * 14px right of the flag (and so past the 6px of the grip, the playhead and the start flag) with
 * 1px to spare. A 16px chain's top is 9px down, inside the pennant's 14px, so it can't sit nearer.
 */
export const CHAIN_INSET = 14;
/**
 * How far a chain stays from a label-less box's right edge: past the 6px the playhead and the
 * grip reach in from the flag there
 */
const CHAIN_END_CLEARANCE = 8;
/** The gap between a chain or dot and the page label */
const LABEL_GAP = 2;
/** The chain's sizes (px): full where the box has room, then small */
export const CHAIN_SIZES = [16, 12] as const;
/** The dot a kept or mixed chain becomes where it can't fit (`PageKeepDot`) */
export const KEEP_DOT_SIZE = 8;
/**
 * The nearest a dot comes to a flag: clear of the flag's line and the grip's 3px hover bar, the
 * only marks drawn there. It takes no pointer, so the handles above it lose nothing.
 */
const DOT_MIN_INSET = 3;

/** How much of a box's right side its label (if shown) or right flag takes from a keep mark */
const markEnd = (labelChars: number, noLabel: number) =>
    labelChars > 0 ? pageLabelRoom(labelChars) + LABEL_GAP : noLabel;

/** Where a chain goes in its page box: its size and how far in from the box's left edge (px). */
export interface ChainFit {
    readonly size: number;
    readonly offset: number;
}

/**
 * Where a box's chain fits (owner, 2026-10-12: chains on narrow boxes covered the page numbers and
 * each other): at the bottom left, on the start of the hold bar, `CHAIN_INSET` in from the flag
 * before it, at the largest size that leaves the label and the box's right flag clear. Null where
 * neither size fits, however narrow the box: it shows a dot instead (`keepDotFit`).
 *
 * @param labelChars the box's label length, 0 when the box is too narrow to show it
 */
export function chainFit(
    boxWidth: number,
    labelChars: number,
): ChainFit | null {
    const after = markEnd(labelChars, CHAIN_END_CLEARANCE);
    const size = CHAIN_SIZES.find((s) => CHAIN_INSET + s + after <= boxWidth);
    return size === undefined ? null : { size, offset: CHAIN_INSET };
}

/** Where a box's dot goes (`PageKeepDot`): how far in from its left edge, and if clear of the label */
export interface KeepDotFit {
    readonly offset: number;
    readonly clear: boolean;
}

/**
 * Where a box's dot goes: in from the flag as a chain would be (`CHAIN_INSET`), or as far in as
 * the label leaves room for, but no nearer the flag than `DOT_MIN_INSET`. A box too narrow for its
 * label centers it when that's nearer; a box whose label leaves no room puts it at the minimum,
 * not clear of the label.
 */
export function keepDotFit(boxWidth: number, labelChars: number): KeepDotFit {
    const room = boxWidth - markEnd(labelChars, DOT_MIN_INSET) - KEEP_DOT_SIZE;
    if (room >= DOT_MIN_INSET)
        return { offset: Math.min(CHAIN_INSET, room), clear: true };
    if (labelChars > 0) return { offset: DOT_MIN_INSET, clear: false };
    return {
        offset: Math.max(0, Math.round((boxWidth - KEEP_DOT_SIZE) / 2)),
        clear: true,
    };
}

/**
 * The left padding a box gives its label with a keep mark at `offset`, `size` wide: the label is
 * sticky (it slides left when the box runs off the viewport's right edge), and a sticky label
 * never leaves its box's padding, so it stops before the mark.
 */
export const labelPaddingBeside = (offset: number, size: number) =>
    offset + size + LABEL_GAP;

/** How far right of the playhead the add-page-flag **+** sits (`TimelineVariants`) */
export const ADD_PAGE_FLAG_OFFSET = 8;
/** The add-page-flag **+**'s width (`TimelineVariants`, `size-16`) */
const ADD_PAGE_FLAG_SIZE = 16;

/**
 * Where the add-page-flag **+** goes (px from beat 0): `ADD_PAGE_FLAG_OFFSET` right of the
 * playhead, or just past any chain that would land under it. The + is drawn above the chains and
 * would take their clicks, and on the selected page, where the playhead usually is, the linked
 * chain always shows (review, 2026-10-12). That is the chain of the box the playhead is in, but
 * zoomed out also the next box's: the playhead can sit a beat before its flag, a few px away
 * (review, 2026-10-12). A chain that shows only on hover counts too: hovering would put it under
 * the +. Past a chain in a box only just wide enough for it, the + can reach past that box's right
 * flag.
 */
export function addPageFlagLeft({
    pages,
    beatCount,
    positionBeat,
    pixelsPerBeat,
    keepChains,
}: {
    pages: readonly TimelinePageMarker[];
    beatCount: number;
    positionBeat: number;
    pixelsPerBeat: number;
    keepChains?: PageKeepChains;
}): number {
    let left = beatToX(positionBeat, pixelsPerBeat) + ADD_PAGE_FLAG_OFFSET;
    if (!keepChains || keepChains.size === 0) return left;
    // The boxes in order, as getPageRange works them out, sorted once per call
    const ordered = pages
        .filter((page) => !page.isInitial)
        .sort((a, b) => a.atBeat - b.atBeat);
    // Left to right, and the + only moves right, so one pass finds every chain it reaches
    for (const [index, page] of ordered.entries()) {
        if (!keepChains.has(page.id)) continue;
        const endBeat = ordered[index + 1]?.atBeat ?? page.endBeat ?? beatCount;
        const boxWidth = (endBeat - page.atBeat) * pixelsPerBeat;
        const fit = chainFit(
            boxWidth,
            pageLabelFits(page.label, boxWidth) ? page.label.length : 0,
        );
        if (!fit) continue;
        // The box starts 1px past its flag: the ruler's border
        const chainStart = beatToX(page.atBeat, pixelsPerBeat) + 1 + fit.offset;
        const chainEnd = chainStart + fit.size;
        if (left < chainEnd && left + ADD_PAGE_FLAG_SIZE > chainStart)
            left = chainEnd + LABEL_GAP;
    }
    return left;
}

const BASE =
    "focus-visible:ring-accent absolute z-30 flex items-center justify-center rounded-full outline-hidden focus-visible:ring-2";

/**
 * Kept and linked are told apart at a glance (wp19): kept is a filled chip, linked a quiet
 * outline, and a mix a broken link outlined in the accent (simulated users read the accent
 * outlined link as linked, 2026-10-12). A hovered link fills, so it can't be read as a mix.
 */
const KIND_CLASS: Record<PageKeepChain["kind"], string> = {
    follows:
        "bg-fg-2 border border-text-subtitle/70 text-text-subtitle hover:border-accent hover:bg-accent hover:text-text-invert",
    kept: "bg-accent text-text-invert shadow-sm hover:opacity-85",
    mixed: "bg-fg-2 border border-accent text-accent hover:bg-accent/15",
};

/**
 * A linked chain shows only on the selected page, the page **K** works on, and the box under the
 * pointer (its own box, drawn just before it); everywhere else the
 * hold bar says they hold, and the box's menu keeps them. Simulated users, 2026-10-12: a chain on
 * every following page drowned out the kept ones; with none they couldn't find keep.
 *
 * Hidden, it takes no pointer (review, 2026-10-12): a press there goes to the box under it
 * (select, scrub, drag), not to keep. Hovering the box shows it at once but lets it take the
 * pointer only `REVEAL_PRESS_DELAY` later, so a press as the pointer arrives (or a tap, which
 * hovers the box as it lands) still goes to the box. Once the pointer is on it, its own hover
 * keeps it so (the box isn't hovered then). Tab still reaches it, and focus shows it at once.
 */
const REVEAL_ON_HOVER =
    "opacity-0 pointer-events-none hover:opacity-100 hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto [:hover+&]:opacity-100 [:hover+&]:pointer-events-auto [:hover+&]:[transition:pointer-events_0s_200ms_allow-discrete]";
/** How long a chain shown by hovering its box waits to take the pointer (ms, in `REVEAL_ON_HOVER`) */
export const REVEAL_PRESS_DELAY = 200;

const KIND_WEIGHT: Record<PageKeepChain["kind"], "regular" | "bold"> = {
    follows: "regular",
    kept: "bold",
    mixed: "bold",
};

/**
 * A page box's chain (UI-18 keep later pages), a sibling drawn right after the box, at its bottom
 * left where the hold bar starts: an outlined link where the selected marchers follow into the
 * page, broken on a filled accent chip where they were kept, and broken in an accent outline
 * where some were. Its tooltip names whom a click changes, and (K) where **K** does the same.
 * The press never reaches the box, so it doesn't select, scrub or drag it; a right-click opens
 * the box's menu, which has the same commands.
 */
export function PageKeepChainButton({
    chain,
    pageId,
    pageLabel,
    range,
    left,
    size,
    always,
}: {
    chain: PageKeepChain;
    pageId: string | number;
    pageLabel: string;
    /** The box's range, for the right-click menu (view beats) */
    range: TimelineBeatRange;
    /** Where the chain goes in the ruler (px) */
    left: number;
    /** The chain's size (`chainFit`) */
    size: number;
    /** A linked chain shows without hovering its box (the selected page, K's page) */
    always: boolean;
}) {
    const Icon = chain.kind === "follows" ? LinkSimpleIcon : LinkBreakIcon;
    const stop = (event: { stopPropagation: () => void }) =>
        event.stopPropagation();
    // A click runs only after a press on the chain itself, or from the keyboard (detail 0): a tap
    // whose press went to the box can end as a click here once the chain shows
    const pressed = useRef(false);
    const hidden = chain.kind === "follows" && !always;
    return (
        <ShortcutTooltip
            label={
                chain.withK ? `${chain.label} (${KEEP_SHORTCUT})` : chain.label
            }
            hint={chain.hint}
            side="top"
            closeOnPress
        >
            <button
                type="button"
                data-timeline-interactive="true"
                // Enter and Space press it, not the app's shortcuts (pre-merge review)
                data-timeline-own-keys={OWN_KEYS_WITH_SPACE}
                data-testid="page-keep-chain"
                data-chain={chain.kind}
                data-reveal={hidden ? "hover" : undefined}
                {...timelineRangeTargetProps(range, undefined, pageId)}
                aria-label={tolgee.t(
                    "timeline.keep.chain.ariaLabel",
                    "Page {page}: {label}. {hint}",
                    { page: pageLabel, label: chain.label, hint: chain.hint },
                )}
                aria-keyshortcuts={chain.withK ? KEEP_SHORTCUT : undefined}
                className={`${BASE} ${KIND_CLASS[chain.kind]}${hidden ? ` ${REVEAL_ON_HOVER}` : ""}`}
                style={{
                    left,
                    bottom: 2,
                    width: size,
                    height: size,
                }}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    pressed.current = true;
                }}
                onPointerCancel={() => (pressed.current = false)}
                onMouseDown={stop}
                onDoubleClick={stop}
                onClick={(event) => {
                    event.stopPropagation();
                    const fromPress = pressed.current;
                    pressed.current = false;
                    if (event.detail === 0 || fromPress) chain.onToggle();
                }}
            >
                <Icon
                    size={size - 4}
                    weight={KIND_WEIGHT[chain.kind]}
                    aria-hidden
                />
                {chain.kind === "mixed" && size >= CHAIN_SIZES[0] && (
                    <span
                        aria-hidden
                        data-testid="page-keep-chain-count"
                        className="bg-accent text-text-invert absolute -top-[4px] -right-[6px] flex h-[11px] min-w-[11px] items-center justify-center rounded-full px-[2px] text-[8px] leading-none font-bold"
                    >
                        {chain.keptCount}
                    </span>
                )}
            </button>
        </ShortcutTooltip>
    );
}

/**
 * A kept or mixed chain in a box too narrow for it (`chainFit`): a dot on the hold bar, filled
 * where kept, a ring where some are, where `keepDotFit` puts it. The box's tooltip carries the
 * chain's words.
 */
export function PageKeepDot({
    kind,
    left,
}: {
    kind: PageKeepChain["kind"];
    /** How far in from the box's left edge (px, `keepDotFit`) */
    left: number;
}) {
    return (
        <span
            aria-hidden
            data-testid="page-keep-dot"
            data-chain={kind}
            className={`pointer-events-none absolute bottom-[2px] size-[8px] rounded-full ${
                kind === "kept" ? "bg-accent" : "border-accent bg-fg-2 border-2"
            }`}
            style={{ left }}
        />
    );
}

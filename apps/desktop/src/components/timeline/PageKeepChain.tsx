import { useMemo, useRef } from "react";
import { useTranslate } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import { LinkSimpleIcon } from "@phosphor-icons/react";
import {
    pageChainWords,
    type KeepTranslate,
    type MarcherNameOf,
    type PageChainWords,
    type PageKeepState,
} from "@/timeline/timelineKeepLater";
import { setAsShownOn } from "@/timeline/timelineSetAsShown";
import { OWN_KEYS_WITH_SPACE } from "./timelineHotkeys";
import { ShortcutTooltip } from "./ShortcutTooltip";
import { timelineRangeTargetProps } from "./TimelineRangeMenu";
import type { TimelineBeatRange } from "./TimelineViewModel";
import { pageLabelRoom } from "./TimelineGeometry";

/** A page box's chain (`pageChainWords`), with what a click does. */
export interface PageKeepChain extends PageChainWords {
    readonly onToggle: () => void;
}

/** Each page box's chain, by page id; boxes without one aren't in it. */
export type PageKeepChains = ReadonlyMap<string | number, PageKeepChain>;

const NO_CHAINS: PageKeepChains = new Map();

/**
 * The chains on the page boxes for the selected marchers (UI-18 keep later pages): one per box
 * they follow into (Not set). None without a selection (owner, 2026-10-09). A click sets exactly
 * the marchers its words name as shown there (holds decision 12), as one undo step.
 *
 * @param states the selection's keep states (`usePageKeepStates`)
 * @param nameOf the selected marchers' names, for the words
 */
export function usePageKeepChains(
    states: readonly PageKeepState[],
    nameOf?: MarcherNameOf,
): PageKeepChains {
    const { t } = useTranslate();
    return useMemo(
        () =>
            pageKeepChains(
                states,
                (key, defaultValue, params) =>
                    t(key, { defaultValue, ...params }),
                nameOf,
            ),
        [states, t, nameOf],
    );
}

/** The chains `usePageKeepChains` gives, worded by `translate`. */
export function pageKeepChains(
    states: readonly PageKeepState[],
    translate?: KeepTranslate,
    nameOf?: MarcherNameOf,
): PageKeepChains {
    if (states.length === 0) return NO_CHAINS;
    const chains = new Map<number, PageKeepChain>();
    for (const state of states) {
        const words = pageChainWords(state, translate, nameOf);
        if (!words) continue;
        chains.set(state.pageId, {
            ...words,
            onToggle: () => void setAsShownOn(state.box, words.marcherIds),
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
 * on the box's left flag and the playhead on either flag, so both edges matter.
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
/** The gap between a chain and the page label */
const LABEL_GAP = 2;
/** The chain's sizes (px): full where the box has room, then small */
export const CHAIN_SIZES = [16, 12] as const;
/** How much of a box's right side its label (if shown) or right flag takes from a chain */
const markEnd = (labelChars: number, noLabel: number) =>
    labelChars > 0 ? pageLabelRoom(labelChars) + LABEL_GAP : noLabel;

/** Where a chain goes in its page box: its size and how far in from the box's left edge (px). */
export interface ChainFit {
    readonly size: number;
    readonly offset: number;
}

/**
 * Where a box's chain fits (owner, 2026-10-12: chains on narrow boxes covered the page numbers and
 * each other): at the bottom left, `CHAIN_INSET` in from the flag before it, at the largest size
 * that leaves the label and the box's right flag clear. Null where neither size fits: the box's
 * tooltip carries the chain's words instead.
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

/**
 * The left padding a box gives its label with a chain at `offset`, `size` wide: the label is
 * sticky (it slides left when the box runs off the viewport's right edge), and a sticky label
 * never leaves its box's padding, so it stops before the mark.
 */
export const labelPaddingBeside = (offset: number, size: number) =>
    offset + size + LABEL_GAP;

const BASE =
    "focus-visible:ring-accent absolute z-30 flex items-center justify-center rounded-full outline-hidden focus-visible:ring-2";

/** A linked chain is a quiet outline that fills when hovered (wp19) */
const CHAIN_CLASS =
    "bg-fg-2 border border-text-subtitle/70 text-text-subtitle hover:border-accent hover:bg-accent hover:text-text-invert";

/**
 * A linked chain shows only on the selected page and the box under the pointer (its own box,
 * drawn just before it); everywhere else the inspector's hold line says they hold, and the box's
 * menu sets them as shown. Simulated users, 2026-10-12: a chain on every following page was too
 * much; with none they couldn't find the command.
 *
 * Hidden, it takes no pointer (review, 2026-10-12): a press there goes to the box under it
 * (select, scrub, drag), not to the chain. Hovering the box shows it at once but lets it take the
 * pointer only `REVEAL_PRESS_DELAY` later, so a press as the pointer arrives (or a tap, which
 * hovers the box as it lands) still goes to the box. Once the pointer is on it, its own hover
 * keeps it so (the box isn't hovered then). Tab still reaches it, and focus shows it at once.
 */
const REVEAL_ON_HOVER =
    "opacity-0 pointer-events-none hover:opacity-100 hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto [:hover+&]:opacity-100 [:hover+&]:pointer-events-auto [:hover+&]:[transition:pointer-events_0s_200ms_allow-discrete]";
/** How long a chain shown by hovering its box waits to take the pointer (ms, in `REVEAL_ON_HOVER`) */
export const REVEAL_PRESS_DELAY = 200;

/**
 * A page box's chain (UI-18 keep later pages), a sibling drawn right after the box, at its bottom
 * left: an outlined link where the selected marchers follow into the page. Its tooltip names whom
 * a click sets as shown. The press never reaches the box, so it doesn't select, scrub or drag it;
 * a right-click opens the box's menu, which has the same command.
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
    /** A linked chain shows without hovering its box (the selected page) */
    always: boolean;
}) {
    const stop = (event: { stopPropagation: () => void }) =>
        event.stopPropagation();
    // A click runs only after a press on the chain itself, or from the keyboard (detail 0): a tap
    // whose press went to the box can end as a click here once the chain shows
    const pressed = useRef(false);
    const hidden = !always;
    return (
        <ShortcutTooltip
            label={chain.label}
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
                data-chain="follows"
                data-reveal={hidden ? "hover" : undefined}
                {...timelineRangeTargetProps(range, undefined, pageId)}
                aria-label={tolgee.t(
                    "timeline.keep.chain.ariaLabel",
                    "Page {page}: {label}. {hint}",
                    { page: pageLabel, label: chain.label, hint: chain.hint },
                )}
                className={`${BASE} ${CHAIN_CLASS}${hidden ? ` ${REVEAL_ON_HOVER}` : ""}`}
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
                <LinkSimpleIcon size={size - 4} weight="regular" aria-hidden />
            </button>
        </ShortcutTooltip>
    );
}

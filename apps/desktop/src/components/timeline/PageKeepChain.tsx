import { useMemo } from "react";
import { useTranslate } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import {
    LinkSimpleHorizontalBreakIcon,
    LinkSimpleHorizontalIcon,
} from "@phosphor-icons/react";
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
import type { TimelineBeatRange } from "./TimelineViewModel";

/** A page box's chain (`pageChainWords`), with what a click does. */
export interface PageKeepChain extends PageChainWords {
    readonly onToggle: () => void;
    /** **K** does what a click does, so the tooltip says so */
    readonly withK?: boolean;
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
    return useMemo(() => {
        if (states.length === 0) return NO_CHAINS;
        const translate: KeepTranslate = (key, defaultValue, params) =>
            t(key, { defaultValue, ...params });
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
                onToggle: () =>
                    void (words.action === "keep" ? keepOnPage : followAgainOn)(
                        state.box,
                        words.marcherIds,
                    ),
            });
        }
        return chains;
    }, [states, t, nameOf, k]);
}

/** The chain's size: a 20px target in the 28px ruler */
export const CHAIN_SIZE = 20;
/** How far in from the box's left edge: clear of the flag's grip, the start flag and the playhead */
export const CHAIN_INSET = 22;

/**
 * Where a box's chain goes, from the box's left edge (px): in from the flag before it, so the
 * selected page's flag, the start flag and the playhead never cover it; centered in a box too
 * narrow for that and its label.
 */
export function chainOffset(boxWidth: number): number {
    if (boxWidth >= CHAIN_INSET + CHAIN_SIZE + 28) return CHAIN_INSET;
    return Math.max(0, Math.round((boxWidth - CHAIN_SIZE) / 2));
}

const BASE =
    "focus-visible:ring-accent rounded-6 absolute top-[4px] z-30 flex items-center justify-center outline-hidden focus-visible:ring-2";

/**
 * Kept and linked are told apart at a glance (wp19, after the final study found purple and grey
 * too close): kept is a filled chip, linked only an outline, and a mix an outline in the accent
 * with a filled count.
 */
const KIND_CLASS: Record<PageKeepChain["kind"], string> = {
    // Linked: a quiet outline, the accent on hover
    follows:
        "border border-text/30 text-text/70 hover:border-accent hover:bg-accent/15 hover:text-accent",
    // Kept: broken, on a filled accent chip, so it can't be read as linked
    kept: "bg-accent text-text-invert shadow-sm hover:opacity-85",
    // Some kept: linked, outlined in the accent, with the kept count filled
    mixed: "border border-accent text-accent hover:bg-accent/15",
};

const KIND_WEIGHT: Record<PageKeepChain["kind"], "regular" | "bold"> = {
    follows: "regular",
    kept: "bold",
    mixed: "bold",
};

/**
 * A page box's chain (UI-18 keep later pages), a sibling drawn over the box's top left: an
 * outlined link where the selected marchers follow into the page, broken on a filled accent chip
 * where they were kept, and an accent outline with the kept count for a mix. Its tooltip names
 * whom a click changes, and (K) where **K** does the same. The press
 * never reaches the box, so it doesn't select, scrub or drag it; a right-click opens the box's
 * menu, which has the same commands.
 */
export function PageKeepChainButton({
    chain,
    pageId,
    pageLabel,
    range,
    left,
}: {
    chain: PageKeepChain;
    pageId: string | number;
    pageLabel: string;
    /** The box's range, for the right-click menu (view beats) */
    range: TimelineBeatRange;
    /** Where the chain goes in the ruler (px) */
    left: number;
}) {
    const Icon =
        chain.kind === "kept"
            ? LinkSimpleHorizontalBreakIcon
            : LinkSimpleHorizontalIcon;
    const stop = (event: { stopPropagation: () => void }) =>
        event.stopPropagation();
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
                {...timelineRangeTargetProps(range, undefined, pageId)}
                aria-label={tolgee.t(
                    "timeline.keep.chain.ariaLabel",
                    "Page {page}: {label}. {hint}",
                    { page: pageLabel, label: chain.label, hint: chain.hint },
                )}
                aria-keyshortcuts={chain.withK ? KEEP_SHORTCUT : undefined}
                className={`${BASE} ${KIND_CLASS[chain.kind]}`}
                style={{ left, width: CHAIN_SIZE, height: CHAIN_SIZE }}
                onPointerDown={stop}
                onMouseDown={stop}
                onDoubleClick={stop}
                onClick={(event) => {
                    event.stopPropagation();
                    chain.onToggle();
                }}
            >
                <Icon size={16} weight={KIND_WEIGHT[chain.kind]} aria-hidden />
                {chain.kind === "mixed" && (
                    <span
                        aria-hidden
                        data-testid="page-keep-chain-count"
                        className="bg-accent text-text-invert absolute -top-[3px] -right-[5px] flex h-[12px] min-w-[12px] items-center justify-center rounded-full px-[2px] text-[9px] leading-none font-bold"
                    >
                        {chain.keptCount}
                    </span>
                )}
            </button>
        </ShortcutTooltip>
    );
}

import { memo, useEffect, useMemo } from "react";
import type { KeyboardEvent } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import clsx from "clsx";
import tolgee from "@/global/singletons/Tolgee";
import { holdTerms } from "@/timeline/holdTerms";
import type { SelectionKeyframe } from "@/timeline/timelineSetFollowing";
import type { HoldLight } from "@/timeline/timelineHoldBars";
import type { TimelinePageMarker } from "./TimelineViewModel";
import {
    beatToX,
    getPageCountAt,
    TIMELINE_PAGE_ROW_BOTTOM,
} from "./TimelineGeometry";
import { ShortcutTooltip, TransportTooltipProvider } from "./ShortcutTooltip";
import {
    KEEP_MENU_EVENTS,
    TIMELINE_MENU_CONTENT_CLASS,
} from "./TimelineRangeMenu";
import { MENU_ITEM_CLASS } from "@/components/ui/popupClasses";

/**
 * A selection keyframe as the timeline draws it, with the selected marchers Set there by name
 * ("B1, B2 and 4 others"), or null when a name isn't known and the tooltip only counts them.
 */
export interface TimelineKeyframe extends SelectionKeyframe {
    readonly names?: string | null;
}

/**
 * A keyframe diamond's right-click menu (#306), by the diamond's beat: **Remove keyframe** and,
 * where pages follow the spot, **Remove keyframe, Pages N–M follow back** (the Unset actions), for
 * the selected marchers Set at that count. The playhead doesn't move.
 */
export interface TimelineKeyframeMenu {
    /**
     * Read when the menu opens: whether **Unset here** can run (some selected marchers are Set at
     * `beat` and nothing plays), and the second entry's label, or null where no pages follow
     */
    readonly stateFor: (beat: number) => {
        readonly canUnset: boolean;
        readonly followingLabel: string | null;
        /** The hold bars the second entry lights while hovered or focused (#477), spec beats */
        readonly followingLight?: HoldLight | null;
    };
    readonly onUnset: (beat: number) => void;
    readonly onUnsetAndFollowing: (beat: number) => void;
    /**
     * Lights the hold bars that would follow back (`followingLight`) while the second entry is
     * hovered or focused, and stops (null) on leave or when the menu closes
     */
    readonly onFollowingPreview?: (light: HoldLight | null) => void;
}

/** A diamond's size (px), and the press target around it */
const DIAMOND_SIZE = 9;
const TARGET_SIZE = 13;

/**
 * The selection's keyframes (#303, `useSelectionKeyframes`): a diamond at every count where a
 * selected marcher is Set, filled where all of them are, hollow where only some are. Drawn on the
 * page row's bottom edge, half over the measure row, so it covers no page label or the
 * playhead's handle, and only the bottom few pixels of a flag's grip (above it there, so a
 * diamond on a flag still seeks). Only the diamond takes the pointer: the page boxes around it
 * still select and scrub. Nothing selected, no diamonds. With `menu`, a right-click (or the
 * context-menu key, or Shift+F10) offers the Unset actions at the diamond's count (#306).
 */
export const TimelineKeyframes = memo(function TimelineKeyframes({
    keyframes,
    pages,
    pixelsPerBeat,
    onSeek,
    menu,
}: {
    keyframes: readonly TimelineKeyframe[];
    pages: readonly TimelinePageMarker[];
    pixelsPerBeat: number;
    onSeek?: (beat: number) => void;
    menu?: TimelineKeyframeMenu;
}) {
    // Worked out when the keyframes or pages change, not on every render (a scrub re-renders)
    const labels = useMemo(
        () => keyframes.map((keyframe) => keyframeLabel(keyframe, pages)),
        [keyframes, pages],
    );
    if (keyframes.length === 0) return null;
    return (
        <TransportTooltipProvider disableHoverableContent>
            {keyframes.map((keyframe, index) => (
                <KeyframeDiamond
                    key={keyframe.beat}
                    keyframe={keyframe}
                    title={labels[index]!.title}
                    detail={labels[index]!.detail}
                    left={beatToX(keyframe.beat, pixelsPerBeat)}
                    onSeek={onSeek}
                    menu={menu}
                />
            ))}
        </TransportTooltipProvider>
    );
});

/**
 * A diamond's tooltip: "Keyframe · Page 2, count 8", then, with more than one marcher selected,
 * who has it ("2 of 3 selected: B1 and B4"). The accessible name says both.
 */
function keyframeLabel(
    keyframe: TimelineKeyframe,
    pages: readonly TimelinePageMarker[],
): { readonly title: string; readonly detail: string | null } {
    const { pageLabel, count } = getPageCountAt({ pages }, keyframe.beat);
    const title = tolgee.t(
        "timeline.keyframes.title",
        "Keyframe · Page {page}, count {count}",
        { page: pageLabel, count },
    );
    if (keyframe.total === 1) return { title, detail: null };
    const counted = { set: keyframe.set, total: keyframe.total };
    return {
        title,
        detail: keyframe.names
            ? tolgee.t(
                  "timeline.keyframes.detailNames",
                  "{set} of {total} selected: {names}",
                  { ...counted, names: keyframe.names },
              )
            : tolgee.t(
                  "timeline.keyframes.detail",
                  "{set} of {total} selected",
                  counted,
              ),
    };
}

/**
 * One keyframe's diamond (`TimelineKeyframes`), with its right-click menu (#306) as the Basic
 * points have theirs.
 */
const KeyframeDiamond = memo(function KeyframeDiamond({
    keyframe,
    title,
    detail,
    left,
    onSeek,
    menu,
}: {
    keyframe: TimelineKeyframe;
    title: string;
    detail: string | null;
    left: number;
    onSeek?: (beat: number) => void;
    menu?: TimelineKeyframeMenu;
}) {
    const filled = keyframe.set === keyframe.total;
    const button = (
        <button
            type="button"
            data-testid={`timeline-keyframe-${keyframe.beat}-${filled ? "filled" : "hollow"}`}
            data-timeline-interactive="true"
            aria-label={
                detail
                    ? tolgee.t("timeline.keyframes.spoken", { title, detail })
                    : title
            }
            aria-haspopup={menu ? "menu" : undefined}
            // Under the start flag (z-40) and the playhead (z-50), over the flag grips (z-35)
            className="group/keyframe focus-visible:ring-accent pointer-events-auto absolute z-[36] flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 outline-hidden focus-visible:ring-2"
            style={{
                left,
                top: TIMELINE_PAGE_ROW_BOTTOM,
                width: TARGET_SIZE,
                height: TARGET_SIZE,
            }}
            // A press here is the diamond's: the timeline under it mustn't scrub
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onSeek?.(keyframe.beat)}
            // With its own menu, the page menu on the surface must not open too
            onContextMenu={
                menu ? (event) => event.stopPropagation() : undefined
            }
            onKeyDown={menu ? openMenuFromKeyboard : undefined}
        >
            <span
                aria-hidden="true"
                className={clsx(
                    "border-text block rotate-45 border-[1.5px] group-hover/keyframe:scale-125",
                    filled ? "bg-text" : "bg-bg-1",
                )}
                style={{
                    width: DIAMOND_SIZE - 2,
                    height: DIAMOND_SIZE - 2,
                }}
            />
        </button>
    );
    // Without a menu, a right-click goes on to the timeline's own
    if (!menu)
        return (
            <ShortcutTooltip
                label={title}
                hint={detail ?? undefined}
                side="top"
                closeOnPress
            >
                {button}
            </ShortcutTooltip>
        );
    return (
        <ContextMenu.Root>
            <ShortcutTooltip
                label={title}
                hint={detail ?? undefined}
                side="top"
                closeOnPress
            >
                <ContextMenu.Trigger asChild>{button}</ContextMenu.Trigger>
            </ShortcutTooltip>
            <ContextMenu.Portal>
                <ContextMenu.Content
                    // React bubbles the portal's presses to the timeline, which would scrub
                    // and capture the pointer
                    data-timeline-interactive="true"
                    data-testid="timeline-keyframe-menu"
                    className={TIMELINE_MENU_CONTENT_CLASS}
                    {...KEEP_MENU_EVENTS}
                >
                    <KeyframeMenuItems beat={keyframe.beat} menu={menu} />
                </ContextMenu.Content>
            </ContextMenu.Portal>
        </ContextMenu.Root>
    );
});

/** The menu's entries, read from `menu.stateFor` only while it's open */
function KeyframeMenuItems({
    beat,
    menu,
}: {
    beat: number;
    menu: TimelineKeyframeMenu;
}) {
    const { canUnset, followingLabel, followingLight } = menu.stateFor(beat);
    const preview = menu.onFollowingPreview;
    // The menu closing (an entry picked, Escape, a click away) ends the lighting
    useEffect(() => () => preview?.(null), [preview]);
    return (
        <>
            <ContextMenu.Item
                className={MENU_ITEM_CLASS}
                disabled={!canUnset}
                onSelect={() => menu.onUnset(beat)}
            >
                {tolgee.t(
                    "actions.timeline.unsetHere",
                    "{removeKeyframe}",
                    holdTerms(),
                )}
            </ContextMenu.Item>
            {followingLabel && (
                <ContextMenu.Item
                    className={MENU_ITEM_CLASS}
                    data-testid="timeline-keyframe-menu-follow-back"
                    onSelect={() => menu.onUnsetAndFollowing(beat)}
                    // Radix focuses the entry under the pointer, so this is hover and keys
                    onFocus={() => preview?.(followingLight ?? null)}
                    onBlur={() => preview?.(null)}
                >
                    {followingLabel}
                </ContextMenu.Item>
            )}
        </>
    );
}

/**
 * The context-menu key or Shift+F10 on a focused diamond opens its menu below it. Browsers don't
 * all send a `contextmenu` for them, so the diamond sends its own.
 */
function openMenuFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
        return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.dispatchEvent(
        new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.bottom,
        }),
    );
}

import {
    createContext,
    useContext,
    useEffect,
    useId,
    useState,
    type MouseEvent,
    type ReactNode,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipClassName } from "@openmarch/ui";
import {
    CursorTextIcon,
    DiamondIcon,
    EraserIcon,
    PauseIcon,
    FlagIcon,
    ArrowsMergeIcon,
    ArrowsSplitIcon,
    PencilSimpleIcon,
    TrashIcon,
    UsersThreeIcon,
    ScissorsIcon,
    QuestionIcon,
    CheckIcon,
} from "@phosphor-icons/react";
import tolgee from "@/global/singletons/Tolgee";
import { holdTerms } from "@/timeline/holdTerms";
import {
    type HoldCommand,
    type HoldEntryState,
} from "@/timeline/holdMenuState";
import { useTranslate } from "@tolgee/react";
import type { TimelineBeatRange } from "./TimelineViewModel";
import {
    MENU_CONTENT_CLASS,
    MENU_ITEM_CLASS,
    MENU_SEPARATOR_CLASS,
} from "@/components/ui/popupClasses";

/**
 * The timeline's right-click menu (ui.md UI-9, P8.14). On a page box it offers **Delete page**
 * (UI-9 Deleting a flag, P8.15), which keeps every later page's look, and next to it **Delete page
 * and its moves** (defined coordinates, owner decision 3), plus the hold and subset entries. On a
 * clip it offers the move's entries (UI-14): **Edit move**, **Rename move…** and **Delete move**,
 * the same entries as the selected clip's ⋯ button. A dragged range with none of those opens
 * nothing.
 */

/**
 * A small switch in front of a checkbox entry's words, drawn from the entry's `data-state`. It's
 * only a picture: the entry itself is the `menuitemcheckbox`, so the menu's keys still work.
 */
const MenuSwitch = () => (
    <span
        aria-hidden="true"
        className="border-stroke bg-fg-2 relative inline-flex h-[14px] w-[24px] shrink-0 items-center rounded-full border"
    >
        <span className="bg-text/80 group-data-[state=checked]:bg-accent block size-[10px] translate-x-[1px] rounded-full transition-transform duration-100 group-data-[state=checked]:translate-x-[11px]" />
    </span>
);

/**
 * Closes the timeline menu an entry is in. An open reason tip is the top layer, so it gets Escape
 * first; with this, that one Escape closes the menu too. Without it, Escape closes only the tip.
 */
export const TimelineMenuClose = createContext<(() => void) | null>(null);

/**
 * A menu entry that may be unavailable (`reason` says why). An unavailable entry stays in the
 * menu's arrow-key order, as menus keep disabled entries, but does nothing: its words dim and a
 * **?** at its end opens the reason beside it while the entry is highlighted (hover or keys) or
 * pressed (touch). Screen readers hear the reason as the entry's description. Escape closes the
 * tip and the menu together (`TimelineMenuClose`). With `checked`, it's one of a set of answers
 * (`menuitemradio`), and says whether it's the one chosen whether or not it's available.
 */
export function MenuItemWithReason({
    testId,
    reason,
    reasonTestId,
    onSelect,
    onHighlight,
    className = MENU_ITEM_CLASS,
    checked,
    children,
}: {
    testId: string;
    reason: string | null;
    reasonTestId: string;
    onSelect: () => void;
    /** The pointer or keys came onto the entry (true) or left it (false) */
    onHighlight?: (on: boolean) => void;
    className?: string;
    checked?: boolean;
    children: ReactNode;
}) {
    const reasonId = useId();
    // Highlighted (hover or keys) or pressed; the tip shows only while there's a reason
    const [open, setOpen] = useState(false);
    const closeMenu = useContext(TimelineMenuClose);
    const unavailable = reason !== null;
    // One element either way, so a reason that comes or goes while the menu is open (playback
    // stopping) keeps the entry, and the keyboard focus on it
    return (
        <>
            <DropdownMenu.Item
                data-testid={testId}
                {...(checked === undefined
                    ? {}
                    : { role: "menuitemradio", "aria-checked": checked })}
                aria-disabled={unavailable ? "true" : undefined}
                aria-describedby={unavailable ? reasonId : undefined}
                onSelect={(event) => {
                    if (!unavailable) return onSelect();
                    // Pressing it shows why instead of closing the menu
                    event.preventDefault();
                    setOpen(true);
                }}
                onFocus={() => {
                    setOpen(true);
                    onHighlight?.(true);
                }}
                onBlur={() => {
                    setOpen(false);
                    onHighlight?.(false);
                }}
                className={className}
            >
                {unavailable ? (
                    <>
                        <span className="flex items-center gap-8 opacity-50">
                            {children}
                        </span>
                        <Tooltip.Provider
                            delayDuration={0}
                            disableHoverableContent
                        >
                            {/* Only the entry opens and closes it: the tooltip's own pointer
                                handling would close it as the pointer crosses the ? */}
                            <Tooltip.Root open={open} onOpenChange={() => {}}>
                                <Tooltip.Trigger asChild>
                                    <span
                                        aria-hidden="true"
                                        data-testid={`${reasonTestId}-icon`}
                                        className="text-text-subtitle ml-auto pl-16"
                                    >
                                        <QuestionIcon size={14} />
                                    </span>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                    <Tooltip.Content
                                        side="right"
                                        sideOffset={8}
                                        onEscapeKeyDown={() =>
                                            closeMenu
                                                ? closeMenu()
                                                : setOpen(false)
                                        }
                                        className={`${TooltipClassName} text-body max-w-[240px]`}
                                    >
                                        {reason}
                                    </Tooltip.Content>
                                </Tooltip.Portal>
                            </Tooltip.Root>
                        </Tooltip.Provider>
                    </>
                ) : (
                    children
                )}
            </DropdownMenu.Item>
            {unavailable && (
                <span id={reasonId} data-testid={reasonTestId} hidden>
                    {reason}
                </span>
            )}
        </>
    );
}

/**
 * A hold command's page box entry (holds), by its name. When every selected
 * marcher is already in the state it sets, it's checked and does nothing (a disabled checkbox
 * entry with a check in place of its icon); otherwise it's unavailable with its reason, or runs.
 */
function HoldCommandItem({
    command,
    testId,
    menu,
    pageId,
    reason,
    icon,
    name,
}: {
    command: HoldCommand;
    testId: string;
    menu: TimelinePageCommandMenu;
    pageId: string | number;
    reason: string | null;
    icon: ReactNode;
    /** The entry's name */
    name: string;
}) {
    const entry = menu.entryOn?.(pageId);
    const label = name;
    const preview = reason === null ? menu.onPreview : undefined;
    // The menu closing takes the entry away without a blur
    useEffect(
        () => (preview ? () => preview(pageId, false) : undefined),
        [preview, pageId],
    );
    if (entry?.checked)
        return (
            <DropdownMenu.CheckboxItem
                data-testid={testId}
                checked
                disabled
                className={MENU_ITEM_CLASS}
            >
                <DropdownMenu.ItemIndicator className="flex">
                    <CheckIcon size={14} />
                </DropdownMenu.ItemIndicator>
                {label}
            </DropdownMenu.CheckboxItem>
        );
    return (
        <MenuItemWithReason
            testId={testId}
            reason={reason}
            reasonTestId={`${testId}-reason`}
            onSelect={() => menu.onSet(pageId)}
            onHighlight={preview && ((on) => preview(pageId, on))}
        >
            {icon}
            {label}
        </MenuItemWithReason>
    );
}

/** The menus' panel style */
export const TIMELINE_MENU_CONTENT_CLASS = `${MENU_CONTENT_CLASS} min-w-180`;

/**
 * For a menu's content: React events bubble out of a portal through the component tree, so a
 * press in a menu rendered inside the timeline would reach the timeline too, and scrub there.
 */
export const KEEP_MENU_EVENTS = {
    onPointerDown: (event: { stopPropagation: () => void }) =>
        event.stopPropagation(),
    onClick: (event: { stopPropagation: () => void }) =>
        event.stopPropagation(),
    onDoubleClick: (event: { stopPropagation: () => void }) =>
        event.stopPropagation(),
    onContextMenu: (event: { stopPropagation: () => void }) =>
        event.stopPropagation(),
} as const;

/**
 * An extra entry for a clip's or a page box's menu (UI-25 **Split N selected into new move**,
 * **Merge into Page N**, **Merge moves**), built by the app when the menu opens. An unavailable
 * entry says why behind a **?** (`MenuItemWithReason`).
 */
export interface TimelineMenuEntry {
    /** For `data-testid`: `timeline-menu-<id>` */
    readonly id: string;
    readonly label: string;
    readonly onSelect: () => void;
    readonly disabledReason?: string | null;
    readonly icon?: "split" | "merge";
}

/** Extra entries (`TimelineMenuEntry`), each with its reason behind a **?** when unavailable. */
export function TimelineMenuEntries({
    entries,
}: {
    entries: readonly TimelineMenuEntry[];
}) {
    return (
        <>
            {entries.map((entry) => {
                const reason = entry.disabledReason ?? null;
                return (
                    <MenuItemWithReason
                        key={entry.id}
                        testId={`timeline-menu-${entry.id}`}
                        reason={reason}
                        reasonTestId={`timeline-menu-${entry.id}-reason`}
                        onSelect={entry.onSelect}
                    >
                        {entry.icon === "merge" ? (
                            <ArrowsMergeIcon size={14} />
                        ) : (
                            <ArrowsSplitIcon size={14} />
                        )}
                        {entry.label}
                    </MenuItemWithReason>
                );
            })}
        </>
    );
}

/**
 * What a move's entries do, for one clip (UI-14). Rename only asks for the inline name field; the
 * clip's owner commits it.
 */
export interface TimelineMoveMenuActions {
    readonly onEdit: () => void;
    readonly onRename: () => void;
    readonly onDelete: () => void;
    /** **Select marchers**: selects the move's marchers; without it the entry isn't offered */
    readonly onSelectMarchers?: () => void;
    /** **Split at playhead** (UI-27); without it the entry isn't offered */
    readonly onSplit?: () => void;
    /** Why **Split at playhead** is unavailable now (read when the menu renders), or null */
    readonly splitDisabledReason?: () => string | null;
    /** Why **Edit move** and **Delete move** are unavailable (while playing), or null */
    readonly disabledReason?: string | null;
    /** UI-25: split and merge entries, after **Rename move…** */
    readonly extra?: () => readonly TimelineMenuEntry[];
}

/**
 * The move commands (UI-14) `Timeline` takes, by stored timeline id (`Id`); inside, the surface
 * gets them by track id. `onRename` commits the inline name field: `name` is what was typed,
 * stored as `renameTimeline` normalizes it.
 */
export interface TimelineMoveCommands<Id = number> {
    readonly onEdit: (id: Id) => void;
    readonly onRename: (id: Id, name: string) => void;
    readonly onDelete: (id: Id) => void;
    /** **Select marchers**; without it the entry isn't offered */
    readonly onSelectMarchers?: (id: Id) => void;
    /** **Split at playhead** (UI-27); without it the entry isn't offered */
    readonly onSplit?: (id: Id) => void;
    /** Why **Split at playhead** is unavailable for the move now, or null */
    readonly splitDisabledReason?: (id: Id) => string | null;
    /** Why **Edit move** and **Delete move** are unavailable (while playing), or null */
    readonly disabledReason?: string | null;
    /** UI-25: the move's split and merge entries, read when its menu opens */
    readonly extraFor?: (id: Id) => readonly TimelineMenuEntry[];
}

/**
 * A move's entries (UI-14), for the clip's right-click menu and its ⋯ button: **Edit move**,
 * **Select marchers**, **Rename move…**, then **Delete move**, red and last. Editing and deleting wait while playing,
 * each with the reason behind a **?**; renaming only changes a label, so it doesn't.
 */
export function TimelineMoveMenuItems({
    actions,
}: {
    actions: TimelineMoveMenuActions;
}) {
    const { t } = useTranslate();
    const reason = actions.disabledReason ?? null;
    // Read as the menu renders: the playhead may have moved since the clip's actions were made.
    // Its own reason first, so playing says "Pause to split a move."
    const splitReason = actions.onSplit
        ? (actions.splitDisabledReason?.() ?? reason)
        : null;
    const extra = actions.extra?.() ?? [];
    return (
        <>
            <MenuItemWithReason
                testId="timeline-move-menu-edit"
                reason={reason}
                reasonTestId="timeline-move-menu-reason"
                onSelect={actions.onEdit}
            >
                <PencilSimpleIcon size={14} />
                {t("timeline.moveMenu.edit")}
            </MenuItemWithReason>
            {actions.onSelectMarchers && (
                <DropdownMenu.Item
                    data-testid="timeline-move-menu-select-marchers"
                    onSelect={actions.onSelectMarchers}
                    className={MENU_ITEM_CLASS}
                >
                    <UsersThreeIcon size={14} />
                    {t("timeline.moveMenu.selectMarchers")}
                </DropdownMenu.Item>
            )}
            <DropdownMenu.Item
                data-testid="timeline-move-menu-rename"
                onSelect={actions.onRename}
                className={MENU_ITEM_CLASS}
            >
                <CursorTextIcon size={14} />
                {t("timeline.moveMenu.rename")}
            </DropdownMenu.Item>
            {actions.onSplit && (
                <MenuItemWithReason
                    testId="timeline-move-menu-split"
                    reason={splitReason}
                    reasonTestId="timeline-move-menu-split-reason"
                    onSelect={actions.onSplit}
                >
                    <ScissorsIcon size={14} />
                    {t("timeline.moveMenu.splitAtPlayhead")}
                </MenuItemWithReason>
            )}
            {extra.length > 0 && (
                <>
                    <DropdownMenu.Separator className={MENU_SEPARATOR_CLASS} />
                    <TimelineMenuEntries entries={extra} />
                </>
            )}
            <DropdownMenu.Separator className={MENU_SEPARATOR_CLASS} />
            <MenuItemWithReason
                testId="timeline-move-menu-delete"
                reason={reason}
                reasonTestId="timeline-move-menu-delete-reason"
                onSelect={actions.onDelete}
                className={`${MENU_ITEM_CLASS} text-red`}
            >
                <TrashIcon size={14} />
                {t("timeline.moveMenu.delete")}
            </MenuItemWithReason>
        </>
    );
}

/**
 * The page-box side of the timeline's right-click menu. `Timeline` builds it from its page
 * commands; ranges are view beats on the surface.
 */
export interface TimelinePageMenu {
    /**
     * **Delete page** on a page box (UI-9 Deleting a flag, P8.15): the page whose flag goes.
     * Without it, the menu has no delete entry.
     */
    readonly onDeleteFlag?: (pageId: string | number) => void;
    /**
     * **Delete page and its moves** on a page box, shown after **Delete page**: the page goes with
     * its page moves. Without it, the menu has no such entry.
     */
    readonly onDeleteWithMoves?: (pageId: string | number) => void;
    /**
     * **Set as shown** on a page box (holds, fork #466). Without it, the menu has no such entry.
     */
    readonly setAsShown?: TimelineSetAsShownMenu;
    /**
     * **Hold from last keyframe** on a page box (holds, fork #472). Without it, the menu has no
     * such entry.
     */
    readonly holdFromPrevious?: TimelinePageCommandMenu;
    /**
     * **Clear Page N** on a page box, and **Clear Page N, Pages N–M move back too** where later
     * pages would (#573). Without it, the menu has no such entries.
     */
    readonly clearPage?: TimelineClearPageMenu;
    /**
     * **Subset** on a page box (UI-9): a switch that shows whether the page is a subset, and
     * flips it. Without it, the menu has no such entry.
     */
    readonly subset?: {
        readonly isSubset: (pageId: string | number) => boolean;
        readonly onSet: (pageId: string | number, subset: boolean) => void;
    };
    /** UI-25: a page box's split entries, read when its menu opens */
    readonly extraFor?: (
        pageId: string | number,
    ) => readonly TimelineMenuEntry[];
    /**
     * **Split hold here** on a Held bar's right-click (holds decision 5, fork #475), at the count
     * under the pointer (view beats). Without it, the menu has no such entry.
     */
    readonly splitHold?: TimelineSplitHoldMenuView;
}

/** The menu's **Split hold here** entry (fork #475), by the right-clicked count (view beats). */
export interface TimelineSplitHoldMenuView {
    /** Whether a selected marcher's Held hold has the count strictly inside it */
    readonly offeredAt: (beat: number) => boolean;
    readonly onSplit: (beat: number) => void;
}

/** A page box menu entry for the selected marchers (holds), by page id. */
export interface TimelinePageCommandMenu {
    /**
     * Why the entry can't run on the page, or null when it can; undefined when no marchers are
     * selected, so the entry doesn't show
     */
    readonly reasonFor: (pageId: string | number) => string | null | undefined;
    readonly onSet: (pageId: string | number) => void;
    /**
     * What the entry would do for the selection on the page (`holdEntryStates`): checked when it
     * would change nobody because every selected marcher is already in its state, and how many it
     * would change for its label
     */
    readonly entryOn?: (pageId: string | number) => HoldEntryState | undefined;
    /** Shows (`on`) or stops what the entry would do on the page, while it's highlighted */
    readonly onPreview?: (pageId: string | number, on: boolean) => void;
}

/** The page box menu's **Clear Page N** entries (#573), by page id. */
export interface TimelineClearPageMenu {
    /**
     * The entries' labels on the page, read when its menu opens; undefined for none (home).
     * `checked` when every selected marcher is already Not defined there (`holdEntryStates`): the
     * Clear Page N entry shows ticked and off, and the follow-back entry doesn't show.
     */
    readonly labelsFor: (pageId: string | number) =>
        | {
              clear: string;
              followBack: string | null;
              checked?: boolean;
          }
        | undefined;
    readonly onClear: (pageId: string | number, followBack: boolean) => void;
}

/**
 * The page box menu's **Set as shown** entry (holds, fork #466), by page id: unavailable when no
 * selected marcher is Not set there.
 */
export type TimelineSetAsShownMenu = TimelinePageCommandMenu;

/**
 * What was right-clicked, in view beats. A clip names its track, so `Timeline` can send the
 * stored timeline's spec range: the view axis folds spec beats 0 and 1 together (UI-5), so a
 * view range can't give back a timeline that starts at beat 0. A page box names its page.
 */
export interface TimelineMenuTarget {
    readonly range: TimelineBeatRange;
    readonly trackId?: string;
    readonly pageId?: string;
    /** On a hold bar: the count under the pointer, for **Split hold here** (#475) */
    readonly holdBeat?: number;
}

/**
 * Marks an element as a menu target over `range` (view beats), for track `trackId` or page
 * `pageId` if given.
 */
export const timelineRangeTargetProps = (
    range: TimelineBeatRange,
    trackId?: string | number,
    pageId?: string | number,
) => ({
    "data-timeline-range-start": range.startBeatIndex,
    "data-timeline-range-end": range.endBeatIndex,
    ...(trackId === undefined
        ? {}
        : { "data-timeline-range-track": String(trackId) }),
    ...(pageId === undefined
        ? {}
        : { "data-timeline-range-page": String(pageId) }),
});

/** The target of the closest marked element under the event, or null. */
export const markedRangeAt = (
    target: EventTarget | null,
): TimelineMenuTarget | null => {
    const element =
        target instanceof Element
            ? target.closest<HTMLElement>("[data-timeline-range-start]")
            : null;
    if (!element) return null;
    const startBeatIndex = Number(element.dataset.timelineRangeStart);
    const endBeatIndex = Number(element.dataset.timelineRangeEnd);
    if (
        !Number.isFinite(startBeatIndex) ||
        !Number.isFinite(endBeatIndex) ||
        endBeatIndex <= startBeatIndex
    )
        return null;
    const trackId = element.dataset.timelineRangeTrack;
    const pageId = element.dataset.timelineRangePage;
    return {
        range: { startBeatIndex, endBeatIndex },
        ...(trackId === undefined ? {} : { trackId }),
        ...(pageId === undefined ? {} : { pageId }),
    };
};

/**
 * The menu as an `onContextMenu` handler for the timeline surface and an element to render next
 * to it, so the surface's markup doesn't change. `resolveRange` gives the range under the
 * right-click, or null for no menu there. Without a `menu`, the handler does nothing.
 */
export function useTimelineRangeMenu({
    menu,
    movesFor,
    resolveRange,
}: {
    menu?: TimelinePageMenu;
    /** A clip's move entries (UI-14) by its track id, or null where it has none */
    movesFor?: (trackId: string) => TimelineMoveMenuActions | null;
    resolveRange: (event: MouseEvent<HTMLElement>) => TimelineMenuTarget | null;
}): {
    onContextMenu: (event: MouseEvent<HTMLElement>) => void;
    element: ReactNode;
} {
    const [open, setOpen] = useState<{
        target: TimelineMenuTarget;
        x: number;
        y: number;
    } | null>(null);
    const movesOf = (target: TimelineMenuTarget) =>
        target.trackId === undefined
            ? null
            : (movesFor?.(target.trackId) ?? null);
    const onContextMenu = (event: MouseEvent<HTMLElement>) => {
        if (!menu && !movesFor) return;
        const target = resolveRange(event);
        if (!target) return;
        // Nothing to offer here: no page-box entry, and no move
        const canDelete =
            (menu?.onDeleteFlag !== undefined ||
                menu?.onDeleteWithMoves !== undefined ||
                menu?.setAsShown !== undefined ||
                menu?.holdFromPrevious !== undefined ||
                menu?.clearPage !== undefined ||
                menu?.subset !== undefined ||
                menu?.extraFor !== undefined ||
                menu?.splitHold !== undefined) &&
            target.pageId !== undefined;
        if (!canDelete && !movesOf(target)) return;
        event.preventDefault();
        setOpen({ target, x: event.clientX, y: event.clientY });
    };
    const moves = open ? movesOf(open.target) : null;
    const setAsShownReason =
        open && menu?.setAsShown && open.target.pageId !== undefined
            ? menu.setAsShown.reasonFor(open.target.pageId)
            : undefined;
    const holdReason =
        open && menu?.holdFromPrevious && open.target.pageId !== undefined
            ? menu.holdFromPrevious.reasonFor(open.target.pageId)
            : undefined;
    const clearLabels =
        open && menu?.clearPage && open.target.pageId !== undefined
            ? menu.clearPage.labelsFor(open.target.pageId)
            : undefined;
    const pageExtra =
        open && menu?.extraFor && open.target.pageId !== undefined
            ? menu.extraFor(open.target.pageId)
            : [];
    const splitHoldBeat =
        open?.target.holdBeat !== undefined &&
        menu?.splitHold?.offeredAt(open.target.holdBeat)
            ? open.target.holdBeat
            : undefined;
    const element = open && (
        <DropdownMenu.Root
            open
            modal={false}
            onOpenChange={(next) => {
                if (!next) setOpen(null);
            }}
        >
            <DropdownMenu.Trigger asChild>
                <span
                    aria-hidden="true"
                    className="pointer-events-none fixed size-0"
                    style={{ left: open.x, top: open.y }}
                />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    data-testid="timeline-range-menu"
                    align="start"
                    // The trigger is an invisible point; focus stays where an entry puts it (the
                    // rename field, UI-14)
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    {...KEEP_MENU_EVENTS}
                    className={TIMELINE_MENU_CONTENT_CLASS}
                >
                    <TimelineMenuClose.Provider value={() => setOpen(null)}>
                        {splitHoldBeat !== undefined && (
                            <>
                                <DropdownMenu.Item
                                    data-testid="timeline-range-menu-split-hold"
                                    className={MENU_ITEM_CLASS}
                                    onSelect={() =>
                                        menu?.splitHold?.onSplit(splitHoldBeat)
                                    }
                                >
                                    <ScissorsIcon size={14} />
                                    {tolgee.t(
                                        "timeline.rangeMenu.splitHold",
                                        "{splitHold}",
                                        holdTerms(),
                                    )}
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator
                                    className={MENU_SEPARATOR_CLASS}
                                />
                            </>
                        )}
                        {pageExtra.length > 0 && (
                            <>
                                <TimelineMenuEntries entries={pageExtra} />
                                <DropdownMenu.Separator
                                    className={MENU_SEPARATOR_CLASS}
                                />
                            </>
                        )}
                        {setAsShownReason !== undefined && (
                            <>
                                <HoldCommandItem
                                    command="defineAsShown"
                                    testId="timeline-range-menu-set-as-shown"
                                    menu={menu!.setAsShown!}
                                    pageId={open.target.pageId!}
                                    reason={setAsShownReason}
                                    icon={<DiamondIcon size={14} />}
                                    name={tolgee.t(
                                        "timeline.rangeMenu.setAsShown",
                                        "{defineAsShown}",
                                        holdTerms(),
                                    )}
                                />
                                {holdReason === undefined && (
                                    <DropdownMenu.Separator
                                        className={MENU_SEPARATOR_CLASS}
                                    />
                                )}
                            </>
                        )}
                        {holdReason !== undefined && (
                            <>
                                <HoldCommandItem
                                    command="holdFromPrevious"
                                    testId="timeline-range-menu-hold-from-previous"
                                    menu={menu!.holdFromPrevious!}
                                    pageId={open.target.pageId!}
                                    reason={holdReason}
                                    icon={<PauseIcon size={14} />}
                                    name={tolgee.t(
                                        "timeline.rangeMenu.holdFromPrevious",
                                        "{holdFromPrevious}",
                                        holdTerms(),
                                    )}
                                />
                                {clearLabels === undefined && (
                                    <DropdownMenu.Separator
                                        className={MENU_SEPARATOR_CLASS}
                                    />
                                )}
                            </>
                        )}
                        {clearLabels !== undefined && (
                            <>
                                {clearLabels.checked ? (
                                    <DropdownMenu.CheckboxItem
                                        data-testid="timeline-range-menu-clear-page"
                                        checked
                                        disabled
                                        className={MENU_ITEM_CLASS}
                                    >
                                        <DropdownMenu.ItemIndicator className="flex">
                                            <CheckIcon size={14} />
                                        </DropdownMenu.ItemIndicator>
                                        {clearLabels.clear}
                                    </DropdownMenu.CheckboxItem>
                                ) : (
                                    <DropdownMenu.Item
                                        data-testid="timeline-range-menu-clear-page"
                                        className={MENU_ITEM_CLASS}
                                        onSelect={() =>
                                            menu?.clearPage?.onClear(
                                                open.target.pageId!,
                                                false,
                                            )
                                        }
                                    >
                                        <EraserIcon size={14} />
                                        {clearLabels.clear}
                                    </DropdownMenu.Item>
                                )}
                                {!clearLabels.checked &&
                                    clearLabels.followBack !== null && (
                                        <DropdownMenu.Item
                                            data-testid="timeline-range-menu-clear-page-follow-back"
                                            className={MENU_ITEM_CLASS}
                                            onSelect={() =>
                                                menu?.clearPage?.onClear(
                                                    open.target.pageId!,
                                                    true,
                                                )
                                            }
                                        >
                                            <EraserIcon size={14} />
                                            {clearLabels.followBack}
                                        </DropdownMenu.Item>
                                    )}
                                <DropdownMenu.Separator
                                    className={MENU_SEPARATOR_CLASS}
                                />
                            </>
                        )}
                        {menu?.subset && open.target.pageId !== undefined && (
                            <>
                                <DropdownMenu.CheckboxItem
                                    data-testid="timeline-range-menu-subset"
                                    checked={menu.subset.isSubset(
                                        open.target.pageId,
                                    )}
                                    onCheckedChange={(checked) =>
                                        menu.subset?.onSet(
                                            open.target.pageId!,
                                            checked,
                                        )
                                    }
                                    className={`${MENU_ITEM_CLASS} group`}
                                >
                                    <MenuSwitch />
                                    {tolgee.t(
                                        "timeline.page.contextMenu.subsetToggle",
                                        "Subset",
                                    )}
                                </DropdownMenu.CheckboxItem>
                                <DropdownMenu.Separator
                                    className={MENU_SEPARATOR_CLASS}
                                />
                            </>
                        )}
                        {menu?.onDeleteFlag &&
                            open.target.pageId !== undefined && (
                                <DropdownMenu.Item
                                    data-testid="timeline-range-menu-delete-flag"
                                    onSelect={() =>
                                        menu.onDeleteFlag?.(open.target.pageId!)
                                    }
                                    className={`${MENU_ITEM_CLASS} text-red`}
                                >
                                    <FlagIcon size={14} />
                                    {tolgee.t("timeline.rangeMenu.deletePage")}
                                </DropdownMenu.Item>
                            )}
                        {menu?.onDeleteWithMoves &&
                            open.target.pageId !== undefined && (
                                <DropdownMenu.Item
                                    data-testid="timeline-range-menu-delete-with-moves"
                                    onSelect={() =>
                                        menu.onDeleteWithMoves?.(
                                            open.target.pageId!,
                                        )
                                    }
                                    className={`${MENU_ITEM_CLASS} text-red`}
                                >
                                    <TrashIcon size={14} />
                                    {tolgee.t(
                                        "timeline.rangeMenu.deleteWithMoves",
                                        "Delete page and its moves",
                                    )}
                                </DropdownMenu.Item>
                            )}
                        {moves && <TimelineMoveMenuItems actions={moves} />}
                    </TimelineMenuClose.Provider>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
    return { onContextMenu, element };
}

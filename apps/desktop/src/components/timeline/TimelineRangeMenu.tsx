import {
    createContext,
    useContext,
    useId,
    useState,
    type MouseEvent,
    type ReactNode,
} from "react";
import Shortcut from "@/components/ui/Shortcut";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipClassName } from "@openmarch/ui";
import {
    CursorTextIcon,
    DiamondIcon,
    FlagIcon,
    LinkBreakIcon,
    LinkSimpleIcon,
    ArrowsMergeIcon,
    ArrowsSplitIcon,
    PencilSimpleIcon,
    TrashIcon,
    UserPlusIcon,
    ScissorsIcon,
    QuestionIcon,
} from "@phosphor-icons/react";
import tolgee from "@/global/singletons/Tolgee";
import { useTranslate } from "@tolgee/react";
import type { TimelineBeatRange } from "./TimelineViewModel";

/**
 * The timeline's right-click menu (ui.md UI-9 Adding marchers, P8.14). It offers **Add selected
 * marchers** on a page box, a clip (its timeline) or a dragged range, for the range under the
 * pointer. Opening it doesn't change the timeline selection: the marchers to add are picked first,
 * where they can be selected. On a page box it also offers **Delete page** (UI-9 Deleting a flag,
 * P8.15), which keeps every later page's look, and next to it **Delete page and its moves**
 * (defined coordinates, owner decision 3). On a clip it offers the move's entries (UI-14):
 * **Edit move**, **Rename move…** and **Delete move**, the same entries as the selected clip's ⋯
 * button.
 */

/**
 * The menus' entry style; `data-[disabled]` dims a Radix-disabled one (Keep here, Follow again).
 * Entries with a reason dim themselves (`MenuItemWithReason`).
 */
export const TIMELINE_MENU_ITEM_CLASS =
    "rounded-4 data-[highlighted]:bg-fg-2 flex cursor-default items-center gap-8 px-8 py-6 text-[12px] outline-hidden select-none data-[disabled]:opacity-50";

/** Where a shortcut sits after an entry's words */
const SHORTCUT_CLASS = "text-text-subtitle ml-auto pl-16";

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
    className = TIMELINE_MENU_ITEM_CLASS,
    checked,
    children,
}: {
    testId: string;
    reason: string | null;
    reasonTestId: string;
    onSelect: () => void;
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
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
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
                                        className={`${TooltipClassName} max-w-[240px] text-[12px]`}
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

/** The entry's key, right-aligned and quiet; nothing without one. */
const MenuShortcut = ({ keys }: { keys?: string }) =>
    keys ? (
        <span className={SHORTCUT_CLASS} data-testid="timeline-menu-shortcut">
            <Shortcut binding={keys} />
        </span>
    ) : null;

/** The menus' panel style */
export const TIMELINE_MENU_CONTENT_CLASS =
    "bg-modal text-text rounded-6 border-stroke shadow-modal z-50 flex min-w-[180px] flex-col gap-4 border p-4 backdrop-blur-md";

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
 * **Rename move…**, then **Delete move**, red and last. Editing and deleting wait while playing,
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
            <DropdownMenu.Item
                data-testid="timeline-move-menu-rename"
                onSelect={actions.onRename}
                className={TIMELINE_MENU_ITEM_CLASS}
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
                    <DropdownMenu.Separator className="bg-stroke mx-4 h-px" />
                    <TimelineMenuEntries entries={extra} />
                </>
            )}
            <DropdownMenu.Separator className="bg-stroke mx-4 h-px" />
            <MenuItemWithReason
                testId="timeline-move-menu-delete"
                reason={reason}
                reasonTestId="timeline-move-menu-delete-reason"
                onSelect={actions.onDelete}
                className={`${TIMELINE_MENU_ITEM_CLASS} text-red`}
            >
                <TrashIcon size={14} />
                {t("timeline.moveMenu.delete")}
            </MenuItemWithReason>
        </>
    );
}

/**
 * The menu's command. `Timeline` takes it in spec beats; inside, it gets `TimelineMenuTarget`s
 * (`T`), whose ranges are view beats.
 */
export interface TimelineAddMarchersMenu<T = TimelineBeatRange> {
    /** **Add selected marchers**; without it, the menu has no add entry */
    readonly onAdd?: (target: T) => void;
    /** Why the command is unavailable (for example, no marchers are selected), or null */
    readonly disabledReason?: string | null;
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
     * **Keep selected marchers here** and **Let selected marchers follow again** on a page box
     * (UI-18 keep later pages), above the deletes. Without it, the menu has no such entries.
     */
    readonly keepHere?: TimelineKeepHereMenu;
    /**
     * **Set as shown** on a page box (holds, fork #466). Without it, the menu has no such entry.
     */
    readonly setAsShown?: TimelineSetAsShownMenu;
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
}

/** The page box menu's keep entries (UI-18 keep later pages), by page id. */
export interface TimelineKeepHereMenu {
    /**
     * Whether some selected marchers follow on the page (Keep applies) or were kept there
     * (Follow again applies); null when no marchers are selected, so neither entry shows
     */
    readonly stateFor: (pageId: string | number) => {
        readonly canKeep: boolean;
        readonly canFollow: boolean;
        /** The key that runs the entry from here (**K**), shown after it */
        readonly keepShortcut?: string;
        readonly followShortcut?: string;
    } | null;
    readonly onKeep: (pageId: string | number) => void;
    readonly onFollow: (pageId: string | number) => void;
}

/** The page box menu's **Set as shown** entry (holds, fork #466), by page id. */
export interface TimelineSetAsShownMenu {
    /**
     * Why the entry can't run on the page (no selected marcher is Not set there), or null when it
     * can; undefined when no marchers are selected, so the entry doesn't show
     */
    readonly reasonFor: (pageId: string | number) => string | null | undefined;
    readonly onSet: (pageId: string | number) => void;
}

/**
 * What was right-clicked, in view beats. A clip names its track, so `Timeline` can send the
 * stored timeline's spec range: the view axis folds spec beats 0 and 1 together (UI-5), so a
 * view range can't give back a timeline that starts at beat 0. A page box names its page.
 */
export interface TimelineMenuTarget {
    readonly range: TimelineBeatRange;
    readonly trackId?: string;
    readonly pageId?: string;
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
    menu?: TimelineAddMarchersMenu<TimelineMenuTarget>;
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
        // Nothing to offer here: no add, no page box to delete the flag of, and no move
        const canDelete =
            (menu?.onDeleteFlag !== undefined ||
                menu?.onDeleteWithMoves !== undefined ||
                menu?.keepHere !== undefined ||
                menu?.setAsShown !== undefined ||
                menu?.subset !== undefined ||
                menu?.extraFor !== undefined) &&
            target.pageId !== undefined;
        if (!menu?.onAdd && !canDelete && !movesOf(target)) return;
        event.preventDefault();
        setOpen({ target, x: event.clientX, y: event.clientY });
    };
    const disabledReason = menu?.disabledReason ?? null;
    const moves = open ? movesOf(open.target) : null;
    const keepState =
        open && menu?.keepHere && open.target.pageId !== undefined
            ? menu.keepHere.stateFor(open.target.pageId)
            : null;
    const setAsShownReason =
        open && menu?.setAsShown && open.target.pageId !== undefined
            ? menu.setAsShown.reasonFor(open.target.pageId)
            : undefined;
    const pageExtra =
        open && menu?.extraFor && open.target.pageId !== undefined
            ? menu.extraFor(open.target.pageId)
            : [];
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
                        {menu?.onAdd && (
                            <MenuItemWithReason
                                testId="timeline-range-menu-add"
                                reason={disabledReason}
                                reasonTestId="timeline-range-menu-reason"
                                onSelect={() => menu.onAdd?.(open.target)}
                            >
                                <UserPlusIcon size={14} />
                                {tolgee.t("timeline.rangeMenu.addSelected")}
                            </MenuItemWithReason>
                        )}
                        {pageExtra.length > 0 && (
                            <>
                                <TimelineMenuEntries entries={pageExtra} />
                                <DropdownMenu.Separator className="bg-stroke mx-4 h-px" />
                            </>
                        )}
                        {setAsShownReason !== undefined && (
                            <>
                                <MenuItemWithReason
                                    testId="timeline-range-menu-set-as-shown"
                                    reason={setAsShownReason}
                                    reasonTestId="timeline-range-menu-set-as-shown-reason"
                                    onSelect={() =>
                                        menu?.setAsShown?.onSet(
                                            open.target.pageId!,
                                        )
                                    }
                                >
                                    <DiamondIcon size={14} />
                                    {tolgee.t(
                                        "timeline.rangeMenu.setAsShown",
                                        "Set as shown",
                                    )}
                                </MenuItemWithReason>
                                {!keepState && (
                                    <DropdownMenu.Separator className="bg-stroke mx-4 h-px" />
                                )}
                            </>
                        )}
                        {keepState && (
                            <>
                                <DropdownMenu.Item
                                    data-testid="timeline-range-menu-keep-here"
                                    disabled={!keepState.canKeep}
                                    aria-keyshortcuts={keepState.keepShortcut}
                                    onSelect={() =>
                                        menu?.keepHere?.onKeep(
                                            open.target.pageId!,
                                        )
                                    }
                                    className={TIMELINE_MENU_ITEM_CLASS}
                                >
                                    <LinkBreakIcon size={14} />
                                    {tolgee.t(
                                        "timeline.rangeMenu.keepHere",
                                        "Keep selected marchers here",
                                    )}
                                    <MenuShortcut
                                        keys={keepState.keepShortcut}
                                    />
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                    data-testid="timeline-range-menu-follow-again"
                                    disabled={!keepState.canFollow}
                                    aria-keyshortcuts={keepState.followShortcut}
                                    onSelect={() =>
                                        menu?.keepHere?.onFollow(
                                            open.target.pageId!,
                                        )
                                    }
                                    className={TIMELINE_MENU_ITEM_CLASS}
                                >
                                    <LinkSimpleIcon size={14} />
                                    {tolgee.t(
                                        "timeline.rangeMenu.followAgain",
                                        "Let selected marchers follow again",
                                    )}
                                    <MenuShortcut
                                        keys={keepState.followShortcut}
                                    />
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator className="bg-stroke mx-4 h-px" />
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
                                    className={`${TIMELINE_MENU_ITEM_CLASS} group`}
                                >
                                    <MenuSwitch />
                                    {tolgee.t(
                                        "timeline.page.contextMenu.subsetToggle",
                                        "Subset",
                                    )}
                                </DropdownMenu.CheckboxItem>
                                <DropdownMenu.Separator className="bg-stroke mx-4 h-px" />
                            </>
                        )}
                        {menu?.onDeleteFlag &&
                            open.target.pageId !== undefined && (
                                <DropdownMenu.Item
                                    data-testid="timeline-range-menu-delete-flag"
                                    onSelect={() =>
                                        menu.onDeleteFlag?.(open.target.pageId!)
                                    }
                                    className={`${TIMELINE_MENU_ITEM_CLASS} text-red`}
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
                                    className={`${TIMELINE_MENU_ITEM_CLASS} text-red`}
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

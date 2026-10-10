import { useState, type MouseEvent, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
    CursorTextIcon,
    FlagIcon,
    LinkSimpleHorizontalBreakIcon,
    LinkSimpleHorizontalIcon,
    PencilSimpleIcon,
    TrashIcon,
    UserPlusIcon,
} from "@phosphor-icons/react";
import tolgee from "@/global/singletons/Tolgee";
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

/** The menus' entry style; `data-[disabled]` dims an unavailable one */
const ITEM_CLASS =
    "rounded-4 data-[highlighted]:bg-fg-2 flex cursor-default items-center gap-8 px-8 py-6 text-[12px] outline-hidden select-none data-[disabled]:opacity-50";

/** A shortcut after an entry's words, as the transport's popover shows Ctrl+M */
const SHORTCUT_CLASS = "text-text-subtitle ml-auto pl-16 font-mono text-[11px]";

/** The entry's key, right-aligned and quiet; nothing without one. */
const MenuShortcut = ({ keys }: { keys?: string }) =>
    keys ? (
        <span className={SHORTCUT_CLASS} data-testid="timeline-menu-shortcut">
            {keys}
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
 * What a move's entries do, for one clip (UI-14). Rename only asks for the inline name field; the
 * clip's owner commits it.
 */
export interface TimelineMoveMenuActions {
    readonly onEdit: () => void;
    readonly onRename: () => void;
    readonly onDelete: () => void;
    /** Why **Edit move** and **Delete move** are unavailable (while playing), or null */
    readonly disabledReason?: string | null;
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
    /** Why **Edit move** and **Delete move** are unavailable (while playing), or null */
    readonly disabledReason?: string | null;
}

/**
 * A move's entries (UI-14), for the clip's right-click menu and its ⋯ button: **Edit move**,
 * **Rename move…**, then **Delete move**, red and last. Editing and deleting wait while playing,
 * with the reason; renaming only changes a label, so it doesn't.
 */
export function TimelineMoveMenuItems({
    actions,
}: {
    actions: TimelineMoveMenuActions;
}) {
    const reason = actions.disabledReason ?? null;
    return (
        <>
            <DropdownMenu.Item
                data-testid="timeline-move-menu-edit"
                disabled={reason !== null}
                onSelect={actions.onEdit}
                className={ITEM_CLASS}
            >
                <PencilSimpleIcon size={14} />
                Edit move
            </DropdownMenu.Item>
            <DropdownMenu.Item
                data-testid="timeline-move-menu-rename"
                onSelect={actions.onRename}
                className={ITEM_CLASS}
            >
                <CursorTextIcon size={14} />
                Rename move…
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="bg-stroke mx-4 h-px" />
            <DropdownMenu.Item
                data-testid="timeline-move-menu-delete"
                disabled={reason !== null}
                onSelect={actions.onDelete}
                className={`${ITEM_CLASS} text-red`}
            >
                <TrashIcon size={14} />
                Delete move
            </DropdownMenu.Item>
            {reason !== null && (
                <p
                    data-testid="timeline-move-menu-reason"
                    className="text-text-subtitle px-8 pb-4 text-[11px]"
                >
                    {reason}
                </p>
            )}
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
                menu?.keepHere !== undefined) &&
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
                    {menu?.onAdd && (
                        <DropdownMenu.Item
                            disabled={disabledReason !== null}
                            onSelect={() => menu.onAdd?.(open.target)}
                            className={ITEM_CLASS}
                        >
                            <UserPlusIcon size={14} />
                            Add selected marchers
                        </DropdownMenu.Item>
                    )}
                    {menu?.onAdd && disabledReason !== null && (
                        <p
                            data-testid="timeline-range-menu-reason"
                            className="text-text-subtitle px-8 pb-4 text-[11px]"
                        >
                            {disabledReason}
                        </p>
                    )}
                    {keepState && (
                        <>
                            <DropdownMenu.Item
                                data-testid="timeline-range-menu-keep-here"
                                disabled={!keepState.canKeep}
                                aria-keyshortcuts={keepState.keepShortcut}
                                onSelect={() =>
                                    menu?.keepHere?.onKeep(open.target.pageId!)
                                }
                                className={ITEM_CLASS}
                            >
                                <LinkSimpleHorizontalBreakIcon size={14} />
                                {tolgee.t(
                                    "timeline.rangeMenu.keepHere",
                                    "Keep selected marchers here",
                                )}
                                <MenuShortcut keys={keepState.keepShortcut} />
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
                                className={ITEM_CLASS}
                            >
                                <LinkSimpleHorizontalIcon size={14} />
                                {tolgee.t(
                                    "timeline.rangeMenu.followAgain",
                                    "Let selected marchers follow again",
                                )}
                                <MenuShortcut keys={keepState.followShortcut} />
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="bg-stroke mx-4 h-px" />
                        </>
                    )}
                    {menu?.onDeleteFlag && open.target.pageId !== undefined && (
                        <DropdownMenu.Item
                            data-testid="timeline-range-menu-delete-flag"
                            onSelect={() =>
                                menu.onDeleteFlag?.(open.target.pageId!)
                            }
                            className={`${ITEM_CLASS} text-red`}
                        >
                            <FlagIcon size={14} />
                            Delete page
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
                                className={`${ITEM_CLASS} text-red`}
                            >
                                <TrashIcon size={14} />
                                {tolgee.t(
                                    "timeline.rangeMenu.deleteWithMoves",
                                    "Delete page and its moves",
                                )}
                            </DropdownMenu.Item>
                        )}
                    {moves && <TimelineMoveMenuItems actions={moves} />}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
    return { onContextMenu, element };
}

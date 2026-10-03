import { useState, type MouseEvent, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FlagIcon, UserPlusIcon } from "@phosphor-icons/react";
import type { TimelineBeatRange } from "./TimelineViewModel";

/**
 * The timeline's right-click menu (ui.md UI-9 Adding marchers, P8.14). It offers **Add selected
 * marchers** on a page box, a clip (its timeline) or a dragged range, for the range under the
 * pointer. Opening it doesn't change the timeline selection: the marchers to add are picked first,
 * where they can be selected. On a page box it also offers **Delete page flag** (UI-9 Deleting a
 * flag, P8.15).
 */

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
     * **Delete page flag** on a page box (UI-9 Deleting a flag, P8.15): the page whose flag goes.
     * Without it, the menu has no delete entry.
     */
    readonly onDeleteFlag?: (pageId: string | number) => void;
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
    resolveRange,
}: {
    menu?: TimelineAddMarchersMenu<TimelineMenuTarget>;
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
    const onContextMenu = (event: MouseEvent<HTMLElement>) => {
        if (!menu) return;
        const target = resolveRange(event);
        if (!target) return;
        // Nothing to offer here: no add, and no page box to delete the flag of
        const canDelete =
            menu.onDeleteFlag !== undefined && target.pageId !== undefined;
        if (!menu.onAdd && !canDelete) return;
        event.preventDefault();
        setOpen({ target, x: event.clientX, y: event.clientY });
    };
    const disabledReason = menu?.disabledReason ?? null;
    const element = menu && open && (
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
                    className="bg-modal text-text rounded-6 border-stroke shadow-modal z-50 flex min-w-[180px] flex-col gap-4 border p-4 backdrop-blur-md"
                >
                    {menu.onAdd && (
                        <DropdownMenu.Item
                            disabled={disabledReason !== null}
                            onSelect={() => menu.onAdd?.(open.target)}
                            className="rounded-4 data-[highlighted]:bg-fg-2 flex cursor-default items-center gap-8 px-8 py-6 text-[12px] outline-hidden select-none data-[disabled]:opacity-50"
                        >
                            <UserPlusIcon size={14} />
                            Add selected marchers
                        </DropdownMenu.Item>
                    )}
                    {menu.onAdd && disabledReason !== null && (
                        <p
                            data-testid="timeline-range-menu-reason"
                            className="text-text-subtitle px-8 pb-4 text-[11px]"
                        >
                            {disabledReason}
                        </p>
                    )}
                    {menu.onDeleteFlag && open.target.pageId !== undefined && (
                        <DropdownMenu.Item
                            data-testid="timeline-range-menu-delete-flag"
                            onSelect={() =>
                                menu.onDeleteFlag?.(open.target.pageId!)
                            }
                            className="rounded-4 data-[highlighted]:bg-fg-2 text-red flex cursor-default items-center gap-8 px-8 py-6 text-[12px] outline-hidden select-none"
                        >
                            <FlagIcon size={14} />
                            Delete page flag
                        </DropdownMenu.Item>
                    )}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
    return { onContextMenu, element };
}

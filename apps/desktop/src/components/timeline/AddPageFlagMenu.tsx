import { useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import tolgee from "@/global/singletons/Tolgee";
import type { ActionId } from "@/shortcuts/definitions";
import { getActionLabel } from "@/shortcuts/labels";
import Shortcut from "@/components/ui/Shortcut";
import {
    KEEP_MENU_EVENTS,
    TIMELINE_MENU_CONTENT_CLASS,
} from "./TimelineRangeMenu";
import {
    MENU_ITEM_CLASS,
    MENU_SEPARATOR_CLASS,
} from "@/components/ui/popupClasses";
import { BasicPointRemoveItem } from "./TimelineBasicLayers";
import { useShowShortcutHints } from "@/stores/KeyboardSeenStore";

/**
 * The paused playhead's right-click menu (UI-9; replaced the **+** beside the playhead, owner
 * 2026-10-19: a button on the end of the start flag–playhead pair read as acting on that range,
 * but adding a page only puts a flag at one beat). **Create page at playhead** (F) puts a flag at
 * the playhead, and **Create subset at playhead** (Shift+F) adds the same page as a subset, so later
 * pages keep their numbers. Each is its action's label, with the name the new page would get, muted,
 * and the action's shortcut. Without `onAddPage` (playing, on a flag, at home, past the beats)
 * there's no menu and a right-click passes through. The trigger stays mounted either way, so the
 * playhead button isn't remounted (and doesn't lose focus mid arrow-key step) as `onAddPage` comes
 * and goes.
 *
 * In Basic, when the playhead covers a mid-page tick (`basicPointUnderPlayhead`), `point` adds the
 * tick's **Remove this count's position** (with its reason when it can't run), since the playhead
 * takes the right-click and long press there. With only `point`, that's the whole menu.
 */
export function AddPageFlagMenu({
    onAddPage,
    onAddSubsetPage,
    names,
    point,
    children,
}: {
    onAddPage?: () => void;
    onAddSubsetPage?: () => void;
    names?: { page: string; subset: string };
    /** The covered tick's Remove, and why it can't run (`null` when it can) */
    point?: { onRemove: () => void; reason: string | null };
    children: ReactNode;
}) {
    const hasMenu = onAddPage !== undefined || point !== undefined;
    // Radix's context menu keeps its own open state, so this copy drops a menu left open when
    // its entries go (Play), rather than letting it come back open with them
    const [open, setOpen] = useState(false);
    if (open && !hasMenu) setOpen(false);
    return (
        <ContextMenu.Root onOpenChange={setOpen}>
            {/* A right-click on the playhead is its own, not the surface's range menu */}
            <ContextMenu.Trigger
                asChild
                disabled={!hasMenu}
                onContextMenu={
                    hasMenu ? (event) => event.stopPropagation() : undefined
                }
            >
                {children}
            </ContextMenu.Trigger>
            {open && hasMenu && (
                <ContextMenu.Portal>
                    <ContextMenu.Content
                        data-testid="timeline-add-page-flag-menu"
                        {...KEEP_MENU_EVENTS}
                        className={TIMELINE_MENU_CONTENT_CLASS}
                    >
                        {onAddPage && (
                            <MenuEntry
                                testId="timeline-add-page"
                                action="timelineCreatePageAtPlayhead"
                                onSelect={onAddPage}
                                name={names?.page}
                            />
                        )}
                        {onAddPage && onAddSubsetPage && (
                            <MenuEntry
                                testId="timeline-add-subset-page"
                                action="timelineCreateSubsetAtPlayhead"
                                onSelect={onAddSubsetPage}
                                name={names?.subset}
                            />
                        )}
                        {onAddPage && point && (
                            <ContextMenu.Separator
                                className={MENU_SEPARATOR_CLASS}
                            />
                        )}
                        {point && (
                            <BasicPointRemoveItem
                                reason={point.reason}
                                onRemove={point.onRemove}
                            />
                        )}
                    </ContextMenu.Content>
                </ContextMenu.Portal>
            )}
        </ContextMenu.Root>
    );
}

const translate = (key: string, params?: Record<string, string | number>) =>
    tolgee.t(key, params);

/**
 * An entry: the action's label, the new page's name, muted, and the action's shortcut (in the
 * touch layout only once a hardware keyboard has been used, #880)
 */
function MenuEntry({
    testId,
    action,
    onSelect,
    name,
}: {
    testId: string;
    action: ActionId;
    onSelect: () => void;
    name?: string;
}) {
    const showHints = useShowShortcutHints();
    return (
        <ContextMenu.Item
            data-testid={testId}
            onSelect={onSelect}
            className={MENU_ITEM_CLASS}
        >
            {getActionLabel(action, translate)}
            {name && (
                <span
                    data-testid="timeline-add-page-name"
                    className="text-text-subtitle text-sub"
                >
                    {name}
                </span>
            )}
            {showHints && (
                <span
                    data-testid="timeline-add-page-shortcut"
                    className="ml-auto pl-16"
                >
                    <Shortcut action={action} />
                </span>
            )}
        </ContextMenu.Item>
    );
}

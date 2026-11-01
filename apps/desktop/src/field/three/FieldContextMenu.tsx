import {
    Fragment,
    useCallback,
    useEffect,
    useState,
    useSyncExternalStore,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTolgee } from "@tolgee/react";
import {
    KEEP_MENU_EVENTS,
    TIMELINE_MENU_CONTENT_CLASS,
} from "@/components/timeline/TimelineRangeMenu";
import type { FieldEditor } from "@/field/editor/fieldEditor";
import type { ActionId } from "@/shortcuts/definitions";
import { getActionLabel, getActionShortcutLabel } from "@/shortcuts/labels";
import {
    actionLabelNow,
    isActionEnabled,
    runAction,
    subscribeToActionHandlers,
} from "@/shortcuts/registry";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import type { FieldMarchers } from "./fieldMarchers";
import { fieldToElement, useFieldViewStore } from "./fieldView";

/**
 * The field's right-click menu (#315). Every entry is a registered action, run
 * through the actions layer, so it does what its shortcut and the command
 * palette do, and is unavailable when they are. It acts on the selection: the
 * editor selects an unselected marcher right-clicked before it opens.
 *
 * - **Ungroup**, first, shown only while a placed shape is selected whole.
 * - **Unset here** and **Unset here and on Pages N–M** (Set vs Following,
 *   #304, #305): timeline mode only, as in the inspector. The second is shown
 *   only while it's offered (some pages follow), with its handler's label
 *   naming the pages.
 * - Arranging the selection: align and distribute, and Swap (two marchers).
 * - Copying positions from the previous or next page, for the selection.
 * - **Select all**, which right-clicking empty field reaches for.
 */
const GROUPS: readonly (readonly ActionId[])[] = [
    ["shapeUngroup"],
    ["timelineUnsetHere", "timelineUnsetHereAndFollowing"],
    [
        "alignHorizontally",
        "alignVertically",
        "evenlyDistributeHorizontally",
        "evenlyDistributeVertically",
        "swapMarchers",
    ],
    ["setSelectedMarchersToPreviousPage", "setSelectedMarchersToNextPage"],
    ["selectAllMarchers"],
];

/** The actions the menu offers, in order. */
export const FIELD_MENU_ACTIONS: readonly ActionId[] = GROUPS.flat();

const UNSET: ReadonlySet<ActionId> = new Set([
    "timelineUnsetHere",
    "timelineUnsetHereAndFollowing",
]);

/** The entries' style, as the timeline's menus */
const ITEM_CLASS =
    "rounded-4 data-[highlighted]:bg-fg-2 flex cursor-default items-center gap-8 px-8 py-6 text-[12px] outline-hidden select-none data-[disabled]:opacity-50";
const SHORTCUT_CLASS = "text-text-subtitle ml-auto pl-16 font-mono text-[11px]";

/** Each action's enabled state and live label, as one string, so a change re-renders. */
const handlerSnapshot = () =>
    FIELD_MENU_ACTIONS.map(
        (id) => `${isActionEnabled(id) ? 1 : 0}${actionLabelNow(id) ?? ""}`,
    ).join("\n");

export default function FieldContextMenu({
    at,
    onClose,
    selectedCount,
    timelineMode,
}: {
    /** Where it opens, in CSS pixels in the field's element; null while closed. */
    at: { x: number; y: number } | null;
    onClose: () => void;
    selectedCount: number;
    /** Whether the show's timeline is loaded (Unset needs it). */
    timelineMode: boolean;
}) {
    const { t } = useTolgee();
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    useSyncExternalStore(subscribeToActionHandlers, handlerSnapshot);
    const open = at !== null;
    // The context-menu key and Shift+F10 also fire the browser's own menu
    useEffect(() => {
        if (!open) return;
        const block = (event: Event) => event.preventDefault();
        document.addEventListener("contextmenu", block, true);
        return () => document.removeEventListener("contextmenu", block, true);
    }, [open]);
    if (!at) return null;

    const shown = (id: ActionId) =>
        id === "shapeUngroup"
            ? isActionEnabled(id)
            : UNSET.has(id)
              ? timelineMode &&
                (id === "timelineUnsetHere" || isActionEnabled(id))
              : true;
    const enabled = (id: ActionId) =>
        isActionEnabled(id) && (id !== "swapMarchers" || selectedCount === 2);
    const groups = GROUPS.map((group) => group.filter(shown)).filter(
        (group) => group.length > 0,
    );

    return (
        <DropdownMenu.Root
            open
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DropdownMenu.Trigger asChild>
                <div
                    data-testid="field-menu-anchor"
                    aria-hidden
                    className="pointer-events-none absolute h-0 w-0"
                    style={{ left: at.x, top: at.y }}
                />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    data-testid="field-menu"
                    align="start"
                    side="bottom"
                    collisionPadding={8}
                    // Focus isn't returned to the anchor, a hidden div: it falls to the page
                    // body. The field keeps the shortcuts' focus (`focussedComponent`), so its
                    // keys still work
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    {...KEEP_MENU_EVENTS}
                    className={TIMELINE_MENU_CONTENT_CLASS}
                >
                    {groups.map((group, i) => (
                        <Fragment key={group[0]}>
                            {i > 0 && (
                                <DropdownMenu.Separator className="bg-stroke mx-4 h-px" />
                            )}
                            {group.map((id) => (
                                <DropdownMenu.Item
                                    key={id}
                                    data-testid={`field-menu-${id}`}
                                    disabled={!enabled(id)}
                                    onSelect={() => runAction(id)}
                                    className={ITEM_CLASS}
                                >
                                    {actionLabelNow(id) ??
                                        getActionLabel(id, (key, params) =>
                                            t(key, params as never),
                                        )}
                                    <Shortcut
                                        keys={getActionShortcutLabel(id, {
                                            overrides,
                                        })}
                                    />
                                </DropdownMenu.Item>
                            ))}
                        </Fragment>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

const Shortcut = ({ keys }: { keys?: string }) =>
    keys ? <span className={SHORTCUT_CLASS}>{keys}</span> : null;

type MenuPoint = { x: number; y: number };

/**
 * Where the field's menu is open, in CSS pixels in the field's element, and
 * how it opens: at a right-click (the editor's `openMenu` port, with
 * `openAt`), or from the keyboard (the `openFieldMenu` action: the
 * context-menu key or Shift+F10, while the field has focus and a selection) at
 * the middle of the selected marchers drawn.
 */
export function useFieldMenu({
    marchers,
    editor,
    hasSelection,
}: {
    marchers: FieldMarchers;
    editor: FieldEditor;
    hasSelection: boolean;
}) {
    const [at, setAt] = useState<MenuPoint | null>(null);
    const openAt = useCallback((point: MenuPoint) => setAt(point), []);
    const close = useCallback(() => setAt(null), []);
    useActionHandler(
        "openFieldMenu",
        () => {
            // Not while the open shape is being edited (a selected placed box is its marchers)
            if (editor.blocksFieldMenu()) return;
            const center = selectedCenter(marchers);
            const view = useFieldViewStore.getState();
            setAt(
                center
                    ? fieldToElement(view, center.x, center.y)
                    : { x: view.width / 2, y: view.height / 2 },
            );
        },
        { enabled: hasSelection },
    );
    return { at, openAt, close };
}

/** The middle of the selected marchers drawn (hidden ones aren't), in field units; null with none. */
function selectedCenter(marchers: FieldMarchers): MenuPoint | null {
    const { selected, hidden, positions } = marchers;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < selected.length; i++) {
        if (!selected[i] || hidden[i]) continue;
        const x = positions[i * 2];
        const y = positions[i * 2 + 1];
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
    }
    return left === Infinity
        ? null
        : { x: (left + right) / 2, y: (top + bottom) / 2 };
}

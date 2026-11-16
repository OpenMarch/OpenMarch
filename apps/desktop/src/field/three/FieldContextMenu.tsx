import {
    Fragment,
    useCallback,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CheckIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import {
    KEEP_MENU_EVENTS,
    TIMELINE_MENU_CONTENT_CLASS,
} from "@/components/timeline/TimelineRangeMenu";
import type { FieldEditor } from "@/field/editor/fieldEditor";
import type { ActionId } from "@/shortcuts/definitions";
import { getActionLabel } from "@/shortcuts/labels";
import Shortcut from "@/components/ui/Shortcut";
import {
    actionLabelNow,
    isActionChecked,
    isActionEnabled,
    previewAction,
    runAction,
    subscribeToActionHandlers,
} from "@/shortcuts/registry";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { useIsTouchMode } from "@/stores/InputModeStore";
import type { FieldMarchers } from "./fieldMarchers";
import { fieldToElement, useFieldViewStore } from "./fieldView";
import {
    MENU_ITEM_CLASS,
    MENU_SEPARATOR_CLASS,
} from "@/components/ui/popupClasses";

/**
 * The field's right-click menu (#315). Every entry is a registered action, run
 * through the actions layer, so it does what its shortcut and the command
 * palette do, and is unavailable when they are. It acts on the selection: the
 * editor selects an unselected marcher right-clicked before it opens.
 *
 * - **Edit <name>**, first, while one item (a prop, front ensemble equipment, a podium) is
 *   selected, as right-clicking one does: it opens the item's edit view.
 * - **Group** or **Ungroup**, each shown only while it's available: Group with two or
 *   more marchers selected that aren't one placed shape (#603), Ungroup with one selected whole.
 *   With one selected whole and the menu opened on one of its marchers, **Select only this
 *   marcher** goes inside it there, as a double-click on that marcher does (tablet 1.5).
 * - The commands that set the selection's state on the current page (holds):
 *   **Hold from last keyframe** (timeline mode only), **Hold from start flag to playhead** while
 *   it's available (Expert with a window, #476), then **Clear this page**. Each says what it
 *   would do for the selection on the current page (`holdEntryStates`, through its handler):
 *   checked and unavailable when every selected marcher is already in the state it sets, and with
 *   a count, "Hold from last keyframe (3 of 5)", when it would change only some of them.
 * - **Hold style** (ADR 0015 D-5, #775), while a selected marcher is Held at the playhead: the
 *   show setting, stand, mark time or high mark time for that hold, the one in effect checked.
 * - Arranging the selection: align and distribute, Swap (two marchers), and **Move to next
 *   page's spots**. That one is a positioning edit, not a page state (owner decision, holds wave
 *   2): on a Held page it moves the whole hold, as a drag does, so it sits with the other edits.
 * - **Select all**, which right-clicking empty field reaches for.
 * - **Edit field**, which puts the canvas into the Edit field mode (#824).
 */
/** The page state commands: the group whose entries can show checked */
const STATE_GROUP: readonly ActionId[] = [
    "timelineHoldFromPrevious",
    "timelineHoldOverWindow",
    "setSelectedMarchersToPreviousPage",
];

/** What the feet do over the Held hold at the playhead: one of them is in effect */
const HOLD_STYLE_GROUP: readonly ActionId[] = [
    "timelineHoldStyleDefault",
    "timelineHoldStyleStand",
    "timelineHoldStyleMarkTime",
    "timelineHoldStyleHighMarkTime",
];

const GROUPS: readonly (readonly ActionId[])[] = [
    // An item right-clicked: its edit view
    ["editSelectedItem"],
    ["shapeGroup", "shapeUngroup", "shapeEnterBox"],
    STATE_GROUP,
    HOLD_STYLE_GROUP,
    [
        "alignHorizontally",
        "alignVertically",
        "evenlyDistributeHorizontally",
        "evenlyDistributeVertically",
        "swapMarchers",
        "setSelectedMarchersToNextPage",
    ],
    ["selectAllMarchers"],
    // #824: the field's own lines and settings, from where you're looking at it
    ["fieldEditMode"],
];

/** The actions the menu offers, in order. */
export const FIELD_MENU_ACTIONS: readonly ActionId[] = GROUPS.flat();

/** Holds, shown only in timeline mode (unavailable where they can't run) */
const HOLDS: ReadonlySet<ActionId> = new Set(["timelineHoldFromPrevious"]);

/** Shown only while available, as Group is: Hold over the window in Expert with a window (#476) */
const WHILE_AVAILABLE: ReadonlySet<ActionId> = new Set([
    "editSelectedItem",
    "shapeGroup",
    "shapeUngroup",
    "shapeEnterBox",
    "timelineHoldOverWindow",
]);

/** Entries about the marcher the menu was opened on: shown only when it was opened on one */
const ON_A_MARCHER: ReadonlySet<ActionId> = new Set(["shapeEnterBox"]);

/** Hold style, shown as a group only while a selected marcher is Held at the playhead */
const HOLD_STYLES: ReadonlySet<ActionId> = new Set(HOLD_STYLE_GROUP);

/** The entries that can show checked: each keeps room for the check, so the words line up */
const CHECKABLE: ReadonlySet<ActionId> = new Set([
    ...STATE_GROUP,
    ...HOLD_STYLE_GROUP,
]);

/** The room for a check in front of a checkable entry's words */
const CHECK_SLOT_CLASS = "flex w-[14px] shrink-0 justify-center";

/** Each action's enabled state and live label, as one string, so a change re-renders. */
const handlerSnapshot = () =>
    FIELD_MENU_ACTIONS.map(
        (id) =>
            `${isActionEnabled(id) ? 1 : 0}${isActionChecked(id) ? 1 : 0}${actionLabelNow(id) ?? ""}`,
    ).join("\n");

/** Closed, the menu shows nothing, so it reads no handler (a label may run a check) */
const closedSnapshot = () => "";

export default function FieldContextMenu({
    at,
    marcher = null,
    onClose,
    selectedCount,
    timelineMode,
}: {
    /** Where it opens, in CSS pixels in the field's element; null while closed. */
    at: { x: number; y: number } | null;
    /** The marcher it was opened on (a right-click or long press on one), or null. */
    marcher?: number | null;
    onClose: () => void;
    selectedCount: number;
    /** Whether the show's timeline is loaded (the holds need it). */
    timelineMode: boolean;
}) {
    const { t } = useTranslate();
    const touch = useIsTouchMode();
    const open = at !== null;
    useSyncExternalStore(
        subscribeToActionHandlers,
        open ? handlerSnapshot : closedSnapshot,
    );
    // The context-menu key and Shift+F10 also fire the browser's own menu
    useEffect(() => {
        if (!open) return;
        const block = (event: Event) => event.preventDefault();
        document.addEventListener("contextmenu", block, true);
        return () => document.removeEventListener("contextmenu", block, true);
    }, [open]);
    // The menu closing takes the entry away without a blur
    useEffect(() => {
        if (!open) return;
        return () =>
            FIELD_MENU_ACTIONS.forEach((id) => previewAction(id, false));
    }, [open]);
    if (!at) return null;

    // The style in effect is checked, so off: the group shows while any of it can run or is
    const holdStyles = HOLD_STYLE_GROUP.some(
        (id) => isActionEnabled(id) || isActionChecked(id),
    );
    const shown = (id: ActionId) =>
        ON_A_MARCHER.has(id) && marcher === null
            ? false
            : HOLD_STYLES.has(id)
              ? holdStyles
              : WHILE_AVAILABLE.has(id)
                ? isActionEnabled(id)
                : HOLDS.has(id)
                  ? timelineMode
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
                    // In the touch layout its entries are taller, so it often fits neither
                    // below nor above the finger, and Radix only flips across that way: beside
                    // the finger it slides up or down to stay on screen (#928). Never taller than
                    // the screen either: it scrolls instead
                    side={touch ? "right" : "bottom"}
                    sideOffset={touch ? 12 : 0}
                    sticky={touch ? "always" : "partial"}
                    collisionPadding={8}
                    // Focus isn't returned to the anchor, a hidden div: it falls to the page
                    // body. The shortcuts listen on the window, so the field's
                    // keys still work
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    {...KEEP_MENU_EVENTS}
                    className={
                        touch
                            ? `${TIMELINE_MENU_CONTENT_CLASS} max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto`
                            : TIMELINE_MENU_CONTENT_CLASS
                    }
                >
                    {groups.map((group, i) => (
                        <Fragment key={group[0]}>
                            {i > 0 && (
                                <DropdownMenu.Separator
                                    className={MENU_SEPARATOR_CLASS}
                                />
                            )}
                            {group.map((id) => {
                                const label =
                                    actionLabelNow(id) ??
                                    getActionLabel(id, (key, params) =>
                                        t(key, params as never),
                                    );
                                const shortcut = (
                                    <span className="ml-auto pl-16">
                                        <Shortcut action={id} />
                                    </span>
                                );
                                if (isActionChecked(id))
                                    return (
                                        <DropdownMenu.CheckboxItem
                                            key={id}
                                            data-testid={`field-menu-${id}`}
                                            checked
                                            disabled
                                            className={MENU_ITEM_CLASS}
                                        >
                                            <span className={CHECK_SLOT_CLASS}>
                                                <DropdownMenu.ItemIndicator className="flex">
                                                    <CheckIcon size={14} />
                                                </DropdownMenu.ItemIndicator>
                                            </span>
                                            {label}
                                            {shortcut}
                                        </DropdownMenu.CheckboxItem>
                                    );
                                return (
                                    <DropdownMenu.Item
                                        key={id}
                                        data-testid={`field-menu-${id}`}
                                        disabled={!enabled(id)}
                                        onSelect={() =>
                                            runAction(
                                                id,
                                                ON_A_MARCHER.has(id) &&
                                                    marcher !== null
                                                    ? { marcherId: marcher }
                                                    : undefined,
                                            )
                                        }
                                        onFocus={() => previewAction(id, true)}
                                        onBlur={() => previewAction(id, false)}
                                        className={MENU_ITEM_CLASS}
                                    >
                                        {CHECKABLE.has(id) && (
                                            <span
                                                className={CHECK_SLOT_CLASS}
                                            />
                                        )}
                                        {label}
                                        {shortcut}
                                    </DropdownMenu.Item>
                                );
                            })}
                        </Fragment>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

type MenuPoint = { x: number; y: number };
/** Where the menu is open, and the marcher it was opened on (null for none, or from the keyboard) */
type OpenFieldMenu = { at: MenuPoint; marcher: number | null };

/**
 * Where the field's menu is open, in CSS pixels in the field's element, and
 * how it opens: at a right-click or a long press (the editor's `openMenu`
 * port, with `openAt`, and the marcher under it), or from the keyboard (the `openFieldMenu` action: the
 * context-menu key or Shift+F10, while the field has focus and a selection) at
 * the middle of the selected marchers drawn. `takePress` is the field's: a press on the field
 * while the menu is open closes it and does nothing more.
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
    const [open, setOpen] = useState<OpenFieldMenu | null>(null);
    // Whether it's open as last drawn, read by the field's presses
    const shown = useRef(false);
    shown.current = open !== null;
    const openAt = useCallback(
        (point: MenuPoint, marcher: number | null = null) =>
            setOpen({ at: point, marcher }),
        [],
    );
    const close = useCallback(() => setOpen(null), []);
    // A press on the field while the menu is open only closes it, as a click outside a menu
    // does (#315). The menu closes itself on a mouse's press outside it, but after a finger's
    // it waits for a click, which the field's touch handling stops (#876)
    const takePress = useCallback(() => {
        if (!shown.current) return false;
        setOpen(null);
        return true;
    }, []);
    useActionHandler(
        "openFieldMenu",
        () => {
            // Not while the open shape is being edited (a selected placed box is its marchers)
            if (editor.blocksFieldMenu()) return;
            const center = selectedCenter(marchers);
            const view = useFieldViewStore.getState();
            setOpen({
                at: center
                    ? fieldToElement(view, center.x, center.y)
                    : { x: view.width / 2, y: view.height / 2 },
                marcher: null,
            });
        },
        { enabled: hasSelection },
    );
    return {
        at: open?.at ?? null,
        marcher: open?.marcher ?? null,
        openAt,
        close,
        takePress,
    };
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

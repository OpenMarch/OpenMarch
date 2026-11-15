import {
    Fragment,
    useCallback,
    useEffect,
    useState,
    useSyncExternalStore,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
    CheckIcon,
    ArrowCounterClockwiseIcon,
    ArrowsLeftRightIcon,
    ArrowsMergeIcon,
    ArrowsSplitIcon,
    ArrowsOutLineHorizontalIcon,
    BezierCurveIcon,
    PencilSimpleIcon,
    TrashIcon,
    type Icon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { useTranslate } from "@tolgee/react";
import {
    KEEP_MENU_EVENTS,
    MenuItemWithReason,
    TIMELINE_MENU_CONTENT_CLASS,
} from "@/components/timeline/TimelineRangeMenu";
import type { FieldEditor } from "@/field/editor/fieldEditor";
import type { ActionId } from "@/shortcuts/definitions";
import { getActionLabel } from "@/shortcuts/labels";
import Shortcut from "@/components/ui/Shortcut";
import {
    actionDisabledReason,
    actionLabelNow,
    hasActionHandler,
    isActionChecked,
    isActionEnabled,
    runAction,
    subscribeToActionHandlers,
} from "@/shortcuts/registry";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import type { FieldMarchers } from "./fieldMarchers";
import { fieldToElement, useFieldViewStore } from "./fieldView";
import {
    MENU_CONTENT_CLASS,
    MENU_ITEM_CLASS,
    MENU_SEPARATOR_CLASS,
} from "@/components/ui/popupClasses";

/**
 * The field's right-click menu (#315). Every entry is a registered action, run
 * through the actions layer, so it does what its shortcut and the command
 * palette do, and is unavailable when they are. It acts on the selection: the
 * editor selects an unselected marcher right-clicked before it opens.
 *
 * - **Group** or **Ungroup**, first, each shown only while it's available: Group with two or
 *   more marchers selected that aren't one placed shape (#603), Ungroup with one selected whole.
 * - The **Path** group (pathways, interaction system rule 4), in the path bar's order: **Edit
 *   group path** (Edit path), **Edit <name>'s line**, **Rejoin group path**, **Match group**,
 *   **Re-fit path** (Re-center group path), then after a line, as under the bar's ···, **Detach
 *   from group path** (some of the group selected; "Detach 3 from group path"), **Detach all N
 *   marchers** (the whole group selected: it ends the group path), each saying what it does under
 *   its name, and **Remove path**. Edit <name>'s line and Match group stay in their places, greyed
 *   out with the reason, for any path but a trail; the others show only while they apply.
 * - The commands that set the selection's state on the current page (holds):
 *   **Hold from previous page** (timeline mode only), then **Clear this page**, with **set to next page** after it. Each says what it would do
 *   for the selection on the current page (`holdEntryStates`, through its handler): checked and
 *   unavailable when every selected marcher is already in the state it sets, and with a count,
 *   "Hold from previous page (3 of 5)", when it would change only some of them.
 * - A line's order (pathways step 4g), with two or more selected: **Set order**, **Reverse order**
 *   and **Clear order**.
 * - Splitting moves (timeline mode, not Basic): **Split selected marchers into a new move** and
 *   **Split the move at the playhead**. An entry that can't run says why beside it (a split at
 *   a count refused while a line follows a trail), before anyone tries it.
 * - Arranging the selection: align and distribute, and Swap (two marchers).
 * - **Select all**, which right-clicking empty field reaches for.
 *
 * A right-click on what a field mode draws can offer its own actions instead (`actions`): on a
 * path's line, the same Path group (pathways), each entry shown only while it applies. That menu
 * is tighter, sized to its words, each entry with its icon, as a shape handle's menu
 * (`HandleMenu`) has.
 */
/** The Path group (pathways), on a marcher and on a path's line: each shown only when it applies */
const PATH: readonly ActionId[] = [
    "editPath",
    "editLine",
    "rejoinPath",
    "adjustResetSpot",
    "reverseTrail",
    "refitPath",
];
/**
 * The Path group's weighty end, kept apart from the routine entries by a line (round 5): Detach
 * (round 6: off the bar, under ···), Detach all, which ends the group path (with the whole group
 * selected), and Remove path
 */
const PATH_END: readonly ActionId[] = [
    "detachPath",
    "detachAllPath",
    "removePath",
];
const PATH_END_SET: ReadonlySet<ActionId> = new Set(PATH_END);
const PATH_SET: ReadonlySet<ActionId> = new Set([...PATH, ...PATH_END]);
/**
 * The path bar's fixed slots (pathways interaction round 2): shown greyed out with their reason
 * where they can't act, so the entries stay in the same places from one marcher to the next. The
 * others show only while they apply: Rejoin, and Detach (off the bar since round 6).
 */
const PATH_SLOTS: ReadonlySet<ActionId> = new Set([
    "editLine",
    "adjustResetSpot",
]);
const pathShown = (id: ActionId) =>
    isActionEnabled(id) ||
    (PATH_SLOTS.has(id) && actionDisabledReason(id) !== undefined);

const GROUPS: readonly (readonly ActionId[])[] = [
    ["shapeGroup", "shapeUngroup"],
    PATH,
    PATH_END,
    [
        "timelineHoldFromPrevious",
        "setSelectedMarchersToPreviousPage",
        "setSelectedMarchersToNextPage",
    ],
    ["splitSelectedIntoNewMove", "timelineSplitMoveAtPlayhead"],
    // A line's order (pathways step 4g), shown with two or more selected
    ["setMarcherOrder", "reverseMarcherOrder", "clearMarcherOrder"],
    [
        "alignHorizontally",
        "alignVertically",
        "evenlyDistributeHorizontally",
        "evenlyDistributeVertically",
        "swapMarchers",
    ],
    ["selectAllMarchers"],
];

/** The actions the menu offers, in order. */
export const FIELD_MENU_ACTIONS: readonly ActionId[] = GROUPS.flat();

/** Holds, shown only in timeline mode (unavailable where they can't run) */
const HOLDS: ReadonlySet<ActionId> = new Set(["timelineHoldFromPrevious"]);

/**
 * Splitting moves (UI-25, UI-27), shown only in timeline mode and only where they're offered at
 * all (not in Basic). Unavailable, each says why beside it, as the timeline's menus do, so a
 * refusal (a line that follows a trail, pathways step 4) is read before it's tried
 */
const MOVES: ReadonlySet<ActionId> = new Set([
    "splitSelectedIntoNewMove",
    "timelineSplitMoveAtPlayhead",
]);

/** A line's order (pathways step 4g): only with a line selected, two or more marchers */
const ORDER: ReadonlySet<ActionId> = new Set([
    "setMarcherOrder",
    "reverseMarcherOrder",
    "clearMarcherOrder",
]);

/** The group whose entries can show checked: each keeps room for the check, so the words line up */
const CHECKABLE: ReadonlySet<ActionId> = new Set(GROUPS[3]);

/** A mode's menu: no wider than its words */
const MODE_CONTENT_CLASS = MENU_CONTENT_CLASS;

/** A mode's entries' icons */
const MODE_ICONS: Partial<Record<ActionId, Icon>> = {
    editPath: PencilSimpleIcon,
    editLine: BezierCurveIcon,
    detachPath: ArrowsSplitIcon,
    detachAllPath: ArrowsSplitIcon,
    rejoinPath: ArrowsMergeIcon,
    adjustResetSpot: ArrowCounterClockwiseIcon,
    refitPath: ArrowsOutLineHorizontalIcon,
    reverseTrail: ArrowsLeftRightIcon,
    removePath: TrashIcon,
};
/** A second line under an entry's name, saying what a weighty one does (its i18n key) */
const NOTES: Partial<Record<ActionId, string>> = {
    detachPath: "pathways.editor.detachNote",
    detachAllPath: "pathways.editor.detachAllNote",
};

/** Entries that delete something: red where highlighted, as a shape handle's Delete */
const DESTRUCTIVE: ReadonlySet<ActionId> = new Set(["removePath"]);

/** The room for a check in front of a checkable entry's words */
const CHECK_SLOT_CLASS = "flex w-[14px] shrink-0 justify-center";

/** Each action's enabled state, live label and reason, as one string, so a change re-renders. */
const handlerSnapshot = () =>
    FIELD_MENU_ACTIONS.map(
        (id) =>
            `${isActionEnabled(id) ? 1 : 0}${isActionChecked(id) ? 1 : 0}${actionLabelNow(id) ?? ""}|${actionDisabledReason(id) ?? ""}`,
    ).join("\n");

/** Closed, the menu shows nothing, so it reads no handler (a label may run a check) */
const closedSnapshot = () => "";

export default function FieldContextMenu({
    at,
    actions = null,
    onClose,
    selectedCount,
    timelineMode,
}: {
    /** Where it opens, in CSS pixels in the field's element; null while closed. */
    at: { x: number; y: number } | null;
    /** The actions it offers instead of the field's own (a mode's, such as a path's), or null */
    actions?: readonly ActionId[] | null;
    onClose: () => void;
    selectedCount: number;
    /** Whether the show's timeline is loaded (the holds need it). */
    timelineMode: boolean;
}) {
    const { t } = useTranslate();
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
    if (!at) return null;

    const shown = (id: ActionId) =>
        PATH_SET.has(id)
            ? pathShown(id)
            : id === "shapeGroup" || id === "shapeUngroup"
              ? isActionEnabled(id)
              : HOLDS.has(id)
                ? timelineMode
                : MOVES.has(id)
                  ? timelineMode && hasActionHandler(id)
                  : ORDER.has(id)
                    ? timelineMode && selectedCount >= 2
                    : true;
    const enabled = (id: ActionId) =>
        isActionEnabled(id) && (id !== "swapMarchers" || selectedCount === 2);
    const groups = (
        actions
            ? // A path's entries show only where they apply, as on a marcher; Detach all and
              // Remove path after a line
              [
                  actions.filter((id) => !PATH_END_SET.has(id)),
                  actions.filter((id) => PATH_END_SET.has(id)),
              ].map((group) =>
                  group.filter((id) => !PATH_SET.has(id) || pathShown(id)),
              )
            : GROUPS.map((group) => group.filter(shown))
    ).filter((group) => group.length > 0);

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
                    // body. The shortcuts listen on the window, so the field's
                    // keys still work
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    {...KEEP_MENU_EVENTS}
                    className={
                        actions
                            ? MODE_CONTENT_CLASS
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
                                // Hidden when the action has no key, so it takes no room
                                const shortcut = (
                                    <span className="ml-auto pl-16 empty:hidden">
                                        <Shortcut action={id} />
                                    </span>
                                );
                                const ModeIcon = actions
                                    ? MODE_ICONS[id]
                                    : null;
                                const note = NOTES[id];
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
                                const reason = enabled(id)
                                    ? null
                                    : (actionDisabledReason(id) ?? null);
                                if (reason !== null)
                                    // Unavailable with a reason: dimmed, the reason behind a
                                    // ?, shown on hover, focus or a press (the timeline's menus)
                                    return (
                                        <MenuItemWithReason
                                            key={id}
                                            testId={`field-menu-${id}`}
                                            reason={reason}
                                            reasonTestId={`field-menu-${id}-reason`}
                                            onSelect={() => runAction(id)}
                                        >
                                            {CHECKABLE.has(id) && (
                                                <span
                                                    className={CHECK_SLOT_CLASS}
                                                />
                                            )}
                                            {label}
                                        </MenuItemWithReason>
                                    );
                                return (
                                    <DropdownMenu.Item
                                        key={id}
                                        data-testid={`field-menu-${id}`}
                                        disabled={!enabled(id)}
                                        onSelect={() => runAction(id)}
                                        className={clsx(
                                            MENU_ITEM_CLASS,
                                            actions &&
                                                DESTRUCTIVE.has(id) &&
                                                "data-[highlighted]:text-red",
                                            note && "items-start",
                                        )}
                                    >
                                        {ModeIcon && (
                                            <ModeIcon
                                                size={14}
                                                aria-hidden
                                                className={clsx(
                                                    "shrink-0",
                                                    note && "mt-2",
                                                )}
                                            />
                                        )}
                                        {CHECKABLE.has(id) && (
                                            <span
                                                className={CHECK_SLOT_CLASS}
                                            />
                                        )}
                                        {note ? (
                                            <span className="flex flex-col">
                                                {label}
                                                <span
                                                    className="text-sub text-text-subtitle"
                                                    data-testid={`field-menu-${id}-note`}
                                                >
                                                    {t(note)}
                                                </span>
                                            </span>
                                        ) : (
                                            label
                                        )}
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
/** Where the menu is open, and the mode's actions it offers there instead of its own, if any */
type OpenFieldMenu = { at: MenuPoint; actions: readonly ActionId[] | null };

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
    const [open, setOpen] = useState<OpenFieldMenu | null>(null);
    const openAt = useCallback(
        (point: MenuPoint, actions?: readonly string[]) =>
            setOpen({
                at: point,
                actions: (actions as readonly ActionId[] | undefined) ?? null,
            }),
        [],
    );
    const close = useCallback(() => setOpen(null), []);
    const setAt = (at: MenuPoint) => setOpen({ at, actions: null });
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
    return {
        at: open?.at ?? null,
        actions: open?.actions ?? null,
        openAt,
        close,
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

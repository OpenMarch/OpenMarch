/**
 * Guards for the timeline's raw window key listeners (G, Shift+Z, Esc), which sit outside the
 * app's shortcut actions and so must check for themselves what owns the key, and the timeline's
 * rules for the shortcut dispatcher (`shortcuts/ShortcutDispatcher.tsx`).
 */

/**
 * A popover, menu or dialog is open: its keys (Esc above all) are its own, and nothing else's.
 * Tooltips share Radix's popper wrapper but take no keys, so a hovered tooltip doesn't count.
 */
export const overlayOpen = () =>
    Array.from(
        document.querySelectorAll("[data-radix-popper-content-wrapper]"),
    ).some((wrapper) => wrapper.querySelector('[role="tooltip"]') === null) ||
    document.querySelector(
        '[role="menu"], [role="dialog"][data-state="open"], [role="alertdialog"]',
    ) !== null;

/** The key goes to a text field */
export const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** Key presses whose default a move control cancelled but whose app shortcut still runs */
const keepsShortcut = new WeakSet<Event>();

/**
 * Whether the app's shortcuts still run a key press whose default was cancelled: Space on a move
 * control (`spaceStaysPlay`). The shortcut dispatcher skips any other cancelled key press.
 */
export const shortcutStillRuns = (event: Event) => keepsShortcut.has(event);

/**
 * Space always plays (docs/timeline/ui.md UI-14, round-2 review): on the move controls (a clip,
 * its ⋯ button, the Move card, the isolation bar) Space doesn't also press the focused button or
 * radio. Its default (a click on key up) is cancelled on key down and key up; the key still goes
 * on to the app's Play shortcut. Text fields keep their Space. For `onKeyDown` and `onKeyUp`.
 */
export const spaceStaysPlay = (event: {
    readonly key: string;
    readonly target: EventTarget | null;
    readonly nativeEvent?: Event;
    preventDefault: () => void;
}) => {
    if (event.key !== " " || isTyping(event.target)) return;
    event.preventDefault();
    if (event.nativeEvent) keepsShortcut.add(event.nativeEvent);
};

/** The WASD nudge keys, by physical key as the app's nudge bindings match them (`shortcuts/definitions.ts`) */
const NUDGE_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);

type KeyFields = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey">;

const isArrow = (event: KeyFields) =>
    event.key.startsWith("Arrow") || event.code.startsWith("Arrow");

/**
 * A key that can be one of the app's nudge shortcuts (the `moveSelectedMarchers*` actions): any
 * arrow, or W, A, S or D by physical key (`event.code`, so another keyboard layout can't slip one
 * past), with any modifier but Cmd.
 */
export const isNudgeKey = (event: KeyFields): boolean =>
    isArrow(event) || (NUDGE_CODES.has(event.code) && !event.metaKey);

/**
 * A nudge key that is nothing else: an arrow, or WASD without Ctrl or Cmd. With Ctrl it is another
 * shortcut (Ctrl+S swaps, Ctrl+A selects all), which a move control lets through.
 */
export const isPlainNudgeKey = (event: KeyFields): boolean =>
    isNudgeKey(event) && (isArrow(event) || !event.ctrlKey);

/** Focus is on a timeline move control: a clip, its ⋯ button or name field, the Move card or the isolation bar */
const onMoveControl = (focused: Element | null) =>
    focused?.closest("[data-timeline-own-keys]") != null;

/**
 * The `data-timeline-own-keys` value for a plain button whose Space presses it too (the keep
 * chain, the inspector's hold line buttons; pre-merge review): Space doesn't play there.
 */
export const OWN_KEYS_WITH_SPACE = "with-space";

const takesSpace = (focused: Element | null) =>
    focused
        ?.closest("[data-timeline-own-keys]")
        ?.getAttribute("data-timeline-own-keys") === OWN_KEYS_WITH_SPACE;

const isPlainSpace = (event: KeyFields) =>
    event.key === " " && !event.ctrlKey && !event.metaKey;

/**
 * Whether a key belongs to the focused timeline move control (UI-14 round-2 review): on a clip,
 * its ⋯ button or name field, the Move card or the isolation bar (`data-timeline-own-keys`),
 * Enter activates the control and the arrows (and WASD) work it or do nothing, as anywhere else on
 * a web page. The app's shortcuts skip these keys there: Enter would create a shape, the arrows
 * and WASD would nudge the selected marchers unseen. Space isn't one: it still plays, except on a
 * button marked `OWN_KEYS_WITH_SPACE`, which Space presses.
 */
export const isTimelineOwnKey = (
    event: KeyFields,
    focused: Element | null,
): boolean =>
    onMoveControl(focused) &&
    (event.key === "Enter" ||
        isPlainNudgeKey(event) ||
        (isPlainSpace(event) && takesSpace(focused)));

/**
 * Whether the app's nudge must skip a key (code review): on a move control no nudge key moves the
 * selected marchers; other shortcuts on the same keys (Ctrl+S, Ctrl+A) still run.
 */
export const skipsAppNudge = (
    event: KeyFields,
    focused: Element | null,
): boolean => onMoveControl(focused) && isNudgeKey(event);

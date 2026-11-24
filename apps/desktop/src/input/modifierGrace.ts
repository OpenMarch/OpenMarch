/**
 * The modifier release grace. People often let go of a modifier a moment before the mouse button,
 * so a drop (or click) that ends within this long of the key coming up still counts the key as
 * held. Long enough for a sloppy two-handed release, short enough that letting go on purpose to
 * cancel the key's effect still works (other web editors pick 150 ms for this race too).
 *
 * Field and shape drags hold a released role inside `startGestureKeys`, so their preview keeps it
 * too. Code that reads a pointer event's own `altKey`/`shiftKey` (the timeline) asks
 * {@link isModifierHeld} instead, which follows the keyboard here.
 */
export const MODIFIER_RELEASE_GRACE_MS = 150;

let graceMs = MODIFIER_RELEASE_GRACE_MS;

/** The grace now: {@link MODIFIER_RELEASE_GRACE_MS} outside tests */
export const modifierReleaseGraceMs = (): number => graceMs;

/**
 * For tests about something else than the grace (a key let go mid-drag redraws at once): 0 turns
 * it off. Call with no argument to put it back.
 */
export function setModifierReleaseGraceForTests(
    ms: number = MODIFIER_RELEASE_GRACE_MS,
): void {
    graceMs = ms;
}

export type ModifierName = "shift" | "alt" | "ctrl" | "meta";

const KEY_NAMES: Readonly<Record<string, ModifierName>> = {
    Shift: "shift",
    Alt: "alt",
    AltGraph: "alt",
    Control: "ctrl",
    Meta: "meta",
};

/** When each modifier last came up, while still inside the grace */
const releasedAt = new Map<ModifierName, number>();
const now = () => performance.now();

function onKeyUp(event: KeyboardEvent) {
    const name = KEY_NAMES[event.key];
    if (name) releasedAt.set(name, now());
}

function onKeyDown(event: KeyboardEvent) {
    const name = KEY_NAMES[event.key];
    if (name) releasedAt.delete(name);
}

/**
 * A new press starts fresh: a key let go just before it belongs to the last gesture, not this one
 * (otherwise Cmd let go right before the next drag would count as held in it).
 */
function forgetReleases() {
    releasedAt.clear();
}

let installed = false;

/** Starts following the keyboard on `window`; safe to call more than once */
export function installModifierGrace(): void {
    if (installed || typeof window === "undefined") return;
    installed = true;
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", forgetReleases, true);
    window.addEventListener("blur", forgetReleases);
}

installModifierGrace();

/** How long ago `name` came up, since the last press; null if it hasn't */
export function releasedAgo(
    name: ModifierName,
    at: number = now(),
): number | null {
    const released = releasedAt.get(name);
    return released === undefined ? null : at - released;
}

/** Whether `name` came up less than the grace ago, since the last press */
export function wasJustReleased(
    name: ModifierName,
    at: number = now(),
    grace: number = graceMs,
): boolean {
    const released = releasedAt.get(name);
    if (released === undefined) return false;
    if (at - released < grace) return true;
    releasedAt.delete(name);
    return false;
}

const EVENT_FLAG = {
    shift: "shiftKey",
    alt: "altKey",
    ctrl: "ctrlKey",
    meta: "metaKey",
} as const satisfies Record<ModifierName, string>;

/**
 * Whether a pointer event counts `name` as held: down on the event, or let go within the grace.
 * Use where a drop or click reads the event's own modifier flag.
 */
export function isModifierHeld(
    event: Partial<Record<(typeof EVENT_FLAG)[ModifierName], boolean>>,
    name: ModifierName,
): boolean {
    return event[EVENT_FLAG[name]] === true || wasJustReleased(name);
}

/** For tests: forget every release */
export function resetModifierGrace(): void {
    releasedAt.clear();
}

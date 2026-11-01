import { vi } from "vitest";

/** What the role tracker listens to on window (`trackHeldKeys`) */
const KEY_EVENTS = new Set(["keydown", "keyup", "blur"]);

/**
 * Counts the key listeners on window (keydown, keyup, blur) added since the call and not removed
 * yet. A gesture that ends and leaves them behind follows the keyboard until the page closes.
 * Call in a test (or `beforeEach`); `vi.restoreAllMocks` undoes it.
 */
export function watchKeyListeners(): () => number {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    return () => {
        const removed = remove.mock.calls.filter(([type]) =>
            KEY_EVENTS.has(type),
        );
        return add.mock.calls.filter(
            ([type, listener]) =>
                KEY_EVENTS.has(type) &&
                !removed.some(([t, l]) => t === type && l === listener),
        ).length;
    };
}

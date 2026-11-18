/**
 * The "open the 3D View with the show" setting as the 3D window sees it, shared by the first-run
 * question (`AutoOpenQuestion.tsx`) and the switch in 3D View settings › Preferences, so an answer
 * in either one shows in both at once.
 *
 * - `loading`: not read yet.
 * - `null`: the window shouldn't offer it (the web builds, Playwright sessions).
 * - `undefined`: never answered. The 3D View opens with a show then, so the switch reads on, and
 *   the question asks.
 * - `true` or `false`: the answer.
 *
 * It is read once per window; a change made in Settings › General while the window is open shows
 * the next time it opens.
 */
import { useSyncExternalStore } from "react";

export type AutoOpenState = "loading" | null | undefined | boolean;

let state: AutoOpenState = "loading";
let started = false;
const listeners = new Set<() => void>();

function setState(next: AutoOpenState) {
    state = next;
    listeners.forEach((listener) => listener());
}

function load() {
    if (started) return;
    started = true;
    const autoOpen = window.view3d?.autoOpen;
    if (!autoOpen) {
        setState(null);
        return;
    }
    autoOpen
        .get()
        .then((value) =>
            setState(
                value === null || value === undefined
                    ? value
                    : typeof value === "boolean"
                      ? value
                      : undefined,
            ),
        )
        .catch((error: unknown) => {
            console.warn("3D View: couldn't read auto-open", error);
            setState(null);
        });
}

function subscribe(listener: () => void) {
    load();
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** The setting, read on first use. */
export function useAutoOpenSetting(): AutoOpenState {
    return useSyncExternalStore(subscribe, () => state);
}

/**
 * Saves an answer. Shown at once; a failed save puts back what the editor has stored, or leaves
 * it unanswered so the question comes back next time.
 */
export function setAutoOpen(keepOpening: boolean) {
    setState(keepOpening);
    window.view3d.autoOpen.set(keepOpening).catch((error: unknown) => {
        console.warn("3D View: couldn't save auto-open", error);
        started = false;
        load();
    });
}

/** For tests: forget what was read. */
export function _resetAutoOpenSetting() {
    state = "loading";
    started = false;
}

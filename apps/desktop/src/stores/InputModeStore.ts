import { create } from "zustand";
import { syncFromStorage } from "@/stores/syncFromStorage";

/**
 * Whether the interface is laid out for fingers or for a mouse.
 *
 * - `"auto"` follows the last press: a finger or a pen switches to touch, a
 *   mouse or trackpad switches back. Before any press it starts from the
 *   device (a coarse primary pointer, e.g. a tablet, starts in touch).
 * - `"touch"` and `"mouse"` pin it.
 *
 * The result is written to `<html data-input="touch|pointer">`, which drives
 * the `touch:` Tailwind variant (`packages/ui/src/tailwind.css`).
 */
export type InputModePreference = "auto" | "touch" | "mouse";
export type InputMode = "touch" | "pointer";
export type PointerKind = "mouse" | "pen" | "touch";

export const INPUT_MODE_STORAGE_KEY = "openmarch:inputMode";

const PREFERENCES: InputModePreference[] = ["auto", "touch", "mouse"];

export const parsePreference = (raw: string | null): InputModePreference =>
    PREFERENCES.includes(raw as InputModePreference)
        ? (raw as InputModePreference)
        : "auto";

/** The mode a preference and the last press resolve to. */
export function resolveInputMode(
    preference: InputModePreference,
    lastPointer: PointerKind | null,
    coarseDevice: boolean,
): InputMode {
    if (preference === "touch") return "touch";
    if (preference === "mouse") return "pointer";
    if (lastPointer === null) return coarseDevice ? "touch" : "pointer";
    return lastPointer === "mouse" ? "pointer" : "touch";
}

interface InputModeState {
    preference: InputModePreference;
    /** The kind of the last press anywhere in the window, or null before any. */
    lastPointer: PointerKind | null;
    /** Whether the device's primary pointer is coarse (a tablet). */
    coarseDevice: boolean;
    mode: InputMode;
    setPreference: (preference: InputModePreference) => void;
    /** Records a press; the tracker calls this. */
    notePointer: (kind: PointerKind) => void;
}

const loadPreference = (): InputModePreference => {
    try {
        return parsePreference(localStorage.getItem(INPUT_MODE_STORAGE_KEY));
    } catch {
        return "auto";
    }
};

const detectCoarse = (): boolean =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

export const useInputModeStore = create<InputModeState>((set, get) => {
    const preference = loadPreference();
    const coarseDevice = detectCoarse();
    return {
        preference,
        lastPointer: null,
        coarseDevice,
        mode: resolveInputMode(preference, null, coarseDevice),
        setPreference: (next) => {
            try {
                localStorage.setItem(INPUT_MODE_STORAGE_KEY, next);
            } catch {
                // Storage may be unavailable (private window); keep it in memory
            }
            const { lastPointer, coarseDevice } = get();
            set({
                preference: next,
                mode: resolveInputMode(next, lastPointer, coarseDevice),
            });
        },
        notePointer: (kind) => {
            const { preference, coarseDevice, lastPointer } = get();
            if (kind === lastPointer) return;
            set({
                lastPointer: kind,
                mode: resolveInputMode(preference, kind, coarseDevice),
            });
        },
    };
});

/** Whether the interface is in touch mode. */
export const useIsTouchMode = () =>
    useInputModeStore((state) => state.mode === "touch");

const applyToDocument = (mode: InputMode) => {
    document.documentElement.dataset.input = mode;
};

/**
 * Starts following presses and keeps `<html data-input>` current. Call once
 * per window; returns the stop.
 *
 * A switch is applied after the press's click, not on pointerdown, so the
 * layout never grows or shrinks under the finger that is still tapping.
 */
export function startInputModeTracking(): () => void {
    const store = useInputModeStore;
    applyToDocument(store.getState().mode);
    const unsubscribe = store.subscribe((state, previous) => {
        if (state.mode !== previous.mode) applyToDocument(state.mode);
    });

    let pending: PointerKind | null = null;
    const onPointerDown = (event: PointerEvent) => {
        const kind = event.pointerType as PointerKind;
        if (kind !== "mouse" && kind !== "pen" && kind !== "touch") return;
        pending = kind;
    };
    const flush = () => {
        if (pending === null) return;
        const kind = pending;
        pending = null;
        // After the click that follows this release has been handled
        setTimeout(() => store.getState().notePointer(kind), 0);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", flush, true);
    window.addEventListener("pointercancel", flush, true);

    const stopSync = syncFromStorage(
        INPUT_MODE_STORAGE_KEY,
        (raw) => parsePreference(raw),
        (preference) => store.getState().setPreference(preference),
    );

    return () => {
        unsubscribe();
        stopSync();
        window.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("pointerup", flush, true);
        window.removeEventListener("pointercancel", flush, true);
    };
}

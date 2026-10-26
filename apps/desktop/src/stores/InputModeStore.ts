import { create } from "zustand";
import { syncFromStorage } from "@/stores/syncFromStorage";

/**
 * Whether the interface is laid out for fingers or for a mouse.
 *
 * - `"auto"` follows the device: touch when its primary pointer is coarse
 *   (a tablet, or a 2-in-1 with its keyboard detached), mouse otherwise. It
 *   changes when the device does (the keyboard cover is attached), never on a
 *   single press, so a touch laptop's layout doesn't jump under the pointer
 *   each time the person reaches for the screen. How each press behaves
 *   (gestures, hit radius) still follows that press's own pointer type.
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

/** The mode a preference and the device resolve to. */
export function resolveInputMode(
    preference: InputModePreference,
    coarseDevice: boolean,
): InputMode {
    if (preference === "touch") return "touch";
    if (preference === "mouse") return "pointer";
    return coarseDevice ? "touch" : "pointer";
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
    /** Records the device's primary pointer changing; the tracker calls this. */
    setCoarseDevice: (coarse: boolean) => void;
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
        mode: resolveInputMode(preference, coarseDevice),
        setPreference: (next) => {
            try {
                localStorage.setItem(INPUT_MODE_STORAGE_KEY, next);
            } catch {
                // Storage may be unavailable (private window); keep it in memory
            }
            set({
                preference: next,
                mode: resolveInputMode(next, get().coarseDevice),
            });
        },
        notePointer: (kind) => {
            if (kind !== get().lastPointer) set({ lastPointer: kind });
        },
        setCoarseDevice: (coarse) => {
            set({
                coarseDevice: coarse,
                mode: resolveInputMode(get().preference, coarse),
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
 * Starts following presses and the device, and keeps `<html data-input>`
 * current. Call once per window; returns the stop.
 */
export function startInputModeTracking(): () => void {
    const store = useInputModeStore;
    applyToDocument(store.getState().mode);
    const unsubscribe = store.subscribe((state, previous) => {
        if (state.mode !== previous.mode) applyToDocument(state.mode);
    });

    const onPointerDown = (event: PointerEvent) => {
        const kind = event.pointerType as PointerKind;
        if (kind === "mouse" || kind === "pen" || kind === "touch")
            store.getState().notePointer(kind);
    };
    window.addEventListener("pointerdown", onPointerDown, true);

    // A 2-in-1 whose keyboard is attached or detached changes its primary pointer
    const coarseQuery =
        typeof window.matchMedia === "function"
            ? window.matchMedia("(pointer: coarse)")
            : null;
    const onDeviceChange = (event: MediaQueryListEvent) =>
        store.getState().setCoarseDevice(event.matches);
    coarseQuery?.addEventListener("change", onDeviceChange);

    const stopSync = syncFromStorage(
        INPUT_MODE_STORAGE_KEY,
        (raw) => parsePreference(raw),
        (preference) => store.getState().setPreference(preference),
    );

    return () => {
        unsubscribe();
        stopSync();
        window.removeEventListener("pointerdown", onPointerDown, true);
        coarseQuery?.removeEventListener("change", onDeviceChange);
    };
}

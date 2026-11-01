import { create } from "zustand";
import { HELD_ROLES, type HeldRole } from "@/input/modifierRoles";

/**
 * The toggles on the touch pill over the field, for a tablet with no keyboard (modifier roles,
 * version A, "Touch and Apple Pencil"): the held roles `fine`, `constrain` (Equal) and
 * `fromCenter`, OR'd into every drag's held keys through `onScreenRoles`, and `add`, the press
 * choice the Select tab reads as Shift through `isShiftHeld`. They're named by role, never by key,
 * so remapping a key doesn't move them.
 *
 * `held` lasts while the button is pressed; `latched` stays on until it is tapped again.
 */
export type TouchToggle = HeldRole | "add";

interface TouchModifierState {
    held: Record<TouchToggle, boolean>;
    latched: Record<TouchToggle, boolean>;
    setHeld: (toggle: TouchToggle, held: boolean) => void;
    toggleLatched: (toggle: TouchToggle) => void;
    /** Lets go of a held toggle, and flips its latch too when `tap`: one change, so a drag re-runs once */
    release: (toggle: TouchToggle, tap: boolean) => void;
    clear: () => void;
}

const none = (): Record<TouchToggle, boolean> => ({
    fine: false,
    constrain: false,
    fromCenter: false,
    add: false,
});

export const useTouchModifierStore = create<TouchModifierState>((set) => ({
    held: none(),
    latched: none(),
    setHeld: (toggle, held) =>
        set((state) => ({ held: { ...state.held, [toggle]: held } })),
    toggleLatched: (toggle) =>
        set((state) => ({
            latched: { ...state.latched, [toggle]: !state.latched[toggle] },
        })),
    release: (toggle, tap) =>
        set((state) => ({
            held: { ...state.held, [toggle]: false },
            latched: tap
                ? { ...state.latched, [toggle]: !state.latched[toggle] }
                : state.latched,
        })),
    clear: () => set({ held: none(), latched: none() }),
}));

/** Whether a toggle is on now, held or latched */
export const isToggleOn = (toggle: TouchToggle): boolean => {
    const { held, latched } = useTouchModifierStore.getState();
    return held[toggle] || latched[toggle];
};

/** The held roles on from the screen now; `startGestureKeys` reads it as `onScreen` */
export const onScreenRoles = (): ReadonlySet<HeldRole> =>
    new Set(HELD_ROLES.filter(isToggleOn));

/** Calls `changed` whenever a toggle changes, so a drag re-runs its last move; returns the stop */
export const subscribeOnScreen = (changed: () => void): (() => void) =>
    useTouchModifierStore.subscribe(changed);

type ModifierEvent = { shiftKey?: boolean } | undefined;

/** Shift from the keyboard, or Add from the screen: adds to the selection */
export const isShiftHeld = (event?: ModifierEvent): boolean =>
    Boolean(event?.shiftKey) || isToggleOn("add");

/** The toggles as the field editor reads them (`FieldEditorOptions.onScreen`) */
export const onScreenToggles = {
    roles: onScreenRoles,
    subscribe: subscribeOnScreen,
    add: (): boolean => isToggleOn("add"),
};

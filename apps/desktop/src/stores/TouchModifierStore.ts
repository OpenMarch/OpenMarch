import { create } from "zustand";

/**
 * Modifier keys held from the screen instead of a keyboard (the floating
 * modifier button on the field in touch mode). Anything that reads
 * `event.shiftKey` / `event.altKey` for an editing rule should read
 * `isShiftHeld(event)` / `isAltHeld(event)` instead, so a tablet without a
 * keyboard reaches the same rule.
 *
 * `held` lasts while the button is pressed; `latched` stays on until it is
 * tapped again.
 */
export type TouchModifier = "shift" | "alt";

interface TouchModifierState {
    held: Record<TouchModifier, boolean>;
    latched: Record<TouchModifier, boolean>;
    setHeld: (modifier: TouchModifier, held: boolean) => void;
    toggleLatched: (modifier: TouchModifier) => void;
    clear: () => void;
}

const none = (): Record<TouchModifier, boolean> => ({
    shift: false,
    alt: false,
});

export const useTouchModifierStore = create<TouchModifierState>((set) => ({
    held: none(),
    latched: none(),
    setHeld: (modifier, held) =>
        set((state) => ({ held: { ...state.held, [modifier]: held } })),
    toggleLatched: (modifier) =>
        set((state) => ({
            latched: { ...state.latched, [modifier]: !state.latched[modifier] },
        })),
    clear: () => set({ held: none(), latched: none() }),
}));

const onScreen = (modifier: TouchModifier): boolean => {
    const { held, latched } = useTouchModifierStore.getState();
    return held[modifier] || latched[modifier];
};

type ModifierEvent = { shiftKey?: boolean; altKey?: boolean } | undefined;

/** Shift from the keyboard or from the on-screen modifier button. */
export const isShiftHeld = (event?: ModifierEvent): boolean =>
    Boolean(event?.shiftKey) || onScreen("shift");

/** Alt (Option) from the keyboard or from the on-screen modifier button. */
export const isAltHeld = (event?: ModifierEvent): boolean =>
    Boolean(event?.altKey) || onScreen("alt");

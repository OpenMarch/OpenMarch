import { create } from "zustand";
import type { GestureContext, Roles } from "./modifierRoles";

export type GestureChipScreen = { readonly x: number; readonly y: number };

/** What `constrain` does in one gesture, as the chip names it */
export type ConstrainWord =
    | "oneAxis"
    | "equalSpacings"
    | "freeRatio"
    | "keepRatio";

/** What `fine` does in one gesture, as the chip names it */
export type FineWord = "fine" | "wholeDegrees";

/**
 * What one drag reads, declared by the gesture (modifier roles, version A): each role it honors
 * with its own word, absent where it ignores the role, and whether it snaps at all, so the Snap
 * toggle off changes it. The chip names only these.
 */
export interface HonoredRoles {
    /** Where the drag happens, for the key each role takes */
    readonly context: GestureContext;
    readonly fine?: FineWord;
    readonly constrain?: ConstrainWord;
    readonly fromCenter?: "fromCenter";
    readonly snaps: boolean;
}

/** Nothing honored: a press that grabbed nothing */
export const HONORS_NOTHING: HonoredRoles = { context: "field", snaps: false };

export type GestureChipState = {
    active: boolean;
    honored: HonoredRoles;
    roles: Roles;
    screen?: GestureChipScreen;
    /** The gesture that showed the chip, so only it follows or clears it */
    owner?: object;
};

interface GestureChipStore extends GestureChipState {
    show: (
        honored: HonoredRoles,
        roles: Roles,
        screen: GestureChipScreen,
        owner?: object,
    ) => void;
    /** The drag's roles and pointer now; the roles keep their identity while they're the same */
    follow: (roles: Roles, screen?: GestureChipScreen) => void;
    /** Hides the chip; with `owner`, only when that gesture showed it */
    clear: (owner?: object) => void;
}

const emptyRoles: Roles = {
    fine: false,
    constrain: false,
    fromCenter: false,
};

const sameRoles = (a: Roles, b: Roles) =>
    a.fine === b.fine &&
    a.constrain === b.constrain &&
    a.fromCenter === b.fromCenter;

export const useGestureChipStore = create<GestureChipStore>((set) => ({
    active: false,
    honored: HONORS_NOTHING,
    roles: emptyRoles,
    show: (honored, roles, screen, owner) =>
        set({ active: true, honored, roles, screen, owner }),
    follow: (roles, screen) =>
        set((state) => ({
            roles: sameRoles(roles, state.roles) ? state.roles : roles,
            screen: screen ?? state.screen,
        })),
    clear: (owner) =>
        set((state) =>
            owner !== undefined && state.owner !== owner
                ? state
                : {
                      active: false,
                      honored: HONORS_NOTHING,
                      roles: emptyRoles,
                      screen: undefined,
                      owner: undefined,
                  },
        ),
}));

import {
    useGestureChipStore,
    type GestureChipScreen,
    type HonoredRoles,
} from "./gestureChipStore";
import type { Roles } from "./modifierRoles";

/**
 * Keeps the field chip in step with a drag's held roles and pointer; the first call shows it.
 * `owner` is the gesture: a chip another gesture showed is replaced, never followed.
 */
export function syncGestureChip(
    honored: HonoredRoles,
    roles: Roles,
    screen: GestureChipScreen | undefined,
    owner?: object,
): void {
    const store = useGestureChipStore.getState();
    if (store.active && store.owner === owner) store.follow(roles, screen);
    else if (screen) store.show(honored, roles, screen, owner);
}

/** Hides the chip; with `owner`, only the chip that gesture showed */
export function clearGestureChip(owner?: object): void {
    useGestureChipStore.getState().clear(owner);
}

/** Whether a role the drag honors is held, so the chip has something to name */
export function holdsHonored(honored: HonoredRoles, roles: Roles): boolean {
    return (
        (roles.fine && honored.fine !== undefined) ||
        (roles.constrain && honored.constrain !== undefined) ||
        (roles.fromCenter && honored.fromCenter !== undefined)
    );
}

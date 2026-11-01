import { isMacPlatform } from "@/shortcuts/platform";
import {
    releaseUsedKeys,
    rolesOf,
    trackHeldKeys,
    type GestureContext,
    type HeldKeys,
    type HeldRole,
    type RoleKey,
    type RoleMap,
    type Roles,
} from "./modifierRoles";

/**
 * The held roles of one gesture, from its press to its release. Keeps the press rule (a key the
 * press used is no role until it's released) and follows keys pressed or released mid-drag, so a
 * gesture only asks `roles()` and re-runs its last move when told to.
 */
export interface GestureKeys {
    /** The held roles now */
    roles(): Roles;
    /** The keys held now */
    keys(): HeldKeys;
    /** Takes the keys a pointer event carries; returns whether the roles changed */
    update(keys: HeldKeys): boolean;
    /** Stops following the keyboard and the on-screen toggles */
    dispose(): void;
}

const sameRoles = (a: Roles, b: Roles) =>
    a.fine === b.fine &&
    a.constrain === b.constrain &&
    a.fromCenter === b.fromCenter;

export function startGestureKeys({
    context,
    press,
    usedByPress = [],
    onScreen,
    onScreenChange,
    onRolesChange,
    track = true,
    map,
    isMac = isMacPlatform(),
}: {
    context: GestureContext;
    /** The keys held at the press (`heldKeysOf` the pointer-down) */
    press: HeldKeys;
    /** The key a press choice used (`pressChoiceOf(...).key`), if any */
    usedByPress?: readonly RoleKey[];
    /** Touch and Pencil toggles, read whenever the roles are */
    onScreen?: () => ReadonlySet<HeldRole>;
    /**
     * Subscribes to the on-screen toggles changing (returns the stop), so latching one mid-drag
     * changes the roles as a keydown does. On-screen toggles never wait on the press rule.
     */
    onScreenChange?: (changed: () => void) => () => void;
    /** Called when a key or on-screen toggle changed mid-drag changes the roles */
    onRolesChange?: (roles: Roles) => void;
    /** Follow `keydown`/`keyup` on window; off for tests and one-shot reads */
    track?: boolean;
    map?: RoleMap;
    isMac?: boolean;
}): GestureKeys {
    let keys = press;
    let used: ReadonlySet<RoleKey> = new Set(usedByPress);
    const roles = () =>
        rolesOf(keys, context, {
            map,
            isMac,
            onScreen: onScreen?.(),
            usedByPress: used,
        });
    let last = roles();
    /** Whether the roles changed since they were last read here */
    const reread = () => {
        const now = roles();
        const changed = !sameRoles(now, last);
        last = now;
        return changed;
    };
    const update = (next: HeldKeys) => {
        keys = next;
        used = releaseUsedKeys(used, keys, isMac);
        return reread();
    };
    const detachKeys = track
        ? trackHeldKeys(
              (next) => {
                  if (update(next)) onRolesChange?.(last);
              },
              () => keys,
          )
        : () => {};
    const detachScreen =
        onScreenChange?.(() => {
            if (reread()) onRolesChange?.(last);
        }) ?? (() => {});
    return {
        roles,
        keys: () => keys,
        update,
        dispose: () => {
            detachKeys();
            detachScreen();
        },
    };
}

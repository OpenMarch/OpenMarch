import { isMacPlatform } from "@/shortcuts/platform";
import { modifierReleaseGraceMs } from "./modifierGrace";
import {
    HELD_ROLES,
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
 *
 * A role turns off only once its key (or on-screen toggle) has been up for the release grace
 * (`MODIFIER_RELEASE_GRACE_MS` in `modifierGrace.ts`): people let go of Shift a moment before the mouse, and that drop
 * should keep Shift. Turning a role on is immediate; holding a role a little longer is the whole
 * cost, so letting go on purpose to cancel it still works, the preview just changes after the grace.
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
    releaseGraceMs = modifierReleaseGraceMs(),
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
    /** How long a released role still counts; 0 turns it off at once */
    releaseGraceMs?: number;
}): GestureKeys {
    let keys = press;
    let used: ReadonlySet<RoleKey> = new Set(usedByPress);
    /** Roles whose key came up and that still count until their timer runs out */
    const graced = new Map<HeldRole, ReturnType<typeof setTimeout>>();
    const actual = () =>
        rolesOf(keys, context, {
            map,
            isMac,
            onScreen: onScreen?.(),
            usedByPress: used,
        });
    const withGrace = (now: Roles): Roles => {
        if (graced.size === 0) return now;
        const out = { ...now };
        for (const role of graced.keys()) out[role] = true;
        return out;
    };
    /** The roles as the keys and toggles have them, before the grace */
    let lastActual = actual();
    /** The roles last reported, with the grace */
    let last = lastActual;
    const roles = () => withGrace(actual());
    const clearGrace = () => {
        for (const timer of graced.values()) clearTimeout(timer);
        graced.clear();
    };
    /** Whether the roles changed since they were last read here */
    const reread = (grace = true) => {
        const now = actual();
        for (const role of HELD_ROLES) {
            const timer = graced.get(role);
            if (now[role]) {
                // Held again (or still): the pending release is off
                if (timer !== undefined) {
                    clearTimeout(timer);
                    graced.delete(role);
                }
            } else if (
                grace &&
                lastActual[role] &&
                timer === undefined &&
                releaseGraceMs > 0
            ) {
                graced.set(
                    role,
                    setTimeout(() => {
                        graced.delete(role);
                        if (reread()) onRolesChange?.(last);
                    }, releaseGraceMs),
                );
            }
        }
        lastActual = now;
        const next = withGrace(now);
        const changed = !sameRoles(next, last);
        last = next;
        return changed;
    };
    const apply = (next: HeldKeys, grace: boolean) => {
        keys = next;
        used = releaseUsedKeys(used, keys, isMac);
        return reread(grace);
    };
    const update = (next: HeldKeys) => apply(next, true);
    const detachKeys = track
        ? trackHeldKeys(
              (next, cause) => {
                  // The window lost focus: no keyup will come, and nothing is being dropped
                  const blurred = cause === "blur";
                  if (blurred) clearGrace();
                  if (apply(next, !blurred)) onRolesChange?.(last);
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
            clearGrace();
        },
    };
}

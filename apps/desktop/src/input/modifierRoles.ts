/**
 * Maps physical modifier keys to what they mean during a gesture. Gestures ask for a role
 * (`fine`, `constrain`, `fromCenter`) or a press choice (`add`, `subtract`, `reachInside`)
 * instead of reading `shiftKey`/`altKey`/… themselves, so the keys are named in one place.
 *
 * Design: docs/timeline/research/shapes/modifier-roles.md (version A). Vocabulary: CONTEXT.md.
 */
import { getModifierLabel } from "@/shortcuts/labels";
import { isMacPlatform } from "@/shortcuts/platform";

/** What a held key means during a drag; read live */
export type HeldRole = "fine" | "constrain" | "fromCenter";

/** What a key means at the press; read once when the pointer goes down */
export type PressChoice = "add" | "subtract" | "reachInside";

/** What a marquee or lasso does with what it covers: add, subtract, or (null) replace the selection */
export type AreaChoice = Extract<PressChoice, "add" | "subtract"> | null;

/** For `pressChoiceOf`'s `applicable`, where reach inside is the only choice a press can make */
export const REACH_INSIDE: ReadonlySet<PressChoice> = new Set(["reachInside"]);

/** Where the gesture happens: the shape tool, or marcher gestures on the field */
export type GestureContext = "shape" | "field";

/** The keys a role can take: never Mac Ctrl (a right-click), never Meta on Windows/Linux */
export type RoleKey = "Shift" | "Alt" | "$mod";

export interface HeldKeys {
    readonly shift: boolean;
    readonly alt: boolean;
    readonly ctrl: boolean;
    readonly meta: boolean;
}

export type Roles = Readonly<Record<HeldRole, boolean>>;

/** Per context, the key for each held role and press choice */
export type RoleMap = Readonly<
    Record<GestureContext, Partial<Record<HeldRole | PressChoice, RoleKey>>>
>;

export const HELD_ROLES: readonly HeldRole[] = [
    "fine",
    "constrain",
    "fromCenter",
];

/** In priority order: when two applicable choices are held, the first wins */
export const PRESS_CHOICES: readonly PressChoice[] = [
    "add",
    "subtract",
    "reachInside",
];

const VERSION_A_CONTEXT = {
    fine: "Shift",
    constrain: "$mod",
    fromCenter: "Alt",
    add: "Shift",
    subtract: "Alt",
    reachInside: "$mod",
} as const satisfies Record<HeldRole | PressChoice, RoleKey>;

/** Shift = fine, $mod = constrain, Alt = from center; at the press Shift adds, Alt subtracts, $mod reaches inside */
export const VERSION_A: RoleMap = {
    shape: VERSION_A_CONTEXT,
    field: VERSION_A_CONTEXT,
};

/**
 * The timeline keeps its own keys, outside the field's roles: Alt = no snap (held) and
 * $mod = draw a range (at the press). Named here so every modifier key is named in one place.
 */
export const TIMELINE_KEYS = {
    noSnap: "Alt",
    range: "$mod",
} as const satisfies Record<string, RoleKey>;

export interface RoleMapConflict {
    readonly context: GestureContext;
    readonly key: RoleKey;
    readonly roles: readonly HeldRole[];
}

/**
 * Two held roles can't share a key within a context, or one key would mean two things mid-drag.
 * Press choices may share a key with a held role; the press rule keeps them apart.
 * Returns the conflicts; empty means the map is valid.
 */
export function validateRoleMap(map: RoleMap): RoleMapConflict[] {
    const conflicts: RoleMapConflict[] = [];
    for (const context of Object.keys(map) as GestureContext[]) {
        const byKey = new Map<RoleKey, HeldRole[]>();
        for (const role of HELD_ROLES) {
            const key = map[context][role];
            if (key !== undefined)
                byKey.set(key, [...(byKey.get(key) ?? []), role]);
        }
        for (const [key, roles] of byKey) {
            if (roles.length > 1) conflicts.push({ context, key, roles });
        }
    }
    return conflicts;
}

export function heldKeysOf(event: {
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
}): HeldKeys {
    return {
        shift: event.shiftKey,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
    };
}

/** Whether a role key is down; $mod is Cmd on a Mac and Ctrl elsewhere */
function isHeld(key: RoleKey, keys: HeldKeys, isMac: boolean): boolean {
    switch (key) {
        case "Shift":
            return keys.shift;
        case "Alt":
            return keys.alt;
        case "$mod":
            return isMac ? keys.meta : keys.ctrl;
    }
}

/** Which held roles are on, for this context, under this map */
export function rolesOf(
    keys: HeldKeys,
    context: GestureContext,
    {
        map = VERSION_A,
        isMac = isMacPlatform(),
        onScreen,
        usedByPress,
    }: {
        map?: RoleMap;
        /** Resolves $mod; defaults to the running platform */
        isMac?: boolean;
        /** Touch and Pencil toggles, OR'd in */
        onScreen?: ReadonlySet<HeldRole>;
        /** Keys the press used; ignored until released (see `releaseUsedKeys`) */
        usedByPress?: ReadonlySet<RoleKey>;
    } = {},
): Roles {
    const roleIsOn = (role: HeldRole) => {
        if (onScreen?.has(role)) return true;
        const key = map[context][role];
        return (
            key !== undefined &&
            !usedByPress?.has(key) &&
            isHeld(key, keys, isMac)
        );
    };
    return {
        fine: roleIsOn("fine"),
        constrain: roleIsOn("constrain"),
        fromCenter: roleIsOn("fromCenter"),
    };
}

/**
 * The press choice for a pointer down, or null. `applicable` lists the choices that make sense for
 * what's under the pointer: a key is used only when its choice applies, so a $mod press on a
 * marcher that isn't in a box stays free for `constrain`. Pass the returned key in `usedByPress`.
 */
export function pressChoiceOf(
    keys: HeldKeys,
    context: GestureContext,
    {
        applicable,
        map = VERSION_A,
        isMac = isMacPlatform(),
    }: {
        applicable: ReadonlySet<PressChoice>;
        map?: RoleMap;
        isMac?: boolean;
    },
): { choice: PressChoice; key: RoleKey } | null {
    for (const choice of PRESS_CHOICES) {
        const key = map[context][choice];
        if (
            key !== undefined &&
            applicable.has(choice) &&
            isHeld(key, keys, isMac)
        ) {
            return { choice, key };
        }
    }
    return null;
}

/** The key for a role or choice here, for hints ("⇧ fine"), tooltips and docs */
export function keyFor(
    roleOrChoice: HeldRole | PressChoice,
    context: GestureContext,
    map: RoleMap = VERSION_A,
): RoleKey | null {
    return map[context][roleOrChoice] ?? null;
}

/** ⇧/⌥/⌘ on a Mac, Shift/Alt/Ctrl elsewhere */
export function keyLabel(
    key: RoleKey,
    isMac: boolean = isMacPlatform(),
): string {
    return getModifierLabel(key, isMac);
}

/**
 * The press rule: a key the press used stops being "used" once it's released, so pressing it
 * again mid-drag turns its held role on. Call on every key change during a gesture.
 */
export function releaseUsedKeys(
    usedByPress: ReadonlySet<RoleKey>,
    keys: HeldKeys,
    isMac: boolean = isMacPlatform(),
): ReadonlySet<RoleKey> {
    return new Set([...usedByPress].filter((key) => isHeld(key, keys, isMac)));
}

export const NO_KEYS: HeldKeys = {
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
};

/**
 * The role tracker: follows the modifier keys on `window` while a gesture runs, so a role key
 * pressed or released mid-drag updates the preview without a pointer move. Calls back when the
 * keys change; a window `blur` clears them all, since the keyup never arrives. `initial` is the
 * keys held when tracking starts (`heldKeysOf` the pointer-down), so releasing the key that began
 * the drag is a change. Returns a detach.
 */
export function trackHeldKeys(
    onChange: (keys: HeldKeys) => void,
    initial: HeldKeys | (() => HeldKeys) = NO_KEYS,
): () => void {
    // A getter lets the caller own the keys, so keys it learns from pointer events count too
    let stored = typeof initial === "function" ? NO_KEYS : initial;
    const current = typeof initial === "function" ? initial : () => stored;
    const report = (next: HeldKeys) => {
        stored = next;
        onChange(next);
    };
    const onKey = (event: KeyboardEvent) => {
        const next = heldKeysOf(event);
        const now = current();
        if (
            next.shift === now.shift &&
            next.alt === now.alt &&
            next.ctrl === now.ctrl &&
            next.meta === now.meta
        ) {
            return;
        }
        report(next);
    };
    const onBlur = () => {
        const now = current();
        if (!now.shift && !now.alt && !now.ctrl && !now.meta) return;
        report(NO_KEYS);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onKey);
        window.removeEventListener("blur", onBlur);
    };
}

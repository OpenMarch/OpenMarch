import {
    matchKeybindingPress,
    parseKeybinding,
    type KeybindingPress,
} from "tinykeys";
import { canonicalBinding, platformBinding, toTinykeys } from "./bindings";
import {
    ACTIONS,
    type ActionDefinition,
    type ActionId,
    type ActionScope,
} from "./definitions";
import { isMacPlatform } from "./platform";

export type ShortcutOverrides = Partial<Record<ActionId, string[]>>;

export interface KeymapEntry {
    id: ActionId;
    binding: string;
    scope: ActionScope;
    allowInInputs: boolean;
    allowInModals: boolean;
}

export interface CompiledEntry extends KeymapEntry {
    press: KeybindingPress;
}

export interface BindingConflict {
    binding: string;
    actionIds: ActionId[];
}

export interface ShortcutContext {
    baseScope: "canvas" | "timeline";
    inTextInput: boolean;
    modalOpen: boolean;
}

export function getEffectiveBindings(
    id: ActionId,
    overrides: ShortcutOverrides = {},
    actions: Record<string, ActionDefinition> = ACTIONS,
): string[] {
    return overrides[id] ?? [...actions[id].defaultBindings];
}

/** Entry bindings have `$mod` resolved for the platform; duplicate bindings of one action collapse. */
export function buildKeymap(
    overrides: ShortcutOverrides = {},
    actions: Record<string, ActionDefinition> = ACTIONS,
    isMac: boolean = isMacPlatform(),
): KeymapEntry[] {
    const entries: KeymapEntry[] = [];
    for (const id of Object.keys(actions) as ActionId[]) {
        const def = actions[id];
        const bindings = new Set(
            getEffectiveBindings(id, overrides, actions).map((binding) =>
                platformBinding(binding, isMac),
            ),
        );
        for (const binding of bindings) {
            entries.push({
                id,
                binding,
                scope: def.scope,
                allowInInputs: def.allowInInputs ?? false,
                allowInModals: def.allowInModals ?? false,
            });
        }
    }
    return entries;
}

function scopesOverlap(a: ActionScope, b: ActionScope): boolean {
    return a === b || a === "global" || b === "global";
}

export function findConflicts(
    overrides: ShortcutOverrides = {},
    actions: Record<string, ActionDefinition> = ACTIONS,
    isMac: boolean = isMacPlatform(),
): BindingConflict[] {
    const byBinding = new Map<string, KeymapEntry[]>();
    for (const entry of buildKeymap(overrides, actions, isMac)) {
        byBinding.set(entry.binding, [
            ...(byBinding.get(entry.binding) ?? []),
            entry,
        ]);
    }
    const conflicts: BindingConflict[] = [];
    for (const [binding, entries] of byBinding) {
        const involved = new Set<ActionId>();
        for (let i = 0; i < entries.length; i++) {
            for (let j = i + 1; j < entries.length; j++) {
                if (entries[i].id === entries[j].id) continue;
                if (scopesOverlap(entries[i].scope, entries[j].scope)) {
                    involved.add(entries[i].id);
                    involved.add(entries[j].id);
                }
            }
        }
        if (involved.size > 0) {
            conflicts.push({
                binding,
                actionIds: entries
                    .map((e) => e.id)
                    .filter(
                        (id, index, all) =>
                            involved.has(id) && all.indexOf(id) === index,
                    ),
            });
        }
    }
    return conflicts;
}

function isValidBinding(binding: string): boolean {
    try {
        canonicalBinding(binding);
        return true;
    } catch {
        return false;
    }
}

function sameBindings(a: readonly string[], b: readonly string[]): boolean {
    return (
        a.length === b.length &&
        a.every(
            (binding, i) =>
                canonicalBinding(binding) === canonicalBinding(b[i]),
        )
    );
}

/** Drops unknown actions, invalid bindings and entries equal to the defaults, so saved overrides only hold real changes. */
export function normalizeOverrides(
    overrides: Record<string, unknown>,
    actions: Record<string, ActionDefinition> = ACTIONS,
): ShortcutOverrides {
    const result: ShortcutOverrides = {};
    for (const [id, bindings] of Object.entries(overrides)) {
        if (!(id in actions) || !Array.isArray(bindings)) continue;
        const valid = bindings.filter(
            (b): b is string => typeof b === "string" && isValidBinding(b),
        );
        if (sameBindings(valid, actions[id].defaultBindings)) continue;
        result[id as ActionId] = valid;
    }
    return result;
}

/** An action's bindings with platform duplicates (e.g. $mod+Z and Control+Z off macOS) shown once. */
export function getDisplayBindings(
    id: ActionId,
    overrides: ShortcutOverrides,
    isMac: boolean,
    actions: Record<string, ActionDefinition> = ACTIONS,
): string[] {
    const seen = new Set<string>();
    return getEffectiveBindings(id, overrides, actions).filter((binding) => {
        const key = platformBinding(binding, isMac);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Other actions in an overlapping scope that already use `binding`. */
export function findBindingOwners(
    id: ActionId,
    binding: string,
    overrides: ShortcutOverrides,
    isMac: boolean,
    actions: Record<string, ActionDefinition> = ACTIONS,
): ActionId[] {
    const target = platformBinding(binding, isMac);
    const owners = buildKeymap(overrides, actions, isMac)
        .filter(
            (entry) =>
                entry.id !== id &&
                entry.binding === target &&
                scopesOverlap(entry.scope, actions[id].scope),
        )
        .map((entry) => entry.id);
    return [...new Set(owners)];
}

export function withoutBinding(
    overrides: ShortcutOverrides,
    id: ActionId,
    binding: string,
    isMac: boolean,
    actions: Record<string, ActionDefinition> = ACTIONS,
): ShortcutOverrides {
    const target = platformBinding(binding, isMac);
    return normalizeOverrides(
        {
            ...overrides,
            [id]: getEffectiveBindings(id, overrides, actions).filter(
                (b) => platformBinding(b, isMac) !== target,
            ),
        },
        actions,
    );
}

/** Adds `binding` to `id`, first removing it from `takeFrom` (the owners the user chose to reassign from). */
export function withBinding(
    overrides: ShortcutOverrides,
    id: ActionId,
    binding: string,
    isMac: boolean,
    takeFrom: readonly ActionId[] = [],
    actions: Record<string, ActionDefinition> = ACTIONS,
): ShortcutOverrides {
    let next = overrides;
    for (const owner of takeFrom) {
        next = withoutBinding(next, owner, binding, isMac, actions);
    }
    const current = getEffectiveBindings(id, next, actions);
    const target = platformBinding(binding, isMac);
    if (current.some((b) => platformBinding(b, isMac) === target)) return next;
    return normalizeOverrides(
        { ...next, [id]: [...current, canonicalBinding(binding)] },
        actions,
    );
}

export function compileKeymap(entries: KeymapEntry[]): CompiledEntry[] {
    const compiled: CompiledEntry[] = [];
    for (const entry of entries) {
        try {
            compiled.push({
                ...entry,
                press: parseKeybinding(toTinykeys(entry.binding))[0],
            });
        } catch (error) {
            console.error(
                `Invalid binding "${entry.binding}" for ${entry.id}`,
                error,
            );
        }
    }
    return compiled;
}

export function pickAction(
    candidates: KeymapEntry[],
    context: ShortcutContext,
    isRunnable: (id: ActionId) => boolean,
): KeymapEntry | undefined {
    const allowed = candidates.filter(
        (c) =>
            (c.scope === "global" || c.scope === context.baseScope) &&
            (!context.inTextInput || c.allowInInputs) &&
            (!context.modalOpen || c.allowInModals) &&
            isRunnable(c.id),
    );
    return allowed.find((c) => c.scope !== "global") ?? allowed[0];
}

export function resolveKeyEvent(
    event: KeyboardEvent,
    compiled: CompiledEntry[],
    context: ShortcutContext,
    isRunnable: (id: ActionId) => boolean,
): KeymapEntry | undefined {
    return pickAction(
        compiled.filter((entry) => matchKeybindingPress(event, entry.press)),
        context,
        isRunnable,
    );
}

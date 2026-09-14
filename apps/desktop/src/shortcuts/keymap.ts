import {
    matchKeybindingPress,
    parseKeybinding,
    type KeybindingPress,
} from "tinykeys";
import { canonicalBinding, toTinykeys } from "./bindings";
import {
    ACTIONS,
    type ActionDefinition,
    type ActionId,
    type ActionScope,
} from "./definitions";

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

export function buildKeymap(
    overrides: ShortcutOverrides = {},
    actions: Record<string, ActionDefinition> = ACTIONS,
): KeymapEntry[] {
    const entries: KeymapEntry[] = [];
    for (const id of Object.keys(actions) as ActionId[]) {
        const def = actions[id];
        for (const binding of getEffectiveBindings(id, overrides, actions)) {
            entries.push({
                id,
                binding: canonicalBinding(binding),
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
): BindingConflict[] {
    const byBinding = new Map<string, KeymapEntry[]>();
    for (const entry of buildKeymap(overrides, actions)) {
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

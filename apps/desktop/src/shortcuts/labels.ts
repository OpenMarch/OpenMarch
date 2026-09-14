import { formatBinding } from "./bindings";
import { getActionDefinition, type ActionId } from "./definitions";
import { getEffectiveBindings, type ShortcutOverrides } from "./keymap";
import { isMacPlatform } from "./platform";

export type Translate = (
    key: string,
    params?: Record<string, string | number>,
) => string;

export function getActionLabel(id: ActionId, t: Translate): string {
    const def = getActionDefinition(id);
    const base = def.labelParams
        ? t(def.labelKey, { ...def.labelParams })
        : t(def.labelKey);
    return def.labelSuffixKey ? `${base} (${t(def.labelSuffixKey)})` : base;
}

export function getActionShortcutLabel(
    id: ActionId,
    {
        overrides,
        isMac = isMacPlatform(),
    }: { overrides?: ShortcutOverrides; isMac?: boolean } = {},
): string | undefined {
    const [first] = getEffectiveBindings(id, overrides);
    return first ? formatBinding(first, isMac) : undefined;
}

export function getActionTooltip(
    id: ActionId,
    t: Translate,
    options: {
        toggleState?: "on" | "off";
        overrides?: ShortcutOverrides;
        isMac?: boolean;
    } = {},
): string {
    const def = getActionDefinition(id);
    const toggleKey =
        options.toggleState === "on"
            ? def.toggleOnKey
            : options.toggleState === "off"
              ? def.toggleOffKey
              : undefined;
    const label = toggleKey ? t(toggleKey) : getActionLabel(id, t);
    const shortcut = getActionShortcutLabel(id, options);
    return shortcut ? `${label} [${shortcut}]` : label;
}

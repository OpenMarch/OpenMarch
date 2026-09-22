import { ACTION_IDS, getActionDefinition, type ActionId } from "../definitions";
import type { ShortcutOverrides } from "../keymap";
import { getActionLabel, getActionShortcutLabel } from "../labels";
import { hasActionHandler, isActionEnabled, runAction } from "../registry";
import type { PaletteContext, PaletteItem } from "./sources";

/** Palette items for every action that has a handler right now and isn't hidden from the palette. */
export function getActionPaletteItems(
    { t }: PaletteContext,
    overrides: ShortcutOverrides,
): PaletteItem[] {
    return ACTION_IDS.filter(
        (id) =>
            !getActionDefinition(id).hiddenFromPalette && hasActionHandler(id),
    ).map((id: ActionId) => {
        const def = getActionDefinition(id);
        return {
            id: `action:${id}`,
            label: getActionLabel(id, t),
            group: t(`settings.shortcuts.category.${def.category}`),
            keywords: def.keywordsKey ? t(def.keywordsKey).split(/\s+/) : [],
            shortcut: getActionShortcutLabel(id, { overrides }),
            disabled: !isActionEnabled(id),
            run: () => runAction(id),
        };
    });
}

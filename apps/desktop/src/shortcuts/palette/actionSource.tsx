import type { Icon } from "@phosphor-icons/react";
import {
    AlignCenterHorizontalIcon,
    ArrowsLeftRightIcon,
    ArrowsOutCardinalIcon,
    ArrowUUpLeftIcon,
    CursorIcon,
    FileIcon,
    GridFourIcon,
    PenNibIcon,
    PlayIcon,
    SelectionAllIcon,
    ShapesIcon,
    SidebarSimpleIcon,
    StackIcon,
    WaveformIcon,
} from "@phosphor-icons/react";
import {
    ACTION_IDS,
    getActionDefinition,
    type ActionCategory,
    type ActionId,
} from "../definitions";
import type { ShortcutOverrides } from "../keymap";
import { getActionLabel, getActionShortcutKeys } from "../labels";
import {
    actionDisabledReason,
    actionLabelNow,
    hasActionHandler,
    isActionEnabled,
    previewAction,
    runAction,
} from "../registry";

import { isBasicMode } from "@/stores/EditorModeStore";
import { paramsCommand } from "./commandBar";
import type { PaletteContext, PaletteItem } from "./sources";

const CATEGORY_ICONS: Record<ActionCategory, Icon> = {
    file: FileIcon,
    edit: ArrowUUpLeftIcon,
    navigation: ArrowsLeftRightIcon,
    playback: PlayIcon,
    movement: ArrowsOutCardinalIcon,
    alignment: AlignCenterHorizontalIcon,
    batchEdit: StackIcon,
    select: SelectionAllIcon,
    cursor: CursorIcon,
    shape: ShapesIcon,
    path: PenNibIcon,
    ui: SidebarSimpleIcon,
    timeline: WaveformIcon,
    field: GridFourIcon,
};

/** Drill-writing tools first; file, playback and app settings after. */
const PALETTE_CATEGORY_ORDER: readonly ActionCategory[] = [
    "cursor",
    "shape",
    "path",
    "alignment",
    "select",
    "batchEdit",
    "navigation",
    "playback",
    "file",
    "edit",
    "timeline",
    "field",
    "movement",
    "ui",
];

/** The most common drill-writing actions, shown in "Suggested" until usage history takes over. */
const SUGGESTED_ACTIONS: readonly ActionId[] = [
    "openExportDialog",
    "alignHorizontally",
    "alignVertically",
    "swapMarchers",
    "exportCoordinateSheets",
    "evenlyDistributeHorizontally",
];

const categoryRank = (id: ActionId) =>
    PALETTE_CATEGORY_ORDER.indexOf(getActionDefinition(id).category);

/**
 * Palette items for every action that has a handler right now and isn't hidden from the palette,
 * nor Expert only in Basic mode.
 */
export function getActionPaletteItems(
    { t }: PaletteContext,
    overrides: ShortcutOverrides,
): PaletteItem[] {
    const basic = isBasicMode();
    return (
        ACTION_IDS.filter((id) => {
            const def = getActionDefinition(id);
            return (
                !def.hiddenFromPalette &&
                !(basic && def.expertOnly) &&
                hasActionHandler(id)
            );
        })
            .sort((a, b) => categoryRank(a) - categoryRank(b))
            .map((id: ActionId) => {
                const def = getActionDefinition(id);
                const CategoryIcon = CATEGORY_ICONS[def.category];
                const label = actionLabelNow(id) ?? getActionLabel(id, t);
                return {
                    id: `action:${id}`,
                    label,
                    group: t(`settings.shortcuts.category.${def.category}`),
                    icon: <CategoryIcon size={18} />,
                    keywords: def.keywordsKey
                        ? t(def.keywordsKey).split(/\s+/)
                        : [],
                    shortcut: getActionShortcutKeys(id, { overrides }),
                    disabled: !isActionEnabled(id),
                    // Why it's off: Preview or Edit music, else the action's own reason
                    disabledReason: actionDisabledReason(id),
                    preview: (on: boolean) => previewAction(id, on),
                    suggestedRank: SUGGESTED_ACTIONS.includes(id)
                        ? SUGGESTED_ACTIONS.indexOf(id)
                        : undefined,
                    // An action with typed params asks them in the docked bar first (#354)
                    ...(def.params
                        ? {
                              command: paramsCommand(
                                  [label],
                                  def.params.map(({ labelKey, ...param }) => ({
                                      ...param,
                                      label: t(labelKey),
                                  })),
                                  (values) => runAction(id, values, "palette"),
                              ),
                          }
                        : {
                              run: () =>
                                  runAction(id, def.paletteArgs, "palette"),
                          }),
                };
            })
            // A command that can't run and can't say why isn't listed: a dimmed row with no reason
            // only leaves you guessing (owner rule, 2026-11-16)
            .filter(
                (item) => !item.disabled || item.disabledReason !== undefined,
            )
    );
}

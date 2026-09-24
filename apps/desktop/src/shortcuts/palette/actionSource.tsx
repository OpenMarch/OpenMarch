import type { Icon } from "@phosphor-icons/react";
import {
    AlignCenterHorizontalIcon,
    ArrowsLeftRightIcon,
    ArrowsOutCardinalIcon,
    ArrowUUpLeftIcon,
    CursorIcon,
    FileIcon,
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
import { getActionLabel, getActionShortcutLabel } from "../labels";
import { hasActionHandler, isActionEnabled, runAction } from "../registry";
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
    ui: SidebarSimpleIcon,
    timeline: WaveformIcon,
};

/** Drill-writing tools first; file, playback and app settings after. */
const PALETTE_CATEGORY_ORDER: readonly ActionCategory[] = [
    "cursor",
    "shape",
    "alignment",
    "select",
    "batchEdit",
    "navigation",
    "playback",
    "file",
    "edit",
    "timeline",
    "movement",
    "ui",
];

/** The most common drill-writing actions, shown in "Suggested" until usage history takes over. */
const SUGGESTED_ACTIONS: readonly ActionId[] = [
    "alignmentEventLine",
    "createCircle",
    "openExportDialog",
    "alignHorizontally",
    "alignVertically",
    "swapMarchers",
    "exportCoordinateSheets",
    "evenlyDistributeHorizontally",
];

const categoryRank = (id: ActionId) =>
    PALETTE_CATEGORY_ORDER.indexOf(getActionDefinition(id).category);

/** Palette items for every action that has a handler right now and isn't hidden from the palette. */
export function getActionPaletteItems(
    { t }: PaletteContext,
    overrides: ShortcutOverrides,
): PaletteItem[] {
    return ACTION_IDS.filter(
        (id) =>
            !getActionDefinition(id).hiddenFromPalette && hasActionHandler(id),
    )
        .sort((a, b) => categoryRank(a) - categoryRank(b))
        .map((id: ActionId) => {
            const def = getActionDefinition(id);
            const CategoryIcon = CATEGORY_ICONS[def.category];
            return {
                id: `action:${id}`,
                label: getActionLabel(id, t),
                group: t(`settings.shortcuts.category.${def.category}`),
                icon: <CategoryIcon size={18} />,
                keywords: def.keywordsKey
                    ? t(def.keywordsKey).split(/\s+/)
                    : [],
                shortcut: getActionShortcutLabel(id, { overrides }),
                disabled: !isActionEnabled(id),
                suggestedRank: SUGGESTED_ACTIONS.includes(id)
                    ? SUGGESTED_ACTIONS.indexOf(id)
                    : undefined,
                run: () => runAction(id),
            };
        });
}

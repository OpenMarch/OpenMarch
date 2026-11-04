import { ShapesIcon } from "@phosphor-icons/react";
import {
    usePaletteSource,
    type PaletteItem,
} from "@/shortcuts/palette/sources";
import { getActionShortcutKeys, type Translate } from "@/shortcuts/labels";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import type { ActionId } from "@/shortcuts/definitions";
import { isActionOffInWorkspace } from "@/shortcuts/workspaceActions";
import { kindPickGate } from "../tool/pickKind";
import { shapeSelectionGate } from "../tool/selectionGate";
import { toolId, type AnyToolKind } from "../tool/toolKind";
import { SHAPE_TOOLS } from "../tool/shapeTools";
import { isShapeShown } from "../tool/shapeToolStore";
import { beginShapeCommand } from "./shapeCommand";
import ShapePreviewIcon from "../preview/ShapePreviewIcon";
import { LAYOUT_FAMILIES, LAYOUT_LABELS } from "../distribute/distribution";

/** The Shape branch's id in the command tree */
export const SHAPE_BRANCH = "shape";

/**
 * The command bar's Shape branch (#354): Shape › Box, one entry per kind, asking the kind's
 * declared parameters. A kind is greyed out with the selection gate's reason when it can't open,
 * or the workspace's when shapes are off there.
 */
export function useShapePaletteSource(
    ready: boolean,
    selected: readonly { readonly id: number }[],
    /** The host's place for the open shape (Place, Enter), which the last answer runs */
    place: () => Promise<void>,
): void {
    usePaletteSource("shapes", ({ t }) => [
        {
            id: SHAPE_BRANCH,
            label: t("commandPalette.shape"),
            group: t("settings.shortcuts.category.shape"),
            icon: <ShapesIcon size={18} />,
            keywords: t("actions.shape.keywords").split(/\s+/),
            children: () => [
                ...SHAPE_TOOLS.map(({ kind, action }) =>
                    kindItem(kind, ready, selected, t, place, action),
                ),
            ],
        },
    ]);
}

function kindItem(
    kind: AnyToolKind,
    ready: boolean,
    selected: readonly { readonly id: number }[],
    t: Translate,
    place: () => Promise<void>,
    /** The kind's own action, whose shortcut the entry shows (#411: B for Shape › Box) */
    action?: ActionId,
): PaletteItem {
    const gate = shapeSelectionGate(selected);
    // With a shape open, any kind can be picked: the open shape turns into it
    const pick = kindPickGate(isShapeShown(), selected);
    // Shapes edit the drill, like the box tool's key: off in Preview
    const offHere = isActionOffInWorkspace("shapeBlock");
    const label = kind.shape.label;
    return {
        id: `${SHAPE_BRANCH}:${toolId(kind)}`,
        label,
        group: t("commandPalette.shape"),
        icon: <ShapePreviewIcon kind={kind} size={18} />,
        keywords: shapeKeywords(kind),
        shortcut: action
            ? getActionShortcutKeys(action, {
                  overrides: useShortcutOverridesStore.getState().overrides,
              })
            : undefined,
        disabled: !ready || offHere || !pick.ok,
        disabledReason: offHere
            ? t("commandPalette.offInPreview")
            : !pick.ok
              ? pick.reason
              : undefined,
        command: {
            begin: () =>
                beginShapeCommand(
                    kind,
                    gate.ok ? gate.ids : [],
                    [t("commandPalette.shape"), label],
                    place,
                ),
        },
    };
}

/**
 * The words the command bar finds a shape by besides its name: its kind's id, a preset's own
 * words instead (the Curve isn't found by "line", #525), and its layouts
 */
export function shapeKeywords(kind: AnyToolKind): string[] {
    const own = kind.preset
        ? [...(kind.keywords ?? [kind.preset])]
        : [kind.shape.id];
    // "stagger" finds Box, whose layout step takes it (#387)
    return [...own, ...layoutKeywords(kind)];
}

/** The names of a kind's layouts, to find it by (the box's Stagger, Rounded …) */
function layoutKeywords(kind: AnyToolKind): string[] {
    if (!kind.closed?.layouts) return [];
    return [
        "layout",
        ...LAYOUT_FAMILIES.map((f) => LAYOUT_LABELS[f].toLowerCase()),
    ];
}

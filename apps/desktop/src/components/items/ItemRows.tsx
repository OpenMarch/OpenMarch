import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    EyeIcon,
    EyeSlashIcon,
    LockSimpleIcon,
    PencilSimpleIcon,
    TrashIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import { Button, Switch } from "@openmarch/ui";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { dbMarcherToMarcher } from "@/global/classes/Marcher";
import { deleteItemsMutationOptions } from "@/hooks/queries/useItems";
import type { getItems } from "@/db-functions/items";

/** An item (a prop or a piece of equipment) with its marchers row */
export type ItemWithMarcher = Awaited<ReturnType<typeof getItems>>[number];

export const drillNumber = (item: ItemWithMarcher) =>
    `${item.marcher.drill_prefix}${item.marcher.drill_order}`;
export const itemLabel = (item: ItemWithMarcher) =>
    item.marcher.name || drillNumber(item);

/**
 * "Show all names" for the items a panel lists: on when each of them shows its name on the field.
 * Turning it on or off sets each listed item's own choice, so the Props panel's switch leaves the
 * front ensemble's names as they are and the other way around.
 */
export function ShowNamesSwitch({
    items,
}: {
    items: readonly ItemWithMarcher[];
}) {
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const nameShown = (id: number) =>
        uiSettings.propNameOverrides[id] ?? uiSettings.showPropNames;
    const allShown = items.every((item) => nameShown(item.id));
    return (
        <label className="text-text/70 text-body flex items-center justify-between px-4 pb-4">
            <T keyName="props.showNames" />
            <Switch
                checked={allShown}
                onCheckedChange={() =>
                    setUiSettings({
                        ...uiSettings,
                        propNameOverrides: {
                            ...uiSettings.propNameOverrides,
                            ...Object.fromEntries(
                                items.map((item) => [item.id, !allShown]),
                            ),
                        },
                    })
                }
            />
        </label>
    );
}

/**
 * One item in a panel's list: a click selects it on the field. Its eye hides or shows it on the
 * field, a lock marks a locked one, and its buttons open its edit view (`onEdit`) or delete it,
 * as one undo step.
 */
export function ItemRow({
    item,
    subtitle,
    editLabel,
    deleteLabel,
    onEdit,
}: {
    item: ItemWithMarcher;
    subtitle: string | null;
    editLabel: string;
    deleteLabel: string;
    onEdit: (item: ItemWithMarcher) => void;
}) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const deleteItems = useMutation(deleteItemsMutationOptions(queryClient));
    const { setSelectedMarchers } = useSelectedMarchers()!;
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const hidden = !!uiSettings.hiddenPropIds[item.id];
    const visibilityLabel = hidden ? t("props.show") : t("props.hide");
    return (
        <div
            className="bg-fg-2 border-stroke hover:bg-fg-3 rounded-6 flex cursor-pointer items-center justify-between border p-12 transition-colors"
            onClick={() =>
                setSelectedMarchers([dbMarcherToMarcher(item.marcher)])
            }
        >
            <div className="flex items-center gap-8">
                <button
                    title={visibilityLabel}
                    aria-label={visibilityLabel}
                    className="text-text/50 hover:text-text shrink-0 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        setUiSettings({
                            ...uiSettings,
                            hiddenPropIds: {
                                ...uiSettings.hiddenPropIds,
                                [item.id]: !hidden,
                            },
                        });
                    }}
                >
                    {hidden ? (
                        <EyeSlashIcon size={16} />
                    ) : (
                        <EyeIcon size={16} />
                    )}
                </button>
                <div className="flex flex-col">
                    <span className="flex items-center gap-4 font-medium">
                        {itemLabel(item)}
                        {item.locked && (
                            <LockSimpleIcon
                                size={12}
                                className="text-text-subtitle"
                                role="img"
                                aria-label={t("props.locked")}
                            >
                                <title>{t("props.locked")}</title>
                            </LockSimpleIcon>
                        )}
                    </span>
                    <span className="text-text/50 text-body">{subtitle}</span>
                </div>
            </div>
            <div className="flex gap-4">
                <Button
                    variant="secondary"
                    size="compact"
                    aria-label={editLabel}
                    title={editLabel}
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit(item);
                    }}
                >
                    <PencilSimpleIcon size={16} />
                </Button>
                <Button
                    variant="red"
                    size="compact"
                    aria-label={deleteLabel}
                    title={deleteLabel}
                    onClick={(e) => {
                        e.stopPropagation();
                        // Undoable, like deleting marchers
                        deleteItems.mutate(new Set([item.marcher_id]));
                    }}
                >
                    <TrashIcon size={16} />
                </Button>
            </div>
        </div>
    );
}

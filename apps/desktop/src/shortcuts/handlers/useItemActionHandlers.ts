import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { allItemsQueryOptions } from "@/hooks/queries/useItems";
import { itemLabel } from "@/components/items/ItemRows";
import { openItemEditor } from "@/components/items/openItemEditor";
import { useActionHandler } from "../useActionHandler";

/**
 * Editing the one selected item (a prop, a piece of front ensemble equipment, a podium): opens its
 * edit view, as its row's edit button does. Right-clicking an item selects it, so the field's menu
 * offers "Edit <its name>" there (owner, 2026-11-15).
 */
export function useItemActionHandlers() {
    const { t } = useTranslate();
    const selected = useSelectedMarchers()?.selectedMarchers ?? [];
    const { data: items } = useQuery(allItemsQueryOptions());
    const item =
        selected.length === 1
            ? items?.find((i) => i.marcher_id === selected[0].id)
            : undefined;
    useActionHandler(
        "editSelectedItem",
        () => {
            if (item) openItemEditor(item);
        },
        {
            enabled: item !== undefined,
            label: item
                ? t("actions.items.editNamed", { name: itemLabel(item) })
                : undefined,
        },
    );
}

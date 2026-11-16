import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { allItemsQueryOptions } from "@/hooks/queries/useItems";
import { itemLabel } from "@/components/items/ItemRows";
import { openItemEditor } from "@/components/items/openItemEditor";
import { useActionHandler } from "../useActionHandler";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { useItemDrawingStore } from "@/stores/ItemDrawingStore";
import { showAssetsQueryOptions } from "@/hooks/queries/useShowAssets";
import { PropListContents } from "@/components/items/PropsModal";
import { importModel } from "@/components/items/modelImport/openModelImport";
import { importedModels } from "@/components/items/modelImport/ImportedModels";
import { showAssetRefValue } from "@/showAssets/ref";

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
    const queryClient = useQueryClient();
    useActionHandler("importModel", () => void importModel());
    useActionHandler("placeImportedModel", (args) => {
        const { setContent, setOpen } = useSidebarModalStore.getState();
        const model = importedModels(
            queryClient.getQueryData(showAssetsQueryOptions().queryKey),
        ).find(
            (asset) =>
                asset.id === args?.id &&
                asset.versionHash === args?.versionHash,
        );
        if (!model) {
            // No model named (the palette): the Props panel, where the Imported group is
            setContent(<PropListContents />, "props");
            setOpen(true);
            return;
        }
        useItemDrawingStore.getState().placeModel({
            modelValue: showAssetRefValue(model),
            footprint: model.sidecar.sizeM,
            baseName: model.name,
        });
        // Close the panel to place it on the field, as front ensemble equipment does
        setOpen(false);
    });
}

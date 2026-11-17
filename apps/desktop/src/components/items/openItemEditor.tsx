import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import {
    FRONT_ENSEMBLE_PANEL_ID,
    FrontEnsembleEditContents,
} from "@/components/frontEnsemble/FrontEnsembleModal";
import { MarcherListContents } from "@/components/marcher/MarchersModal";
import { PropEditContents } from "./PropsModal";
import type { ItemWithMarcher } from "./ItemRows";

/**
 * Opens the sidebar on an item's edit view: front ensemble equipment or a podium in the Marchers
 * panel's front ensemble view (back goes to its list, then to the Marchers panel), a prop in the
 * Props panel. The `editSelectedItem` action, which the field's right-click menu offers.
 */
export function openItemEditor(item: ItemWithMarcher) {
    const { setContent, setOpen } = useSidebarModalStore.getState();
    if (item.kind === "equipment")
        setContent(
            <FrontEnsembleEditContents
                itemId={item.id}
                onBack={() => setContent(<MarcherListContents />, "marchers")}
            />,
            FRONT_ENSEMBLE_PANEL_ID,
        );
    else setContent(<PropEditContents itemId={item.id} />, "props");
    setOpen(true);
}

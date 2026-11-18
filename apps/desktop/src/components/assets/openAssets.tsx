import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { AssetsContents } from "./AssetsView";

/**
 * Opens the Assets view, a view of the Props panel (the `openAssets` action), or with Remove
 * unused… asking at once (`removeUnusedAssets`).
 */
export function showAssetsView({ openRemove = false } = {}) {
    const { setContent, setOpen } = useSidebarModalStore.getState();
    setContent(
        <AssetsContents
            key={openRemove ? "remove" : "view"}
            openRemove={openRemove}
        />,
        "props",
    );
    setOpen(true);
}

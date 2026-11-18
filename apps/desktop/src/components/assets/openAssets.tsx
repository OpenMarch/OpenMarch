import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { AssetsContents } from "./AssetsView";

/**
 * Opens the Assets view, a view of the Props panel (the `openAssets` action), or with Remove
 * unused… asking at once (`removeUnusedAssets`).
 */
let opened = 0;

export function showAssetsView({ openRemove = false } = {}) {
    const { setContent, setOpen } = useSidebarModalStore.getState();
    // A fresh view each time, so asking again opens Remove unused… again
    setContent(
        <AssetsContents key={++opened} openRemove={openRemove} />,
        "props",
    );
    setOpen(true);
}

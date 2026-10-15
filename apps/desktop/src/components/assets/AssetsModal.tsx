/**
 * The Assets tab of the editor's left sidebar (owner decision Q76): the
 * Library browser, Import…, the Artwork templates menu and the show's
 * Credits, viewable at any time. A successful import lands here with the
 * new items highlighted.
 */
import { useEffect, useMemo } from "react";
import { PackageIcon, XIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import ArtworkTemplatesMenu from "@/components/library/ArtworkTemplatesMenu";
import ImportToLibraryButton from "@/components/library/import/ImportToLibraryButton";
import ImportReviewHost from "@/components/library/import/ImportReviewHost";
import type { ImportReviewClient } from "@/components/library/import/importReview";
import LibraryBrowser from "@/components/library/browser/LibraryBrowser";
import {
    editorLibraryApi,
    type LibraryBrowserApi,
} from "@/components/library/browser/libraryItems";
import type { ImportClient } from "@/view3d/library/importClient";
import { useEmbedImportedVersions } from "@/hooks/queries/useShowLibrary";
import { useAssetsStore } from "./assetsStore";
import ShowCredits from "./ShowCredits";

export const ASSETS_CONTENT_ID = "assets";

export default function AssetsModal() {
    const { t } = useTranslate();
    return (
        <SidebarModalLauncher
            contents={<AssetsPanelContents />}
            newContentId={ASSETS_CONTENT_ID}
            buttonLabel={<PackageIcon size={24} />}
            ariaLabel={t("assets.title")}
            testId="assets-tab"
        />
    );
}

/** Opens the sidebar on the Assets tab. */
export function showAssetsPanel() {
    const sidebar = useSidebarModalStore.getState();
    if (sidebar.contentId !== ASSETS_CONTENT_ID) {
        sidebar.setContent(<AssetsPanelContents />, ASSETS_CONTENT_ID);
    }
    sidebar.setOpen(true);
}

export function AssetsPanelContents({
    api,
    importClient,
    templatesClient,
}: {
    /** Tests pass fakes; the editor's IPC by default. */
    api?: LibraryBrowserApi;
    importClient?: ImportReviewClient;
    templatesClient?: Pick<ImportClient, "saveTemplate">;
}) {
    const { setOpen } = useSidebarModalStore();
    const highlight = useAssetsStore((s) => s.highlight);
    const clearHighlight = useAssetsStore((s) => s.clearHighlight);
    const libraryApi = useMemo(() => api ?? editorLibraryApi(), [api]);

    return (
        <div
            className="animate-scale-in text-text flex h-full w-[28rem] flex-col gap-16"
            data-testid="assets-panel"
        >
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">
                    <T keyName="assets.title" />
                </h4>
                <button
                    onClick={() => setOpen(false)}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>
            <div className="flex flex-wrap items-center gap-16">
                <ImportToLibraryButton client={importClient} />
                <ArtworkTemplatesMenu client={templatesClient} />
            </div>
            <ShowCredits />
            <LibraryBrowser
                api={libraryApi}
                highlight={highlight}
                onHighlightDone={clearHighlight}
            />
        </div>
    );
}

/**
 * Always mounted with the editor: renders the running import review (it
 * outlives the panel), opens the Assets tab after a commit and embeds a
 * copy of each import in the open show.
 */
export function AssetsHost() {
    const review = useAssetsStore((s) => s.review);
    const seq = useAssetsStore((s) => s.highlight?.seq ?? null);
    const setOnImported = useAssetsStore((s) => s.setOnImported);
    const { mutate: embedImported } = useEmbedImportedVersions();

    useEffect(() => {
        setOnImported(embedImported);
        return () => setOnImported(null);
    }, [setOnImported, embedImported]);

    useEffect(() => {
        if (seq !== null) showAssetsPanel();
    }, [seq]);

    // Closing the show ends the session.
    useEffect(() => () => review?.getState().close(), [review]);

    return review ? <ImportReviewHost store={review} /> : null;
}

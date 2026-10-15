/**
 * "Import…" in the Assets sidebar tab (package C1.10, owner decision Q76),
 * beside the Artwork templates menu. It opens the file dialog and, once
 * files are picked, the temporary full-window review host, which
 * `AssetsHost` renders from the Assets store.
 *
 * TODO(Visuals mode): the Library side panel's Import… in Visuals mode
 * replaces this button (props-spec.md §12); see `ImportReviewHost`.
 */
import { TrayArrowDownIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import { createImportClient } from "@/view3d/library/importClient";
import { useAssetsStore } from "@/components/assets/assetsStore";
import type { ImportReviewClient } from "./importReview";

let editorClient: ImportReviewClient | undefined;
function defaultClient(): ImportReviewClient {
    editorClient ??= createImportClient();
    return editorClient;
}

export default function ImportToLibraryButton({
    client,
}: {
    /** Defaults to the editor's import client. */
    client?: ImportReviewClient;
}) {
    const reviewing = useAssetsStore((s) => s.review !== null);
    const startImport = useAssetsStore((s) => s.startImport);

    return (
        <button
            type="button"
            onClick={() => startImport(client ?? defaultClient())}
            disabled={reviewing}
            data-testid="import-to-library"
            className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
        >
            <TrayArrowDownIcon size={24} />
            <T keyName="library.import.entry" />
        </button>
    );
}

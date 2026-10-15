/**
 * The Assets panel's This show tab (owner decision Q81): what the open show
 * embeds, which travels with the file, grouped like the Library. Items the
 * local Library lacks offer "Add to my Library"; Library updates are noted,
 * never applied silently. The show's Credits sit below.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { T, useTranslate } from "@tolgee/react";
import {
    CubeIcon,
    ImageIcon,
    PlusIcon,
    TShirtIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { db } from "@/global/database/db";
import { readLibraryBlob } from "@/db-functions/showLibrary";
import { useShowLibrary } from "@/hooks/queries/useShowLibrary";
import { buildAddFromShowRequest } from "@/view3d/library/showLibraryUpdates";
import type { LibraryItemSummary } from "@/view3d/library/protocol";
import type { LibraryApi } from "@/view3d/library/importClient";
import type { LibraryItemKind } from "@om-electron/main/library/types";
import { showAssetGroups, type ShowAssetItem } from "./showAssetGroups";
import ShowCredits from "./ShowCredits";

export type ShowAssetsApi = Pick<
    LibraryApi,
    "list" | "onChanged" | "addFromShow"
>;

const KIND_ICONS: Record<LibraryItemKind, typeof CubeIcon> = {
    model: CubeIcon,
    artwork: ImageIcon,
    uniform: TShirtIcon,
};

/** The local Library's items, or null while unknown; reloads on changes. */
function useLocalLibrary(api: ShowAssetsApi) {
    const [library, setLibrary] = useState<LibraryItemSummary[] | null>(null);
    const load = useCallback(async () => {
        try {
            const result = await api.list({});
            setLibrary(result.ok ? result.value : null);
        } catch {
            setLibrary(null);
        }
    }, [api]);
    useEffect(() => {
        void load();
    }, [load]);
    useEffect(() => api.onChanged(() => void load()), [api, load]);
    return library;
}

export default function ShowAssets({
    api,
    readBlob = (hash) => readLibraryBlob({ db, hash }),
}: {
    api: ShowAssetsApi;
    /** Tests pass a stand-in; the open show's blobs by default. */
    readBlob?: (hash: string) => Promise<Uint8Array | undefined>;
}) {
    const { t } = useTranslate();
    const { data: show } = useShowLibrary();
    const library = useLocalLibrary(api);
    const groups = useMemo(
        () => (show ? showAssetGroups(show, library) : []),
        [show, library],
    );
    const [adding, setAdding] = useState<string | null>(null);

    const add = async (item: ShowAssetItem) => {
        setAdding(item.itemId);
        try {
            const request = await buildAddFromShowRequest({
                item: item.newest,
                readBlob,
            });
            const result = await api.addFromShow(request);
            if (!result.ok) throw new Error(result.error.message);
            toast.success(t("assets.show.added", { name: item.name }));
        } catch (error) {
            console.error(error);
            toast.error(t("assets.show.addFailed", { name: item.name }));
        } finally {
            setAdding(null);
        }
    };

    if (!show) return null;
    return (
        <div
            className="flex min-h-0 flex-1 flex-col gap-16 overflow-y-auto"
            data-testid="show-assets"
        >
            {groups.length === 0 ? (
                <div className="rounded-6 border-stroke text-text-subtitle flex flex-col gap-4 border border-dashed p-16 text-center">
                    <span className="text-body text-text">
                        <T keyName="assets.show.empty" />
                    </span>
                    <span className="text-sub">
                        <T keyName="assets.show.emptyHint" />
                    </span>
                </div>
            ) : (
                groups.map(({ group, items }) => (
                    <section
                        key={group}
                        className="flex flex-col gap-8"
                        data-testid={`show-group-${group}`}
                    >
                        <h6 className="text-body flex items-center gap-8">
                            <T keyName={`library.browser.groups.${group}`} />
                            <span className="text-sub text-text-subtitle font-mono">
                                {items.length}
                            </span>
                        </h6>
                        <ul className="flex flex-col gap-4">
                            {items.map((item) => (
                                <ShowAssetRow
                                    key={item.itemId}
                                    item={item}
                                    adding={adding === item.itemId}
                                    onAdd={() => void add(item)}
                                />
                            ))}
                        </ul>
                    </section>
                ))
            )}
            <ShowCredits />
        </div>
    );
}

function ShowAssetRow({
    item,
    adding,
    onAdd,
}: {
    item: ShowAssetItem;
    adding: boolean;
    onAdd: () => void;
}) {
    const Icon = KIND_ICONS[item.kind];
    return (
        <li
            className="rounded-6 border-stroke bg-fg-2 flex min-w-0 items-center gap-8 border px-8 py-6"
            data-testid="show-item"
            data-item-id={item.itemId}
            title={item.name}
        >
            <Icon size={18} className="text-text-subtitle shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sub truncate">{item.name}</span>
                {item.update && (
                    <span
                        className="text-sub text-text-subtitle"
                        data-testid="show-item-update"
                    >
                        <T
                            keyName={
                                item.update === "version"
                                    ? "assets.show.updateVersion"
                                    : "assets.show.updateDetails"
                            }
                        />
                    </span>
                )}
            </div>
            {item.inLibrary === false && (
                <button
                    type="button"
                    onClick={onAdd}
                    disabled={adding}
                    className="text-sub hover:text-accent flex shrink-0 items-center gap-4 duration-150 ease-out disabled:opacity-50"
                    data-testid="show-item-add"
                >
                    <PlusIcon size={14} />
                    <T keyName="assets.show.addToLibrary" />
                </button>
            )}
        </li>
    );
}

import { useId, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CubeIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import clsx from "clsx";
import {
    showAssetBlobCache,
    showAssetsQueryOptions,
} from "@/hooks/queries/useShowAssets";
import type { ShowAsset } from "@/db-functions/showAssets";
import { runAction } from "@/shortcuts/registry";
import { isModelAsset } from "@/showAssets/libraryModels";
import { showAssetRefValue } from "@/showAssets/ref";
import type { ModelSidecar } from "@/showAssets/modelImport/types";
import { useBytesUrl } from "./ModelImportReview";

const meters = (value: number) => String(Number(value.toFixed(2)));

/** The show's imported models, newest first, with the sidecar each places by */
export function importedModels(
    assets: readonly ShowAsset[] | undefined,
): (ShowAsset & { sidecar: ModelSidecar })[] {
    return (assets ?? []).filter(isModelAsset).reverse();
}

const TILE_CLASS =
    "rounded-6 hover:border-accent/60 focus-visible:outline-accent group flex min-w-0 flex-col gap-4 border border-transparent p-2 text-left outline-hidden duration-150 ease-out focus-visible:outline-2";

/**
 * The Props panel's Imported group (fork #999): Import… first, then each model the show has
 * imported as its picture, name and footprint. Picking one places it with a click on the field,
 * as a prop that moves over time like any other (the `placeImportedModel` action). Tapping works
 * the same: nothing here needs hover.
 */
export default function ImportedModels({
    justImported,
}: {
    /** `items.model` value of a model just added, marked until the panel changes */
    justImported?: string | null;
}) {
    const { t } = useTranslate();
    const { data: assets } = useQuery(showAssetsQueryOptions());
    const models = useMemo(() => importedModels(assets), [assets]);
    return (
        <section
            className="flex flex-col gap-12"
            aria-label={t("props.imported.title")}
            data-testid="imported-models"
        >
            <h5 className="text-text/70 text-sm font-medium">
                <T keyName="props.imported.title" />
            </h5>
            <div className="grid grid-cols-4 gap-6">
                <button
                    type="button"
                    onClick={() => runAction("importModel")}
                    className={TILE_CLASS}
                    data-testid="import-model-tile"
                >
                    <span className="rounded-4 bg-fg-2 border-stroke text-text-subtitle flex aspect-[4/3] items-center justify-center border border-dashed">
                        <UploadSimpleIcon size={24} />
                    </span>
                    <span className="text-sub text-text min-w-0 truncate px-2 leading-tight font-medium">
                        <T keyName="props.imported.import" />
                    </span>
                </button>
                {models.map((asset) => (
                    <ModelTile
                        key={`${asset.id}@${asset.versionHash}`}
                        asset={asset}
                        marked={justImported === showAssetRefValue(asset)}
                    />
                ))}
            </div>
            {models.length === 0 && (
                <p className="text-sub text-text-subtitle">
                    <T keyName="props.imported.empty" />
                </p>
            )}
            <button
                type="button"
                onClick={() => runAction("openAssets")}
                className="text-sub text-accent touch:min-h-44 flex items-center self-start hover:underline"
                data-testid="imported-models-manage"
            >
                <T keyName="props.imported.manage" />
            </button>
        </section>
    );
}

/** An imported model's picture (its `thumbnail` part), or a cube until it has one. */
export function ModelThumbnail({
    hash,
    className,
}: {
    hash: string | undefined;
    className?: string;
}) {
    const { data: thumbnail } = useQuery({
        queryKey: ["show_asset_blob", hash],
        queryFn: async () =>
            (hash ? await showAssetBlobCache.get(hash) : undefined) ?? null,
        enabled: !!hash,
        staleTime: Infinity,
    });
    const url = useBytesUrl(thumbnail ?? undefined, "image/png");
    return (
        <span
            className={clsx(
                "rounded-4 relative flex items-center justify-center overflow-hidden bg-white",
                className,
            )}
        >
            {url ? (
                <img
                    src={url}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-contain"
                />
            ) : (
                <CubeIcon size={24} className="text-text-subtitle" />
            )}
        </span>
    );
}

function ModelTile({
    asset,
    marked,
}: {
    asset: ShowAsset & { sidecar: ModelSidecar };
    marked: boolean;
}) {
    const { t } = useTranslate();
    const footprintId = useId();
    const { width, depth } = asset.sidecar.sizeM;
    return (
        <button
            type="button"
            onClick={() =>
                runAction("placeImportedModel", {
                    id: asset.id,
                    versionHash: asset.versionHash,
                })
            }
            title={t("props.imported.place", { name: asset.name })}
            aria-label={t("props.imported.place", { name: asset.name })}
            aria-describedby={footprintId}
            className={clsx(TILE_CLASS, marked && "border-accent")}
            data-testid="imported-model-tile"
        >
            <ModelThumbnail
                hash={asset.parts.thumbnail}
                className="aspect-[4/3]"
            />
            <span className="text-sub text-text min-w-0 truncate px-2 leading-tight font-medium">
                {asset.name}
            </span>
            <span
                id={footprintId}
                className="text-sub text-text-subtitle min-w-0 truncate px-2 leading-tight tabular-nums"
            >
                {t("frontEnsemble.footprint", {
                    width: meters(width),
                    depth: meters(depth),
                })}
            </span>
        </button>
    );
}

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    CaretRightIcon,
    PackageIcon,
    WarningIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import clsx from "clsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import ItemPanelHeader from "@/components/items/ItemPanelHeader";
import { PropListContents } from "@/components/items/PropsModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { useItemDrawingStore } from "@/stores/ItemDrawingStore";
import { ModelThumbnail } from "@/components/items/modelImport/ImportedModels";
import { CreditFields } from "@/components/items/modelImport/ModelImportReview";
import { allItemsQueryOptions } from "@/hooks/queries/useItems";
import { allCuesQueryOptions } from "@/hooks/queries/useCues";
import {
    removeUnusedShowAssetsMutationOptions,
    setShowAssetCreditsMutationOptions,
    showAssetsQueryOptions,
    showAssetSizesQueryOptions,
} from "@/hooks/queries/useShowAssets";
import {
    LARGE_SHOW_ASSET_BYTES,
    showAssetUse,
    sizeParts,
    type AssetUse,
} from "@/showAssets/assetUse";
import { withoutEmpty } from "@/showAssets/modelImport/review/modelImportSession";
import type { ModelCredits } from "@/showAssets/modelImport/types";
import type { JsonObject } from "@/showAssets/hash";

/**
 * The show's own assets (fork #1001, owner 2026-11-17): every imported model with its picture,
 * size, how many things use it and its credits, and at the top the notes about them. Assets are
 * never removed on their own: Remove unused… lists what it would remove and asks first. A view of
 * the Props panel while models are the only assets; the notes move into the Issues panel once
 * there is one (#599), and the view can become its own tab when flags join it (#985).
 */
/** A size in words: "4.1 MB" */
export function useSizeText() {
    const { t } = useTranslate();
    return (bytes: number) => {
        const { value, unit } = sizeParts(bytes);
        return t(`assets.size.${unit}`, { value });
    };
}

/** The show's assets and who uses them, live */
function useAssetUse() {
    const { data: assets } = useQuery(showAssetsQueryOptions());
    const { data: sizes } = useQuery(showAssetSizesQueryOptions());
    const { data: items } = useQuery(allItemsQueryOptions());
    const { data: cues } = useQuery(allCuesQueryOptions());
    const armed = useItemDrawingStore((state) =>
        state.placing?.kind === "model" ? state.placing.modelValue : null,
    );
    return useMemo(() => {
        if (!assets || !sizes || !items || !cues) return null;
        const use = showAssetUse(assets, sizes, [
            ...items.map((item) => item.model),
            ...cues.map((cue) => cue.value),
            armed,
        ]);
        const known = new Set(use.assets.map((row) => row.value));
        // Props naming a model the show doesn't have: an undo brought one back, say
        const missingProps = items.filter(
            (item) =>
                item.model?.startsWith("library:") && !known.has(item.model),
        ).length;
        return { ...use, missingProps };
    }, [assets, sizes, items, cues, armed]);
}

export function AssetsContents({
    openRemove = false,
}: {
    /** Opens Remove unused… at once (the `removeUnusedAssets` action) */
    openRemove?: boolean;
}) {
    const use = useAssetUse();
    const [removing, setRemoving] = useState(openRemove);
    const { setContent } = useSidebarModalStore();
    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <ItemPanelHeader
                title={<T keyName="assets.title" />}
                onBack={() => setContent(<PropListContents />, "props")}
            />
            <div
                className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto"
                data-testid="assets-view"
            >
                {use && (
                    <AssetNotes
                        unused={use.unused}
                        unusedBytes={use.unusedBytes}
                        totalBytes={use.totalBytes}
                        missingProps={use.missingProps}
                        onRemove={() => setRemoving(true)}
                    />
                )}
                {use && use.assets.length === 0 && (
                    <p className="text-sub text-text-subtitle">
                        <T keyName="assets.empty" />
                    </p>
                )}
                <ul className="flex flex-col gap-8">
                    {use?.assets.map((row) => (
                        <AssetRow key={row.value} row={row} />
                    ))}
                </ul>
            </div>
            {use && (
                <RemoveUnusedDialog
                    open={removing}
                    onOpenChange={setRemoving}
                    unused={use.unused}
                    unusedBytes={use.unusedBytes}
                />
            )}
        </div>
    );
}

/** The quiet notes at the top: unused assets, props whose model is gone, a large show */
function AssetNotes({
    unused,
    unusedBytes,
    totalBytes,
    missingProps,
    onRemove,
}: {
    unused: readonly AssetUse[];
    unusedBytes: number;
    totalBytes: number;
    missingProps: number;
    onRemove: () => void;
}) {
    const sizeText = useSizeText();
    const notes: React.ReactNode[] = [];
    if (unused.length > 0)
        notes.push(
            <li
                key="unused"
                className="flex items-center justify-between gap-12"
                data-testid="assets-unused-note"
            >
                <span>
                    <T
                        keyName="assets.notes.unused"
                        params={{
                            count: unused.length,
                            size: sizeText(unusedBytes),
                        }}
                    />
                </span>
                <Button
                    size="compact"
                    variant="secondary"
                    onClick={onRemove}
                    data-testid="assets-remove-unused"
                >
                    <T keyName="assets.removeUnused.button" />
                </Button>
            </li>,
        );
    if (missingProps > 0)
        notes.push(
            <li key="missing" data-testid="assets-missing-note">
                <T
                    keyName="assets.notes.missing"
                    params={{ count: missingProps }}
                />
            </li>,
        );
    if (totalBytes > LARGE_SHOW_ASSET_BYTES)
        notes.push(
            <li key="large" data-testid="assets-large-note">
                <T
                    keyName="assets.notes.large"
                    params={{ size: sizeText(totalBytes) }}
                />
            </li>,
        );
    if (notes.length === 0) return null;
    return (
        <ul className="bg-fg-2 border-stroke rounded-6 text-sub flex flex-col gap-8 border p-12">
            {notes}
        </ul>
    );
}

/** No license, or one marked unknown: whoever shares the show may not have the right to */
const licenseOf = (credits: JsonObject): string | null => {
    const license =
        typeof credits.license === "string" ? credits.license.trim() : "";
    return license === "" || /^(LicenseRef-)?unknown$/i.test(license)
        ? null
        : license;
};

/** One asset: its picture, name, kind, size and use, and its credits to read or edit */
function AssetRow({ row }: { row: AssetUse }) {
    const { t } = useTranslate();
    const sizeText = useSizeText();
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const { asset } = row;
    const license = licenseOf(asset.credits);
    return (
        <li
            className="border-stroke rounded-6 flex flex-col gap-12 border p-8"
            data-testid="asset-row"
        >
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen(!open)}
                className="flex items-center gap-12 text-left"
            >
                <ModelThumbnail
                    hash={asset.parts.thumbnail}
                    className="h-48 w-64 shrink-0"
                />
                <span className="flex min-w-0 grow flex-col gap-2">
                    <span className="text-body truncate font-medium">
                        {asset.name}
                    </span>
                    <span className="text-sub text-text-subtitle">
                        {[
                            t(`assets.kind.${asset.kind}`, {
                                defaultValue: asset.kind,
                            }),
                            sizeText(row.bytes),
                            row.uses > 0
                                ? t("assets.uses", { count: row.uses })
                                : t("assets.unused"),
                        ].join(" · ")}
                    </span>
                    <span className="text-sub text-text-subtitle flex items-center gap-4">
                        {license ? (
                            license === "LicenseRef-Proprietary" ? (
                                t("props.import.credits.proprietary")
                            ) : (
                                license
                            )
                        ) : (
                            <>
                                <WarningIcon
                                    size={14}
                                    className="text-yellow shrink-0"
                                    aria-hidden
                                />
                                <T keyName="assets.shareNote" />
                            </>
                        )}
                    </span>
                </span>
                <CaretRightIcon
                    size={14}
                    className={clsx(
                        "shrink-0 duration-150",
                        open && "rotate-90",
                    )}
                />
            </button>
            {open && (
                <div id={panelId}>
                    <AssetCredits row={row} />
                </div>
            )}
        </li>
    );
}

/** The credit fields a person edits, text only (a file may have put anything there) */
const textCredits = (credits: JsonObject): ModelCredits => {
    const out: ModelCredits = {};
    for (const key of [
        "license",
        "author",
        "sourceUrl",
        "attribution",
    ] as const)
        if (typeof credits[key] === "string") out[key] = credits[key];
    return out;
};

/** Saves after typing pauses, so each keystroke isn't a write */
const SAVE_AFTER_MS = 600;

/** An asset's credits, editable; they're outside its Version, so it stays the same asset */
function AssetCredits({ row }: { row: AssetUse }) {
    const queryClient = useQueryClient();
    const { mutate } = useMutation(
        setShowAssetCreditsMutationOptions(queryClient),
    );
    const [draft, setDraft] = useState<ModelCredits>(() =>
        textCredits(row.asset.credits),
    );
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pending = useRef<ModelCredits | null>(null);
    const save = (credits: ModelCredits) =>
        mutate({
            ref: row.asset,
            credits: withoutEmpty(credits) as JsonObject,
        });
    // A pending edit is saved when the row closes or the panel goes
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
            if (pending.current) save(pending.current);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the way out
        [],
    );
    return (
        <CreditFields
            credits={draft}
            testIdPrefix="asset"
            startOpen
            onChange={(credits) => {
                setDraft(credits);
                pending.current = credits;
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                    pending.current = null;
                    save(credits);
                }, SAVE_AFTER_MS);
            }}
        />
    );
}

/** Lists every asset Remove unused… would take out, and takes out only those */
function RemoveUnusedDialog({
    open,
    onOpenChange,
    unused,
    unusedBytes,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    unused: readonly AssetUse[];
    unusedBytes: number;
}) {
    const queryClient = useQueryClient();
    const sizeText = useSizeText();
    const { mutate, isPending } = useMutation(
        removeUnusedShowAssetsMutationOptions(queryClient),
    );
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent data-testid="assets-remove-dialog">
                <AlertDialogTitle>
                    <T
                        keyName="assets.removeUnused.title"
                        params={{ count: unused.length }}
                    />
                </AlertDialogTitle>
                <AlertDialogDescription>
                    {unused.length > 0 ? (
                        <T
                            keyName="assets.removeUnused.description"
                            params={{ size: sizeText(unusedBytes) }}
                        />
                    ) : (
                        <T keyName="assets.removeUnused.none" />
                    )}
                </AlertDialogDescription>
                {unused.length > 0 && (
                    <ul
                        className="text-body flex max-h-[16rem] flex-col gap-4 overflow-y-auto"
                        data-testid="assets-remove-list"
                    >
                        {unused.map((row) => (
                            <li
                                key={row.value}
                                className="flex justify-between gap-12"
                            >
                                <span className="truncate">
                                    {row.asset.name}
                                </span>
                                <span className="text-text-subtitle shrink-0">
                                    {sizeText(row.bytes)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="flex w-full justify-end gap-8">
                    <AlertDialogCancel asChild>
                        <Button variant="secondary" disabled={isPending}>
                            <T keyName="assets.removeUnused.cancel" />
                        </Button>
                    </AlertDialogCancel>
                    {unused.length > 0 && (
                        <AlertDialogAction>
                            <Button
                                variant="red"
                                disabled={isPending}
                                data-testid="assets-remove-confirm"
                                onClick={() =>
                                    mutate(
                                        unused.map((row) => row.asset),
                                        {
                                            onSettled: () =>
                                                onOpenChange(false),
                                        },
                                    )
                                }
                            >
                                <T
                                    keyName="assets.removeUnused.confirm"
                                    params={{ count: unused.length }}
                                />
                            </Button>
                        </AlertDialogAction>
                    )}
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}

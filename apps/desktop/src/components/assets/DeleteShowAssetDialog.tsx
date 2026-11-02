/**
 * Deleting the show's copy of a Library item (props-spec.md section 2, [26.10]). While cues use
 * it, the delete is refused: the dialog lists the cues and offers "Replace with…" another item of
 * the same kind and role (a Silk for a Silk), which points them at it as one undoable edit. The
 * show's floor, an item a prop uses, and an item another item pins (a Uniform's Artwork) can't be
 * deleted at all; the dialog lists those uses too. The delete itself isn't undoable, so an item
 * Undo could bring back stays until nothing can. When the local Library has no copy, the dialog
 * says the item will be gone for good and offers to add it to the Library first.
 */
import { useEffect, useState } from "react";
import { sectionDisplayName } from "@/components/marcher/sectionDisplayName";
import { T, useTranslate } from "@tolgee/react";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import {
    isInUse,
    isReplaceable,
    type DeleteShowLibraryItemResult,
    type LibraryCueUse,
    type LibraryItemUses,
} from "@/db-functions/showLibraryDelete";
import type { LibraryRef } from "@/view3d/library/showLibraryPrune";
import type { ShowAssetItem } from "./showAssetGroups";
import { formatList } from "@/utilities/formatList";

/** What the dialog does to the show; the open show's database by default. */
export interface ShowAssetDeletion {
    uses: (itemId: string) => Promise<LibraryItemUses>;
    /** Deletes, first pointing the item's cues at `replaceWith` when given */
    remove: (
        itemId: string,
        replaceWith?: LibraryRef,
    ) => Promise<DeleteShowLibraryItemResult>;
}

/** What happened, once the dialog closes on it */
export interface ShowAssetDeleted {
    item: ShowAssetItem;
    replacedWith: ShowAssetItem | null;
    /** True when Undo could still bring it back, so it stays for now */
    keptForUndo: boolean;
}

export default function DeleteShowAssetDialog({
    item,
    candidates,
    deletion,
    onClose,
    onDeleted,
    onAddToLibrary,
}: {
    /** The item to delete; the dialog is open while it's set */
    item: ShowAssetItem | null;
    /** The show's other items, for "Replace with…" */
    candidates: readonly ShowAssetItem[];
    deletion: ShowAssetDeletion;
    onClose: () => void;
    onDeleted: (result: ShowAssetDeleted) => void;
    /** Adds the item to the local Library; true once it's there */
    onAddToLibrary?: (item: ShowAssetItem) => Promise<boolean>;
}) {
    const [uses, setUses] = useState<LibraryItemUses | null>(null);
    const [addedToLibrary, setAddedToLibrary] = useState(false);
    const [adding, setAdding] = useState(false);
    const [replacement, setReplacement] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setUses(null);
        setReplacement(null);
        setFailed(false);
        setAddedToLibrary(false);
        if (!item) return;
        let live = true;
        deletion.uses(item.itemId).then(
            (found) => live && setUses(found),
            (error: unknown) => {
                console.error(error);
                if (live) setFailed(true);
            },
        );
        return () => {
            live = false;
        };
    }, [item, deletion]);

    // Same kind and role: a Silk is never replaced with a floor or a Uniform part
    const sameKind = item
        ? candidates.filter(
              (c) =>
                  c.kind === item.kind &&
                  c.role === item.role &&
                  c.itemId !== item.itemId,
          )
        : [];
    const inUse = !!uses && isInUse(uses);
    const replaceable = !!uses && isReplaceable(uses);
    const inLibrary = addedToLibrary || item?.inLibrary === true;

    const addToLibrary = async () => {
        if (!item || !onAddToLibrary) return;
        setAdding(true);
        try {
            if (await onAddToLibrary(item)) setAddedToLibrary(true);
        } finally {
            setAdding(false);
        }
    };
    const chosen = sameKind.find((c) => c.itemId === replacement) ?? null;

    const confirmDelete = async () => {
        if (!item) return;
        setBusy(true);
        setFailed(false);
        try {
            const result = await deletion.remove(
                item.itemId,
                chosen ? chosen.newest : undefined,
            );
            if (result.outcome === "inUse") {
                // Something started using it meanwhile: show what
                setUses(result.uses);
            } else {
                onDeleted({
                    item,
                    replacedWith: chosen,
                    keptForUndo: result.outcome === "keptForUndo",
                });
            }
        } catch (error) {
            console.error(error);
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <AlertDialog
            open={item !== null}
            onOpenChange={(open) => !open && !busy && onClose()}
        >
            {item && (
                <AlertDialogContent data-testid="delete-show-asset">
                    <AlertDialogTitle>
                        <T
                            keyName={
                                inUse
                                    ? "assets.show.delete.inUseTitle"
                                    : "assets.show.delete.title"
                            }
                            params={{ name: item.name }}
                        />
                    </AlertDialogTitle>
                    <AlertDialogDescription className="flex flex-col gap-12">
                        {uses === null ? (
                            !failed && (
                                <span className="text-text-subtitle">
                                    <T keyName="assets.show.delete.checking" />
                                </span>
                            )
                        ) : !inUse ? (
                            <span data-testid="delete-show-asset-confirm-text">
                                <T
                                    keyName={
                                        inLibrary
                                            ? "assets.show.delete.confirm"
                                            : item.inLibrary === false
                                              ? "assets.show.delete.confirmNoCopy"
                                              : "assets.show.delete.confirmUnknownCopy"
                                    }
                                />
                            </span>
                        ) : (
                            <InUse
                                uses={uses!}
                                replaceable={replaceable}
                                sameKind={sameKind}
                                replacement={replacement}
                                onReplacement={setReplacement}
                            />
                        )}
                        {failed && (
                            <span className="text-red">
                                <T keyName="assets.show.delete.failed" />
                            </span>
                        )}
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-8">
                        <AlertDialogCancel>
                            <Button variant="secondary" disabled={busy}>
                                <T keyName="assets.show.delete.cancel" />
                            </Button>
                        </AlertDialogCancel>
                        {!inUse &&
                            !inLibrary &&
                            item.inLibrary === false &&
                            onAddToLibrary && (
                                <Button
                                    variant="secondary"
                                    disabled={busy || adding || uses === null}
                                    onClick={() => void addToLibrary()}
                                    data-testid="delete-show-asset-add-to-library"
                                >
                                    <T keyName="assets.show.delete.addFirst" />
                                </Button>
                            )}
                        {(!inUse || replaceable) && (
                            <Button
                                variant="red"
                                disabled={
                                    busy || uses === null || (inUse && !chosen)
                                }
                                onClick={() => void confirmDelete()}
                                data-testid="delete-show-asset-confirm"
                            >
                                <T
                                    keyName={
                                        inUse
                                            ? "assets.show.delete.replaceAndDelete"
                                            : "assets.show.delete.delete"
                                    }
                                />
                            </Button>
                        )}
                    </div>
                </AlertDialogContent>
            )}
        </AlertDialog>
    );
}

function InUse({
    uses,
    replaceable,
    sameKind,
    replacement,
    onReplacement,
}: {
    uses: LibraryItemUses;
    replaceable: boolean;
    sameKind: readonly ShowAssetItem[];
    replacement: string | null;
    onReplacement: (itemId: string) => void;
}) {
    const { t } = useTranslate();
    return (
        <>
            {uses.floor && (
                <span data-testid="delete-show-asset-floor">
                    <T keyName="assets.show.delete.isFloor" />
                </span>
            )}
            {uses.items.length > 0 && (
                <div className="flex flex-col gap-4">
                    <span>
                        <T
                            keyName="assets.show.delete.usedByItems"
                            params={{ count: uses.items.length }}
                        />
                    </span>
                    <ul
                        className="rounded-6 border-stroke text-sub flex max-h-[10rem] flex-col gap-2 overflow-y-auto border px-8 py-6"
                        data-testid="delete-show-asset-item-uses"
                    >
                        {uses.items.map((use) => (
                            <li
                                key={`${use.marcherId}:${use.slot ?? ""}`}
                                className="truncate"
                            >
                                {[
                                    use.label,
                                    use.slot === null
                                        ? t("assets.show.delete.itemModel")
                                        : t("assets.show.delete.itemSlot", {
                                              slot: use.slot,
                                          }),
                                ].join(" · ")}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {uses.pinnedBy.length > 0 && (
                <span data-testid="delete-show-asset-pinned">
                    <T
                        keyName="assets.show.delete.pinnedBy"
                        params={{
                            names: formatList(uses.pinnedBy.map((p) => p.name)),
                        }}
                    />
                </span>
            )}
            {uses.cues.length > 0 && (
                <div className="flex flex-col gap-4">
                    <span>
                        <T
                            keyName={
                                replaceable
                                    ? "assets.show.delete.usedByCues"
                                    : "assets.show.delete.alsoUsedByCues"
                            }
                            params={{ count: uses.cues.length }}
                        />
                    </span>
                    <ul
                        className="rounded-6 border-stroke text-sub flex max-h-[10rem] flex-col gap-2 overflow-y-auto border px-8 py-6"
                        data-testid="delete-show-asset-uses"
                    >
                        {uses.cues.map((use) => (
                            <li key={use.cue.id} className="truncate">
                                {describeUse(use, t)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {replaceable &&
                (sameKind.length === 0 ? (
                    <span className="text-text-subtitle">
                        <T keyName="assets.show.delete.noReplacement" />
                    </span>
                ) : (
                    <Select
                        value={replacement ?? undefined}
                        onValueChange={onReplacement}
                    >
                        <SelectTriggerButton
                            label={
                                sameKind.find((c) => c.itemId === replacement)
                                    ?.name ??
                                t("assets.show.delete.replaceWith")
                            }
                            data-testid="delete-show-asset-replacement"
                        />
                        <SelectContent>
                            {sameKind.map((c) => (
                                <SelectItem key={c.itemId} value={c.itemId}>
                                    {c.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ))}
        </>
    );
}

/** "Silk · Flag · count 12" */
export function describeUse(
    use: LibraryCueUse,
    t: ReturnType<typeof useTranslate>["t"],
): string {
    const { cue } = use;
    const target = cue.target;
    const who =
        target.kind === "band"
            ? t("assets.show.delete.targets.band")
            : target.kind === "section"
              ? sectionDisplayName(target.section, t)
              : target.kind === "tag"
                ? (use.tagName ?? t("assets.show.delete.targets.tag"))
                : t("assets.show.delete.targets.set", {
                      count: target.marcherIds.length,
                  });
    return t("assets.show.delete.useLine", {
        channel: t(`assets.show.delete.channels.${cue.channel}`),
        who,
        count: use.beatIndex,
    });
}

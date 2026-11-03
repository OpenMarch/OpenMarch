/**
 * Deleting the show's copy of a Library item (props-spec.md section 2, [26.10]). The show's floor,
 * an item a prop uses, and an item another item pins (a Uniform's Artwork) can't be deleted; the
 * dialog lists those uses. The delete itself isn't undoable, so an item
 * Undo could bring back stays until nothing can. When the local Library has no copy, the dialog
 * says the item will be gone for good and offers to add it to the Library first.
 */
import { useEffect, useState } from "react";
import { T, useTranslate } from "@tolgee/react";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import {
    isInUse,
    type DeleteShowLibraryItemResult,
    type LibraryItemUses,
} from "@/db-functions/showLibraryDelete";
import type { ShowAssetItem } from "./showAssetGroups";
import { formatList } from "@/utilities/formatList";

/** What the dialog does to the show; the open show's database by default. */
export interface ShowAssetDeletion {
    uses: (itemId: string) => Promise<LibraryItemUses>;
    remove: (itemId: string) => Promise<DeleteShowLibraryItemResult>;
}

/** What happened, once the dialog closes on it */
export interface ShowAssetDeleted {
    item: ShowAssetItem;
    /** True when Undo could still bring it back, so it stays for now */
    keptForUndo: boolean;
}

export default function DeleteShowAssetDialog({
    item,
    deletion,
    onClose,
    onDeleted,
    onAddToLibrary,
}: {
    /** The item to delete; the dialog is open while it's set */
    item: ShowAssetItem | null;
    deletion: ShowAssetDeletion;
    onClose: () => void;
    onDeleted: (result: ShowAssetDeleted) => void;
    /** Adds the item to the local Library; true once it's there */
    onAddToLibrary?: (item: ShowAssetItem) => Promise<boolean>;
}) {
    const [uses, setUses] = useState<LibraryItemUses | null>(null);
    const [addedToLibrary, setAddedToLibrary] = useState(false);
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setUses(null);
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

    const inUse = !!uses && isInUse(uses);
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

    const confirmDelete = async () => {
        if (!item) return;
        setBusy(true);
        setFailed(false);
        try {
            const result = await deletion.remove(item.itemId);
            if (result.outcome === "inUse") {
                // Something started using it meanwhile: show what
                setUses(result.uses);
            } else {
                onDeleted({
                    item,
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
                            <InUse uses={uses!} />
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
                        {!inUse && (
                            <Button
                                variant="red"
                                disabled={busy || uses === null}
                                onClick={() => void confirmDelete()}
                                data-testid="delete-show-asset-confirm"
                            >
                                <T keyName="assets.show.delete.delete" />
                            </Button>
                        )}
                    </div>
                </AlertDialogContent>
            )}
        </AlertDialog>
    );
}

function InUse({ uses }: { uses: LibraryItemUses }) {
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
                            <li key={use.marcherId} className="truncate">
                                {[
                                    use.label,
                                    t("assets.show.delete.itemModel"),
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
        </>
    );
}

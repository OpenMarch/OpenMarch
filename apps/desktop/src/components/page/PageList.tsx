import { useCallback, useEffect, useRef, useState } from "react";
import { ListFormProps } from "../../global/Interfaces";
import Page, {
    deletePages,
    updatePageCountRequest,
    updatePages,
    areEnoughBeatsForPages,
} from "@/global/classes/Page";
import { Check, X, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import {
    Input,
    Button,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@openmarch/ui";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { toast } from "sonner";
import { GroupFunction } from "@/utilities/ApiFunctions";

function PageList({
    hasHeader = false,
    isEditingStateProp = undefined,
    submitActivatorStateProp = undefined,
    cancelActivatorStateProp = undefined,
}: ListFormProps) {
    const [isEditingLocal, setIsEditingLocal] = useState(false);
    const [isEditing, setIsEditing] = isEditingStateProp || [
        isEditingLocal,
        setIsEditingLocal,
    ];
    const [editingPageId, setEditingPageId] = useState<number | null>(null);
    const [submitActivator, setSubmitActivator] = submitActivatorStateProp || [
        false,
        undefined,
    ];
    const [cancelActivator, setCancelActivator] = cancelActivatorStateProp || [
        false,
        undefined,
    ];
    const { pages, fetchTimingObjects, beats } = useTimingObjectsStore();

    // localPages are the Pages that are displayed in the table
    const [localPages, setLocalPages] = useState<Page[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changesRef = useRef<{ [key: number | string]: any }>({});
    const deletionsRef = useRef<number[]>([]);

    async function handleSubmit() {
        const modifiedPages: { id: number; counts: number }[] = [];

        if (deletionsRef.current.length > 0) {
            await deletePages(new Set(deletionsRef.current), async () => {});
        }

        for (const [pageId, changes] of Object.entries(changesRef.current))
            modifiedPages.push({ id: Number(pageId), ...changes });

        if (
            !areEnoughBeatsForPages({
                pages: pages.map((p) => {
                    const modifiedPage = modifiedPages.find(
                        (mp) => mp.id === p.id,
                    );
                    return {
                        counts: parseInt(
                            modifiedPage?.counts.toString() ||
                                p.counts.toString(),
                        ),
                    };
                }),
                beats,
            })
        ) {
            toast.error("You cannot have more counts than beats");
            return;
        }

        const modifiedPagesRequests = modifiedPages.map((page) =>
            updatePageCountRequest({
                pageToUpdate: pages.find((p) => p.id === page.id)!,
                newCounts: page.counts,
                pages,
                beats,
            }),
        );

        const result = await GroupFunction({
            functionsToExecute: modifiedPagesRequests.map(
                (request) => () => updatePages(request, async () => {}),
            ),
            useNextUndoGroup: true,
            refreshFunction: fetchTimingObjects,
        });

        deletionsRef.current = [];
        changesRef.current = {};
        setIsEditing(false);
        setEditingPageId(null);
        return result;
    }

    function handleCancel() {
        setIsEditing(false);
        setEditingPageId(null);
        setLocalPagesModified(pages);
        deletionsRef.current = [];
        changesRef.current = {};
    }

    async function handleDeletePage(pageId: number) {
        const response = await deletePages(
            new Set([pageId]),
            fetchTimingObjects,
        );
        if (response.success) {
            toast.success("Page deleted");
        } else {
            toast.error("Failed to delete page");
        }
    }

    const handleChange = (
        event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
        attribute: string,
        pageId: number,
    ) => {
        // create an entry for the page if it doesn't exist
        if (!changesRef.current[pageId]) changesRef.current[pageId] = {};

        // record the change
        changesRef.current[pageId][attribute] = event.target.value;
    };

    // Set local pages to the pages prop
    const setLocalPagesModified = useCallback((pages: Page[] | undefined) => {
        if (!pages || pages.length === 0) return;
        const pagesCopy = [...pages];
        pagesCopy[0] = {
            ...pagesCopy[0],
            counts: 0,
            name: pagesCopy[0].name,
        };
        setLocalPages(pagesCopy);
    }, []);

    // Update local pages when pages are fetched
    useEffect(() => {
        setLocalPagesModified(pages);
    }, [pages, setLocalPagesModified]);

    // Activate submit with an external activator (like a button in a parent component)
    useEffect(() => {
        if (submitActivator) {
            handleSubmit();
            setSubmitActivator && setSubmitActivator(false);
        }
        // eslint-disable-next-line
    }, [submitActivator, setSubmitActivator]);

    // Activate submit with an external activator (like a button in a parent component)
    useEffect(() => {
        if (cancelActivator) {
            handleCancel();
            setCancelActivator && setCancelActivator(false);
        }
        // eslint-disable-next-line
    }, [cancelActivator, setCancelActivator]);

    return (
        <form
            id={"pageListForm"}
            onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
            }}
            className="text-body text-text flex flex-col gap-16"
        >
            <div className="flex w-full items-center justify-between">
                <p className="text-body text-text">List</p>
            </div>
            <div
                id="table"
                className="flex h-fit w-[27rem] min-w-0 flex-col gap-10"
            >
                {localPages && pages && (
                    <>
                        <div id="key" className="flex items-center gap-4">
                            <div className="w-1/3">
                                <p className="text-sub text-text/90 font-mono">
                                    Page #
                                </p>
                            </div>
                            <div className="w-2/3">
                                <p className="text-sub text-text/90">Counts</p>
                            </div>
                        </div>
                        {localPages.map((page) => (
                            <div
                                data-testid="page-row"
                                key={page.id}
                                className="flex items-center gap-4"
                            >
                                <div className="w-1/3">
                                    <p
                                        className="text-body text-text font-mono"
                                        data-testid="page-name"
                                    >
                                        {page.name}
                                    </p>
                                </div>
                                <div className="flex w-2/3 items-center gap-6">
                                    {editingPageId === page.id ? (
                                        <>
                                            <Input
                                                compact
                                                type="number"
                                                className="form-control"
                                                aria-label="Page counts input"
                                                title="Page counts input"
                                                defaultValue={page.counts}
                                                disabled={
                                                    page.id === pages[0].id
                                                }
                                                key={page.id}
                                                min={0}
                                                step={1}
                                                onChange={(event) =>
                                                    handleChange(
                                                        event,
                                                        "counts",
                                                        page.id,
                                                    )
                                                }
                                            />
                                            <div className="flex-grow" />
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="primary"
                                                    size="compact"
                                                    content="icon"
                                                    onClick={handleSubmit}
                                                >
                                                    <Check size={18} />
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="compact"
                                                    content="icon"
                                                    onClick={handleCancel}
                                                >
                                                    <X size={18} />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger>
                                                        <Button
                                                            variant="red"
                                                            size="compact"
                                                            content="icon"
                                                            disabled={
                                                                page.id ===
                                                                pages[0].id
                                                            }
                                                        >
                                                            <TrashIcon
                                                                size={18}
                                                            />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogTitle>
                                                            Are you sure?
                                                        </AlertDialogTitle>
                                                        <div className="flex flex-col items-center justify-center gap-8 align-middle">
                                                            <AlertDialogAction>
                                                                <Button
                                                                    variant="red"
                                                                    className="w-full"
                                                                    onClick={() =>
                                                                        handleDeletePage(
                                                                            page.id,
                                                                        )
                                                                    }
                                                                >
                                                                    Delete Page{" "}
                                                                    {page.name}
                                                                </Button>
                                                            </AlertDialogAction>
                                                            <div className="text-sub text-text-subtitle">
                                                                This action is
                                                                undoable with
                                                                Ctrl + Z
                                                            </div>
                                                            <AlertDialogCancel
                                                                asChild
                                                            >
                                                                <Button
                                                                    variant="secondary"
                                                                    // disabled={
                                                                    //     isDeleting
                                                                    // }
                                                                    className="w-full"
                                                                >
                                                                    Cancel
                                                                </Button>
                                                            </AlertDialogCancel>
                                                        </div>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <p
                                                className="text-body text-text"
                                                data-testid="page-counts"
                                            >
                                                {page.counts}
                                            </p>
                                            <div className="flex-grow" />
                                            <button
                                                className="hover:text-accent"
                                                hidden={page.id === pages[0].id}
                                                onClick={() =>
                                                    setEditingPageId(page.id)
                                                }
                                            >
                                                <PencilSimpleIcon size={18} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </form>
    );
}

export default PageList;

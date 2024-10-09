import { useCallback, useEffect, useRef, useState } from "react";
import FormButtons from "../FormButtons";
import { ListFormProps } from "../../global/Interfaces";
import { FaTrashAlt } from "react-icons/fa";
import { usePageStore } from "@/stores/page/usePageStore";
import Page, { ModifiedPageArgs } from "@/global/classes/Page";
import { Trash } from "@phosphor-icons/react";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { AlertDialogAction, AlertDialogCancel } from "../ui/AlertDialog";

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
    const [submitActivator, setSubmitActivator] = submitActivatorStateProp || [
        false,
        undefined,
    ];
    const [cancelActivator, setCancelActivator] = cancelActivatorStateProp || [
        false,
        undefined,
    ];
    const { pages } = usePageStore();

    // localPages are the Pages that are displayed in the table
    const [localPages, setLocalPages] = useState<Page[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changesRef = useRef<{ [key: number | string]: any }>({});
    const deletionsRef = useRef<number[]>([]);

    async function handleSubmit() {
        setIsEditing(false);

        const modifiedPages: ModifiedPageArgs[] = [];

        if (deletionsRef.current.length > 0) {
            for (const pageId of deletionsRef.current)
                await Page.deletePage(pageId);
        }

        for (const [pageId, changes] of Object.entries(changesRef.current))
            modifiedPages.push({ id: Number(pageId), ...changes });

        const result = await Page.updatePages(modifiedPages);
        deletionsRef.current = [];
        changesRef.current = {};
        return result;
    }

    function handleCancel() {
        setIsEditing(false);
        setLocalPagesModified(pages);
        deletionsRef.current = [];
        changesRef.current = {};
    }

    function handleDeletePage(pageId: number) {
        deletionsRef.current.push(pageId);
        setLocalPagesModified(localPages?.filter((page) => page.id !== pageId));
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
        pagesCopy[0] = new Page({ ...pagesCopy[0], counts: 0 });
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
            className="flex flex-col gap-16 text-body text-text"
        >
            <div className="flex w-full items-center justify-between">
                <p className="text-body text-text">List</p>
                <div className="flex gap-8">
                    {!isEditingStateProp ? (
                        <>
                            {deletionsRef.current.length > 0 ? (
                                <FormButtons
                                    variant="primary"
                                    size="compact"
                                    handleCancel={handleCancel}
                                    editButton={"Edit Pages"}
                                    isEditingProp={isEditing}
                                    setIsEditingProp={setIsEditing}
                                    handleSubmit={handleSubmit}
                                    isDangerButton={true}
                                    alertDialogTitle="Warning"
                                    alertDialogDescription={`You are about to delete ${deletionsRef.current.length > 1 ? `${deletionsRef.current.length} pages` : "a page"}, which will delete the coordinates for ALL marchers on them. This can not be undone, are you sure?`}
                                    alertDialogActions={
                                        <>
                                            <AlertDialogAction>
                                                <Button
                                                    variant="red"
                                                    size="compact"
                                                    onClick={handleSubmit}
                                                >
                                                    Delete
                                                </Button>
                                            </AlertDialogAction>
                                            <AlertDialogCancel>
                                                <Button
                                                    variant="secondary"
                                                    size="compact"
                                                    onClick={handleCancel}
                                                >
                                                    Cancel
                                                </Button>
                                            </AlertDialogCancel>
                                        </>
                                    }
                                />
                            ) : (
                                <FormButtons
                                    variant="secondary"
                                    size="compact"
                                    handleCancel={handleCancel}
                                    editButton={"Edit Marchers"}
                                    isEditingProp={isEditing}
                                    setIsEditingProp={setIsEditing}
                                    handleSubmit={handleSubmit}
                                />
                            )}
                        </>
                    ) : (
                        // exists to ensure default submit behavior
                        <button type="submit" hidden={true} />
                    )}
                </div>
            </div>
            <div
                id="table"
                className="flex h-fit w-[27rem] min-w-0 flex-col gap-10"
            >
                {localPages && pages && (
                    <>
                        <div id="key" className="flex items-center gap-4">
                            <div className="w-1/3">
                                <p className="font-mono text-sub text-text/90">
                                    Page #
                                </p>
                            </div>
                            <div className="w-2/3">
                                <p className="text-sub text-text/90">Counts</p>
                            </div>
                        </div>
                        {localPages.map((page) => (
                            <div
                                id="Page row"
                                key={page.id}
                                className="flex items-center gap-4"
                            >
                                <div className="w-1/3">
                                    <p className="font-mono text-body text-text">
                                        {page.name}
                                    </p>
                                </div>
                                <div className="flex w-2/3 items-center gap-6">
                                    {isEditing ? (
                                        <Input
                                            compact
                                            type="number"
                                            className="form-control"
                                            aria-label="Page counts input"
                                            title="Page counts input"
                                            defaultValue={page.counts}
                                            disabled={
                                                !isEditing ||
                                                page.id === pages[0].id
                                            }
                                            key={page.id_for_html}
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
                                    ) : (
                                        <p className="text-body text-text">
                                            {page.counts}
                                        </p>
                                    )}
                                    {isEditing && (
                                        <Button
                                            variant="red"
                                            size="compact"
                                            content="icon"
                                            disabled={
                                                !isEditing ||
                                                page.id === pages[0].id
                                            }
                                            onClick={() =>
                                                handleDeletePage(page.id)
                                            }
                                        >
                                            <Trash size={18} />
                                        </Button>
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

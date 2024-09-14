import { useCallback, useEffect, useRef, useState } from "react";
import FormButtons from "../FormButtons";
import { ListFormProps } from "../../global/Interfaces";
import { FaTrashAlt } from "react-icons/fa";
import { usePageStore } from "@/stores/usePageStore";
import Page, { ModifiedPageArgs } from "@/global/classes/Page";

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
            let windowConfirmStr = `-- WARNING --`;
            windowConfirmStr += `\n\nYou are about to delete ${
                deletionsRef.current.length > 1
                    ? `${deletionsRef.current.length} pages`
                    : "a page"
            }, `;
            windowConfirmStr += `which will also delete the coordinates for ALL marchers on them.`;
            windowConfirmStr += `\n\nTHIS CANNOT BE UNDONE.`;
            windowConfirmStr += `\n\nPages that will be deleted:`;
            for (const pageId of deletionsRef.current)
                windowConfirmStr += `\nPg. ${
                    pages?.find((page) => page.id === pageId)?.name
                }`;
            if (window.confirm(windowConfirmStr))
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
        pageId: number
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
        >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                {(hasHeader && <h4>Page List</h4>) || <div />}
                {!isEditingStateProp && (
                    <FormButtons
                        handleCancel={handleCancel}
                        editButton={"Edit Pages"}
                        isEditingProp={isEditing}
                        setIsEditingProp={setIsEditing}
                        handleSubmit={handleSubmit}
                    />
                )}
            </div>
            <table
                className="w-full table-fixed table h-full"
                style={{ cursor: "default" }}
            >
                <thead className="thead-dark text-left">
                    <tr>
                        <th className="w-1/6" scope="col">
                            Page #
                        </th>
                        <th className="w-auto" scope="col">
                            Counts
                        </th>
                    </tr>
                </thead>
                {pages && localPages && (
                    <tbody>
                        {localPages.map((page) => (
                            <tr
                                key={page.id}
                                aria-label="Page row"
                                title="Page row"
                                data-id={page.id}
                            >
                                <th
                                    title="Page name"
                                    aria-label="Page name"
                                    scope="row"
                                    className="text-left"
                                >
                                    {page.name}
                                </th>
                                <td
                                    title="Page counts"
                                    aria-label="Page counts"
                                    className="text-left"
                                >
                                    {isEditing ? (
                                        <input
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
                                                    page.id
                                                )
                                            }
                                        />
                                    ) : (
                                        page.counts
                                    )}
                                </td>
                                {isEditing && (
                                    <td>
                                        <button
                                            className="btn-danger danger float-right"
                                            onClick={() =>
                                                handleDeletePage(page.id)
                                            }
                                        >
                                            <FaTrashAlt />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                )}
            </table>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div />
                {!isEditingStateProp ? (
                    <FormButtons
                        handleCancel={handleCancel}
                        editButton={"Edit Pages"}
                        isEditingProp={isEditing}
                        setIsEditingProp={setIsEditing}
                        handleSubmit={handleSubmit}
                    />
                ) : (
                    // exists to ensure default submit behavior
                    <button type="submit" hidden={true} />
                )}
            </div>
        </form>
    );
}

export default PageList;

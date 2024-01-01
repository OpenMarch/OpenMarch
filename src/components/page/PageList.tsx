import { usePageStore } from "../../stores/Store";
import { useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import FormButtons from "../FormButtons";
import { updatePages } from "../../api/api";
import { ListFormProps, UpdatePage } from "../../Interfaces";


function PageList({
    isEditingProp = undefined,
    setIsEditingProp = undefined,
    hasHeader = false,
    submitActivator = undefined, setSubmitActivator = undefined,
    cancelActivator = undefined, setCancelActivator = undefined,
}: ListFormProps) {
    const [isEditingLocal, setIsEditingLocal] = useState(false);
    // const [sortedPages, setSortedPages] = useState<Page[]>([]);
    const isEditing = isEditingProp || isEditingLocal;
    const setIsEditing = setIsEditingProp || setIsEditingLocal;
    const { pages, pagesAreLoading, fetchPages } = usePageStore();
    const changesRef = useRef<{ [key: number | string]: any }>({});

    async function handleSubmit() {
        setIsEditing(false);

        const pageUpdates: UpdatePage[] = [];

        for (const [pageId, changes] of Object.entries(changesRef.current))
            pageUpdates.push({ id: Number(pageId), ...changes });

        const result = await updatePages(pageUpdates);
        fetchPages();
        changesRef.current = {};
        return result;
    }

    function handleCancel() {
        setIsEditing(false);
        changesRef.current = {};
    }

    const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
        attribute: string, pageId: number
    ) => {
        // create an entry for the page if it doesn't exist
        if (!changesRef.current[pageId]) changesRef.current[pageId] = {};

        // record the change
        changesRef.current[pageId][attribute] = event.target.value;
    }

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
        <Form id={"pageListForm"} onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
        }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {(hasHeader && <h4>Page List</h4>) || <div />}
                {!isEditingProp && !setIsEditingProp && (isEditing ?
                    <FormButtons
                        handleCancel={handleCancel} editButton={"Edit Pages"}
                        isEditingProp={isEditing} setIsEditingProp={setIsEditing}
                        handleSubmit={handleSubmit}
                    />
                    :
                    <Button variant="primary" onClick={() => setIsEditing(true)}>
                        Edit Pages
                    </Button>)
                }
            </div>
            <table className={"table " + (isEditing && "table-hover")} style={{ cursor: "default" }}>
                <thead className="thead-dark">
                    <tr>
                        <th scope="col">Page #</th>
                        <th scope="col">Counts</th>
                    </tr>
                </thead>
                {(!pagesAreLoading && pages) &&
                    <tbody>
                        {pages.map((page) => (
                            <tr key={page.id}>
                                <th scope="row">{page.name}</th>
                                <td>
                                    {isEditing ?
                                        <input type="number" className="form-control"
                                            aria-label="Name" defaultValue={page.counts} disabled={!isEditing}
                                            key={page.id_for_html} min={0} step={1}
                                            onChange={(event) => handleChange(event, "counts", page.id)}
                                        />
                                        :
                                        page.counts
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>}
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div />
                {(!isEditingProp && !setIsEditingProp) ?
                    (isEditing ?
                        <FormButtons
                            handleCancel={handleCancel} editButton={"Edit Pages"}
                            isEditingProp={isEditing} setIsEditingProp={setIsEditing}
                            handleSubmit={handleSubmit}
                        />
                        :
                        <Button variant="primary" onClick={() => setIsEditing(true)}>
                            Edit Pages
                        </Button>)
                    :
                    <button type="submit" hidden={true} />
                }
            </div>
        </Form>
    );
}

export default PageList;

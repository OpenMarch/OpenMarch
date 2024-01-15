import { useMarcherStore } from "../../stores/Store";
import { sections } from "../../Constants";
import { useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import FormButtons from "../FormButtons";
import { deleteMarcher, updateMarchers } from "../../api/api";
import { ListFormProps, UpdateMarcher } from "../../Interfaces";
import { FaTrashAlt } from "react-icons/fa";
import { Marcher } from "../../Interfaces";

function MarcherList({
    isEditingProp = undefined,
    setIsEditingProp = undefined,
    hasHeader = false,
    submitActivator = undefined, setSubmitActivator = undefined,
    cancelActivator = undefined, setCancelActivator = undefined,
}: ListFormProps) {
    const [isEditingLocal, setIsEditingLocal] = useState(false);
    const isEditing = isEditingProp || isEditingLocal;
    const setIsEditing = setIsEditingProp || setIsEditingLocal;
    const { marchers, marchersAreLoading, fetchMarchers } = useMarcherStore();

    // localMarchers are the marchers that are displayed in the table
    const [localMarchers, setLocalMarchers] = useState<Marcher[]>();
    const changesRef = useRef<{ [key: number | string]: any }>({});
    const deletionsRef = useRef<number[]>([]);

    async function handleSubmit() {
        setIsEditing(false);

        const marcherUpdates: UpdateMarcher[] = [];

        for (const [pageId, changes] of Object.entries(changesRef.current))
            marcherUpdates.push({ id: Number(pageId), ...changes });

        if (deletionsRef.current.length > 0) {
            let windowConfirmStr = `-- WARNING --`
            windowConfirmStr += `\n\nYou are about to delete ${deletionsRef.current.length > 1 ? `${deletionsRef.current.length} marchers` : "a marcher"}, `;
            windowConfirmStr += `which will also delete ALL of their coordinates for every page.`;
            windowConfirmStr += `\n\nTHIS CANNOT BE UNDONE.`;
            windowConfirmStr += `\n\nMarchers that will be deleted:`;
            for (const marcherId of deletionsRef.current)
                windowConfirmStr += `\n- ${marchers?.find((marcher) => marcher.id === marcherId)?.drill_number}`;
            if (window.confirm(windowConfirmStr))
                for (const marcherId of deletionsRef.current)
                    await deleteMarcher(marcherId);
        }

        const result = await updateMarchers(marcherUpdates);
        fetchMarchers();
        changesRef.current = {};
        deletionsRef.current = [];
        return result;
    }

    function handleDeleteMarcher(marcherId: number) {
        deletionsRef.current.push(marcherId);
        setLocalMarchers(localMarchers?.filter((marcher) => marcher.id !== marcherId));
    }

    function handleCancel() {
        setIsEditing(false);
        setLocalMarchers(marchers);
        deletionsRef.current = [];
        changesRef.current = {};
    }

    const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
        attribute: string, marcherId: number
    ) => {
        // create an entry for the marcher if it doesn't exist
        if (!changesRef.current[marcherId]) changesRef.current[marcherId] = {};

        // record the change
        changesRef.current[marcherId][attribute] = event.target.value;
    }

    // Update local marchers when marchers are fetched
    useEffect(() => {
        setLocalMarchers(marchers);
    }, [marchers]);

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
        <Form id={"marcherListForm"} onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
        }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {(hasHeader && <h4>Marcher List</h4>) || <div />}
                {!isEditingProp && !setIsEditingProp && (isEditing ?
                    <FormButtons
                        handleCancel={handleCancel} editButton={"Edit Marchers"}
                        isEditingProp={isEditing} setIsEditingProp={setIsEditing}
                        handleSubmit={handleSubmit}
                    />
                    :
                    <Button variant="primary" onClick={() => setIsEditing(true)}>
                        Edit Marchers
                    </Button>)
                }
            </div>
            <table className={"table " + (isEditing && "table-hover")} style={{ cursor: "default" }}>
                <thead className="thead-dark">
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">Section</th>
                        <th scope="col">Name</th>
                    </tr>
                </thead>
                {(!marchersAreLoading && localMarchers && marchers) &&
                    <tbody>
                        {localMarchers.map((marcher) => (
                            <tr key={marcher.id}>
                                <th scope="row">{marcher.drill_prefix + marcher.drill_order}</th>
                                <td>
                                    {isEditing ?
                                        <select className="form-select" defaultValue={marcher.section}
                                            aria-label="Section" disabled={!isEditing}
                                            key={marcher.id_for_html}
                                            onChange={(event) => handleChange(event, "section", marcher.id)}
                                        >
                                            <option value=""></option>
                                            {Object.values(sections).map((section: any) => {
                                                return <option key={section.name}>{section.name}</option>
                                            })}
                                        </select>
                                        :
                                        marcher.section
                                    }
                                </td>
                                <td>
                                    {isEditing ?
                                        <input type="text" className="form-control"
                                            aria-label="Name" defaultValue={marcher.name} disabled={!isEditing}
                                            key={marcher.id_for_html}
                                            onChange={(event) => handleChange(event, "name", marcher.id)}
                                        />
                                        :
                                        marcher.name
                                    }
                                </td>
                                {isEditing &&
                                    <td >
                                        <Button variant="danger" onClick={() => handleDeleteMarcher(marcher.id)}>
                                            <FaTrashAlt />
                                        </Button>
                                    </td>
                                }
                            </tr>
                        ))}
                    </tbody>}
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div />
                {(!isEditingProp && !setIsEditingProp) ?
                    (isEditing ?
                        <FormButtons
                            handleCancel={handleCancel} editButton={"Edit Marchers"}
                            isEditingProp={isEditing} setIsEditingProp={setIsEditing}
                            handleSubmit={handleSubmit}
                        />
                        :
                        <Button variant="primary" onClick={() => setIsEditing(true)}>
                            Edit Marchers
                        </Button>)
                    :
                    <button type="submit" hidden={true} />
                }
            </div>
        </Form>
    );
}


export default MarcherList;

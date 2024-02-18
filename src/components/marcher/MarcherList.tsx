import { sections } from "../../global/Constants";
import { useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import FormButtons from "../FormButtons";
import { deleteMarcher, updateMarchers } from "../../api/api";
import { ListFormProps, UpdateMarcher } from "../../global/Interfaces";
import { FaTrashAlt } from "react-icons/fa";
import { Marcher } from "../../global/Interfaces";
import * as Interfaces from "../../global/Interfaces";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";

function MarcherList({
    hasHeader = false,
    isEditingStateProp = undefined,
    submitActivatorStateProp = undefined,
    cancelActivatorStateProp = undefined
}: ListFormProps) {

    const [isEditingLocal, setIsEditingLocal] = useState(false);
    const [isEditing, setIsEditing] = isEditingStateProp || [isEditingLocal, setIsEditingLocal];
    const [submitActivator, setSubmitActivator] = submitActivatorStateProp || [false, undefined];
    const [cancelActivator, setCancelActivator] = cancelActivatorStateProp || [false, undefined];
    const { marchers, marchersAreLoading, fetchMarchers } = useMarcherStore();

    // localMarchers are the marchers that are displayed in the table
    const [localMarchers, setLocalMarchers] = useState<Marcher[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        console.log(result);
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

    // Activate cancel with an external activator (like a button in a parent component)
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
                {!isEditingStateProp && (isEditing ?
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
            <table
                className={"table " + (isEditing ? "table-hover" : "")}
                style={{ cursor: "default" }}
                title="marcher-list-table"
            >
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
                            <tr key={marcher.id_for_html} title="marcher-row">
                                <th scope="row" title="marcher-drill-number">
                                    {marcher.drill_prefix + marcher.drill_order}
                                </th>
                                <td title="marcher-section">
                                    {isEditing ?
                                        <select className="form-select" defaultValue={marcher.section}
                                            aria-label="Section" disabled={!isEditing}
                                            onChange={(event) => handleChange(event, "section", marcher.id)}
                                        >
                                            <option value=""></option>
                                            {Object.values(sections).map((section: Interfaces.Section) => {
                                                return <option key={section.name}>{section.name}</option>
                                            })}
                                        </select>
                                        :
                                        marcher.section
                                    }
                                </td>
                                <td title="marcher-name">
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
                {/* Do not show this button if the form is being controlled by a parent component. */}
                {(!isEditingStateProp) ?
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

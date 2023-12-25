import { useMarcherStore } from "../../stores/Store";
import { sections } from "../../Constants";
import { useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import FormButtons from "../FormButtons";
import { updateMarcherSection, updateMarcherName } from "../../api/api";
import { ListFormProps } from "../../Interfaces";

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
    const changesRef = useRef<{ [key: number | string]: any }>({});

    async function handleSubmit() {
        setIsEditing(false);

        for (const [marcherId, changes] of Object.entries(changesRef.current)) {
            await updateMarcher(Number(marcherId), changes);
        }
        fetchMarchers();
        changesRef.current = {};
    }

    function handleCancel() {
        setIsEditing(false);
        changesRef.current = {};
    }

    async function updateMarcher(marcherId: number, changes: any) {
        for (const [key, value] of Object.entries(changes)) {
            try {
                if (key === "section")
                    await updateMarcherSection(marcherId, value as string);
                else if (key === "name")
                    await updateMarcherName(marcherId, value as string);
            } catch (error) {
                console.error(`Error updating marcher ${marcherId}:`, error);
            }
        }
    }

    const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
        attribute: string, marcherId: number
    ) => {
        // create an entry for the marcher if it doesn't exist
        if (!changesRef.current[marcherId]) changesRef.current[marcherId] = {};

        // record the change
        changesRef.current[marcherId][attribute] = event.target.value;
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
                        <th scope="col">section</th>
                        <th scope="col">Name</th>
                    </tr>
                </thead>
                {(!marchersAreLoading && marchers) &&
                    <tbody>
                        {marchers.map((marcher) => (
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
                                {/* {isEditing &&
                                    <td >
                                        <Button variant="danger" ><FaTrashAlt /></Button>
                                    </td>
                                } */}
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

import { useMarcherStore } from "../../stores/Store";
import { sections } from "../../Constants";
import { useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { FaTrashAlt } from "react-icons/fa";
import FormButtons from "../FormButtons";
import { marcherListFormAttributes } from "../../Constants";
import { NewMarcher } from "../../Interfaces";
import { updateMarcherInstrument, updateMarcherName, updateMarcherDrillNumber } from "../../api/api";

interface NewMarcherFormProps {
    isEditingProp?: boolean;
    setIsEditingProp?: React.Dispatch<React.SetStateAction<boolean>>;
    hasHeader?: boolean;
}

function MarcherList({
    isEditingProp = undefined,
    setIsEditingProp = undefined,
    hasHeader = false
}: NewMarcherFormProps) {
    const [isEditingLocal, setIsEditingLocal] = useState(false);
    const isEditing = isEditingProp || isEditingLocal;
    const setIsEditing = setIsEditingProp || setIsEditingLocal;
    const { marchers, marchersAreLoading, fetchMarchers } = useMarcherStore();
    const changesRef = useRef<{ [key: number | string]: any }>({});

    const handleSubmit = async () => {
        setIsEditing(false);

        for (const [marcherId, changes] of Object.entries(changesRef.current)) {
            await updateMarcher(Number(marcherId), changes);
        }
        fetchMarchers();
        changesRef.current = {};
    }

    async function updateMarcher(marcherId: number, changes: any) {
        console.log("updateMarcher", marcherId, changes);
        for (const [key, value] of Object.entries(changes)) {
            try {
                if (key === "instrument")
                    await updateMarcherInstrument(marcherId, value as string);
                else if (key === "name")
                    await updateMarcherName(marcherId, value as string);
            } catch (error) {
                console.error(`Error updating marcher ${marcherId}:`, error);
            }
        }
    }

    const handleCancel = () => {
        setIsEditing(false);
        changesRef.current = {};
    }

    const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
        attribute: string, marcherId: number
    ) => {
        console.log(event.target.name + " " + event.target.value, "marcherId: " + marcherId);
        // create an entry for the marcher if it doesn't exist
        if (!changesRef.current[marcherId]) changesRef.current[marcherId] = {};

        // record the change
        changesRef.current[marcherId][attribute] = event.target.value;
        console.log(changesRef.current);
    }

    return (
        <Form id={marcherListFormAttributes.formId}>
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
                        <th scope="col">Instrument</th>
                        <th scope="col">Name</th>
                    </tr>
                </thead>
                {!marchersAreLoading &&
                    <tbody>
                        {marchers.map((marcher) => (
                            <tr key={marcher.id}>
                                <th scope="row">{marcher.drill_prefix + marcher.drill_order}</th>
                                <td>
                                    {isEditing ?
                                        <select className="form-select" defaultValue={marcher.instrument}
                                            aria-label="Section" disabled={!isEditing}
                                            key={marcher.id_for_html}
                                            onChange={(event) => handleChange(event, "instrument", marcher.id)}
                                        >
                                            <option value=""></option>
                                            {Object.values(sections).map((section: any) => {
                                                return <option key={section.instrument}>{section.instrument}</option>
                                            })}
                                        </select>
                                        :
                                        marcher.instrument
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
                        {/* <tr>
                        <th scope="row">1</th>
                        <td>Mark</td>
                        <td>Otto</td>
                        <td>@mdo</td>
                    </tr> */}
                    </tbody>}
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div />
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
        </Form>
    );
}


export default MarcherList;

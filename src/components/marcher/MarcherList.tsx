import { useEffect, useRef, useState } from "react";
import FormButtons from "../FormButtons";
import { ListFormProps } from "../../global/Interfaces";
import { FaTrashAlt } from "react-icons/fa";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { Marcher, ModifiedMarcherArgs } from "@/global/classes/Marcher";
import { SECTIONS } from "@/global/classes/Sections";

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
    const { marchers } = useMarcherStore();

    // localMarchers are the marchers that are displayed in the table
    const [localMarchers, setLocalMarchers] = useState<Marcher[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changesRef = useRef<{ [key: number | string]: any }>({});
    const deletionsRef = useRef<number[]>([]);

    async function handleSubmit() {
        setIsEditing(false);

        const modifiedMarchers: ModifiedMarcherArgs[] = [];

        for (const [pageId, changes] of Object.entries(changesRef.current))
            modifiedMarchers.push({ id: Number(pageId), ...changes });

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
                    await Marcher.deleteMarcher(marcherId);
        }

        const result = Marcher.updateMarchers(modifiedMarchers);
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

    // Activate cancel with an external activator (like a button in a parent component)
    useEffect(() => {
        if (cancelActivator) {
            handleCancel();
            setCancelActivator && setCancelActivator(false);
        }
        // eslint-disable-next-line
    }, [cancelActivator, setCancelActivator]);

    return (
        <form id={"marcherListForm"} onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
        }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {(hasHeader && <h4>Marcher List</h4>) || <div />}
                {/* Do not show this button if the form is being controlled by a parent component.
                  Form buttons exist on both the bottom and top of the form */}
                {!isEditingStateProp && (isEditing ?
                    <FormButtons
                        handleCancel={handleCancel} editButton={"Edit Marchers"}
                        isEditingProp={isEditing} setIsEditingProp={setIsEditing}
                        handleSubmit={handleSubmit}
                    />
                    :
                    <button className="btn-primary  rounded-md" onClick={() => setIsEditing(true)}>
                        Edit Marchers
                    </button>)
                }
            </div>
            <table
                className="w-full table-fixed table h-full"
                style={{ cursor: "default" }}
                title="marcher-list-table"
            >
                <thead className="thead-dark text-left">
                    <tr>
                        <th className="w-1/6" scope="col">#</th>
                        <th className="w-1/3" scope="col">Section</th>
                        <th className="w-auto" scope="col">Name</th>
                    </tr>
                </thead>
                {(localMarchers && marchers) &&
                    <tbody>
                        {localMarchers.map((marcher) => (
                            <tr key={marcher.id_for_html}
                                data-id={marcher.id}
                                title="Marcher row"
                                aria-label="Marcher Row"
                            >
                                <th scope="row" title="Marcher drill number" className="text-left">
                                    {marcher.drill_prefix + marcher.drill_order}
                                </th>
                                <td title="Marcher section" aria-label="Marcher section">
                                    {isEditing ?
                                        <select className="form-select"
                                            defaultValue={marcher.section}
                                            aria-label="Marcher section input"
                                            title="Marcher section input"
                                            disabled={!isEditing}
                                            onChange={(event) => handleChange(event, "section", marcher.id)}
                                        >
                                            <option value=""></option>
                                            {Object.values(SECTIONS).map((section) => {
                                                return <option key={section.name}>{section.name}</option>
                                            })}
                                        </select>
                                        :
                                        marcher.section
                                    }
                                </td>
                                <td title="Marcher name" aria-label="Marcher name">
                                    {isEditing ?
                                        <input type="text" className="form-control"
                                            aria-label="Marcher name input" title="Marcher name input" defaultValue={marcher.name} disabled={!isEditing}
                                            key={marcher.id_for_html}
                                            onChange={(event) => handleChange(event, "name", marcher.id)}
                                        />
                                        :
                                        marcher.name
                                    }
                                </td>
                                {isEditing &&
                                    <td >
                                        <button className="btn-danger float-right" onClick={() => handleDeleteMarcher(marcher.id)}>
                                            <FaTrashAlt />
                                        </button>
                                    </td>
                                }
                            </tr>
                        ))}
                    </tbody>}
            </table>
            <div className='flex justify-between'>
                <div />
                {/* Do not show this button if the form is being controlled by a parent component.
                  Form buttons exist on both the bottom and top of the form */}
                {(!isEditingStateProp) ?
                    (isEditing ?
                        <FormButtons
                            handleCancel={handleCancel} editButton={"Edit Marchers"}
                            isEditingProp={isEditing} setIsEditingProp={setIsEditing}
                            handleSubmit={handleSubmit}
                        />
                        :
                        <button className="btn-primary" onClick={() => setIsEditing(true)}>
                            Edit Marchers
                        </button>)
                    :
                    // exists to ensure default submit behavior
                    <button type="submit" hidden={true} />
                }
            </div>
        </form>
    );
}


export default MarcherList;

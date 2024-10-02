import { useEffect, useRef, useState } from "react";
import FormButtons from "../FormButtons";
import { ListFormProps } from "../../global/Interfaces";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { Marcher, ModifiedMarcherArgs } from "@/global/classes/Marcher";
import { SECTIONS } from "@/global/classes/Sections";
import { Button } from "@/components/ui/Button";
import { PencilSimple, Trash } from "@phosphor-icons/react";

export default function MarcherModalContents({
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
            let windowConfirmStr = `-- WARNING --`;
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
        setLocalMarchers(
            localMarchers?.filter((marcher) => marcher.id !== marcherId),
        );
    }

    function handleCancel() {
        setIsEditing(false);
        setLocalMarchers(marchers);
        deletionsRef.current = [];
        changesRef.current = {};
    }

    const handleChange = (
        event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
        attribute: string,
        marcherId: number,
    ) => {
        // create an entry for the marcher if it doesn't exist
        if (!changesRef.current[marcherId]) changesRef.current[marcherId] = {};

        // record the change
        changesRef.current[marcherId][attribute] = event.target.value;
    };

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
        <form
            id={"marcherListForm"}
            onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
            }}
            className="flex flex-col gap-16 text-text"
        >
            <div
                id="table"
                className="flex h-fit w-full min-w-0 flex-col gap-10"
            >
                <div id="key" className="grid grid-cols-8">
                    <div className="col-span-1">
                        <p className="font-mono text-sub text-text/90">#</p>
                    </div>
                    <div className="col-span-3">
                        <p className="text-sub text-text/90">Section</p>
                    </div>
                    <div className="col-span-4">
                        <p className="text-sub text-text/90">Name</p>
                    </div>
                </div>
                {localMarchers && marchers && (
                    <>
                        {localMarchers.map((marcher) => (
                            <div
                                id={`${marcher.drill_number} marcher row`}
                                key={marcher.id_for_html}
                                className="grid grid-cols-8"
                            >
                                <div className="col-span-1">
                                    <p className="text-body text-text">
                                        {marcher.drill_prefix +
                                            marcher.drill_order}
                                    </p>
                                </div>
                                <div className="col-span-3">
                                    <p className="text-body text-text">
                                        {isEditing ? (
                                            <select
                                                className="form-select"
                                                defaultValue={marcher.section}
                                                aria-label="Marcher section input"
                                                title="Marcher section input"
                                                disabled={!isEditing}
                                                onChange={(event) =>
                                                    handleChange(
                                                        event,
                                                        "section",
                                                        marcher.id,
                                                    )
                                                }
                                            >
                                                <option value=""></option>
                                                {Object.values(SECTIONS).map(
                                                    (section) => {
                                                        return (
                                                            <option
                                                                key={
                                                                    section.name
                                                                }
                                                            >
                                                                {section.name}
                                                            </option>
                                                        );
                                                    },
                                                )}
                                            </select>
                                        ) : (
                                            marcher.section
                                        )}
                                    </p>
                                </div>
                                <div className="col-span-4">
                                    <p className="text-body text-text">
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                className="form-control"
                                                aria-label="Marcher name input"
                                                title="Marcher name input"
                                                defaultValue={marcher.name}
                                                disabled={!isEditing}
                                                key={marcher.id_for_html}
                                                onChange={(event) =>
                                                    handleChange(
                                                        event,
                                                        "name",
                                                        marcher.id,
                                                    )
                                                }
                                            />
                                        ) : (
                                            marcher.name
                                        )}
                                    </p>
                                </div>
                                {isEditing && (
                                    <td>
                                        <Button
                                            variant="red"
                                            size="compact"
                                            content="icon"
                                            onClick={() =>
                                                handleDeleteMarcher(marcher.id)
                                            }
                                        >
                                            <Trash size={18} />
                                        </Button>
                                    </td>
                                )}
                            </div>
                        ))}
                    </>
                )}
            </div>
            <div className="flex w-full justify-end gap-8">
                {!isEditingStateProp && (
                    <FormButtons
                        variant="secondary"
                        size="compact"
                        handleCancel={handleCancel}
                        editButton={"Edit"}
                        isEditingProp={isEditing}
                        setIsEditingProp={setIsEditing}
                        handleSubmit={handleSubmit}
                    />
                )}
            </div>
        </form>
    );
}

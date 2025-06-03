import { useEffect, useRef, useState } from "react";
import { ListFormProps } from "../../global/Interfaces";
import { useMarcherStore } from "@/stores/MarcherStore";
import { Marcher, ModifiedMarcherArgs } from "@/global/classes/Marcher";
import { SECTIONS } from "@/global/classes/Sections";
import { Button } from "@openmarch/ui";
import { TrashIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { Input } from "@openmarch/ui";
import FormButtons from "../FormButtons";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerText,
} from "@openmarch/ui";
import { AlertDialogAction, AlertDialogCancel } from "@openmarch/ui";

export default function MarcherList({
    hasHeader = false,
    isEditingStateProp = undefined,
    submitActivatorStateProp = undefined,
    cancelActivatorStateProp = undefined,
}: ListFormProps) {
    const { isOpen } = useSidebarModalStore();
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
            const marcherIdsSet = new Set(deletionsRef.current.map((id) => id));
            await Marcher.deleteMarchers(marcherIdsSet);
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
        value: string,
        attribute: string,
        marcherId: number,
    ) => {
        // create an entry for the marcher if it doesn't exist
        if (!changesRef.current[marcherId]) changesRef.current[marcherId] = {};

        // record the change
        changesRef.current[marcherId][attribute] = value;
    };

    // Update local marchers when marchers are fetched
    useEffect(() => {
        setLocalMarchers(marchers);
    }, [marchers]);

    // Turn off editing if the modal closes
    useEffect(() => {
        setIsEditing(false);
    }, [isOpen, setIsEditing]);

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

    if (marchers.length > 0)
        return (
            <form
                id={"marcherListForm"}
                onSubmit={(event) => {
                    event.preventDefault();
                    handleSubmit();
                }}
                className="text-body text-text flex flex-col gap-16"
            >
                <div className="flex w-full items-center justify-between">
                    <p className="text-body text-text">List</p>
                    <div className="flex gap-8">
                        {!isEditingStateProp &&
                        localMarchers &&
                        marchers.length > 0 ? (
                            <>
                                {deletionsRef.current.length > 0 ? (
                                    <FormButtons
                                        variant="primary"
                                        size="compact"
                                        handleCancel={handleCancel}
                                        editButton={"Edit Marchers"}
                                        isEditingProp={isEditing}
                                        setIsEditingProp={setIsEditing}
                                        handleSubmit={handleSubmit}
                                        isDangerButton={true}
                                        alertDialogTitle="Warning"
                                        alertDialogDescription={`
                                            You are about to delete these marchers:
                                            ${deletionsRef.current
                                                .map((marcherId) => {
                                                    const marcherName =
                                                        marchers?.find(
                                                            (marcher) =>
                                                                marcher.id ===
                                                                marcherId,
                                                        )?.drill_number;
                                                    return (
                                                        marcherName || "Unknown"
                                                    );
                                                })
                                                .join(
                                                    ", ",
                                                )}. This can be undone with [Ctrl/Cmd+Z].
                                        `}
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
                    {localMarchers && marchers.length > 0 && (
                        <>
                            <div id="key" className="flex items-center gap-4">
                                <div className="w-[13%]">
                                    <p className="text-sub text-text/90 font-mono">
                                        #
                                    </p>
                                </div>
                                <div className="w-[45%]">
                                    <p className="text-sub text-text/90">
                                        Section
                                    </p>
                                </div>
                                <div className="w-[45%]">
                                    <p className="text-sub text-text/90">
                                        Name
                                    </p>
                                </div>
                            </div>
                            {localMarchers.map((marcher) => (
                                <div
                                    data-testid={`marcher row`}
                                    id={`${marcher.drill_number} marcher row`}
                                    key={marcher.id_for_html}
                                    className="flex items-center gap-4"
                                >
                                    <div
                                        className="w-[13%]"
                                        data-testid="marcher-drill-number"
                                    >
                                        <p className="text-body text-text font-mono">
                                            {marcher.drill_prefix +
                                                marcher.drill_order}
                                        </p>
                                    </div>
                                    <div
                                        className="w-[45%]"
                                        data-testid="marcher section"
                                    >
                                        {isEditing ? (
                                            <Select
                                                defaultValue={marcher.section}
                                                aria-label="Marcher section input"
                                                disabled={!isEditing}
                                                onValueChange={(
                                                    value: string,
                                                ) =>
                                                    handleChange(
                                                        value,
                                                        "section",
                                                        marcher.id,
                                                    )
                                                }
                                            >
                                                <SelectTriggerText
                                                    label={
                                                        marcher.section ||
                                                        "Section"
                                                    }
                                                />
                                                <SelectContent>
                                                    {Object.values(
                                                        SECTIONS,
                                                    ).map((section) => {
                                                        return (
                                                            <SelectItem
                                                                key={
                                                                    section.name
                                                                }
                                                                value={
                                                                    section.name
                                                                }
                                                            >
                                                                {section.name}
                                                            </SelectItem>
                                                        );
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <p
                                                className="text-body text-text"
                                                data-testid="marcher-section"
                                            >
                                                {marcher.section}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex w-[45%] items-center gap-6">
                                        {isEditing ? (
                                            <Input
                                                className="w-full"
                                                type="text"
                                                compact
                                                aria-label="Marcher name input"
                                                title="Marcher name input"
                                                defaultValue={
                                                    marcher.name ?? ""
                                                }
                                                disabled={!isEditing}
                                                key={marcher.id_for_html}
                                                onChange={(event) =>
                                                    handleChange(
                                                        event.target.value,
                                                        "name",
                                                        marcher.id,
                                                    )
                                                }
                                            />
                                        ) : (
                                            <p
                                                className="text-body text-text"
                                                data-testid="marcher-name"
                                            >
                                                {marcher.name}
                                            </p>
                                        )}
                                        {isEditing && (
                                            <Button
                                                variant="red"
                                                size="compact"
                                                content="icon"
                                                onClick={() =>
                                                    handleDeleteMarcher(
                                                        marcher.id,
                                                    )
                                                }
                                            >
                                                <TrashIcon size={18} />
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

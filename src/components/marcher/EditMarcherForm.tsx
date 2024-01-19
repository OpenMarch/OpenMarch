import { Form, InputGroup } from "react-bootstrap";
import { useCallback, useEffect, useState } from "react";
import { updateMarcherDrillNumber } from "../../api/api";
import { useMarcherStore } from "../../stores/Store";
import FormButtons from "../TinyFormButtons";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";

/**
 * THIS COMPONENT SHOULD NOT BE USED. IT IS NOT FUNCTIONAL.
 * @returns
 */
function EditMarcherForm() {
    const { selectedMarchers } = useSelectedMarchers()!;
    const [isEditing, setIsEditing] = useState(false);
    const { fetchMarchers } = useMarcherStore();

    const marcherFormId = "marcherForm";
    const drillPrefixInputId = "prefixFormInput";
    const drillOrderInputId = "prefixOrderInput";

    /* -------------------------------------- USE EFFECTS --------------------------------------*/
    useEffect(() => {
        setIsEditing(false);
        resetForm();
    }, [selectedMarchers]);

    /* -------------------------------------- HANDLERS --------------------------------------*/
    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        setIsEditing(false);
        event.preventDefault();
        const form = event.currentTarget;
        const prefix = form[drillPrefixInputId].value;
        const order = form[drillOrderInputId].value;

        updateMarcherDrillNumber(selectedMarchers!.id, prefix, order).then(() => fetchMarchers());
    };

    const handleCancel = useCallback(() => {
        setIsEditing(false);
        const form = document.getElementById(marcherFormId) as HTMLFormElement;
        form?.reset();
    }, []);

    const resetForm = () => {
        const form = document.getElementById(marcherFormId) as HTMLFormElement;
        form?.reset();
    };

    return (
        <>
            <Form
                className="mx-2"
                id={marcherFormId}
                onSubmit={handleSubmit}
            >
                {!selectedMarchers ? <p>Select a marcher to view details</p> : <>
                    <Form.Label htmlFor={marcherFormId}>
                        Marcher {selectedMarchers?.name}
                    </Form.Label>
                    <InputGroup size="sm" className="mb-12 text-right">
                        <InputGroup.Text id={"counts-label"}>
                            Drill Number
                        </InputGroup.Text>
                        <Form.Control
                            disabled={!isEditing}
                            id={drillPrefixInputId}
                            defaultValue={selectedMarchers.drill_prefix || ""}
                            type="text"
                        />
                        <Form.Control
                            disabled={!isEditing}
                            id={drillOrderInputId}
                            defaultValue={selectedMarchers.drill_order || ""}
                            type="number"
                            min={1}
                            step={1}
                        />
                    </InputGroup>

                    <FormButtons
                        isEditing={isEditing}
                        setIsEditing={setIsEditing}
                        handleCancel={handleCancel}
                    />
                </>}
            </Form >
        </>
    );
}

export default EditMarcherForm;

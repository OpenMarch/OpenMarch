import { Button, Form, InputGroup } from "react-bootstrap";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useEffect, useState } from "react";
import { createPage, updatePageCounts } from "../../api/api";
import { usePageStore } from "../../stores/Store";
import FormButtons from "./FormButtons";
import { Constants } from "../../Constants";

function EditPageForm() {
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const [isEditing, setIsEditing] = useState(false);
    const pageFormId = "pageForm";
    const { fetchPages } = usePageStore()!;

    const countsInputId = "countsForm";

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        setIsEditing(false);
        event.preventDefault();
        const form = event.currentTarget;
        const counts = form[countsInputId].value;
        console.log(counts);

        // Refresh pages in the PageStore after making changes
        if (selectedPage?.id_for_html === Constants.NewPageId) {
            selectedPage.counts = counts;
            createPage(selectedPage!).then(() => fetchPages());
        }
        else
            updatePageCounts(selectedPage!.id, counts).then(() => fetchPages());
    };

    const handleCancel = () => {
        setIsEditing(false);
        setSelectedPage(null);
        const form = document.getElementById(pageFormId) as HTMLFormElement;
        form.reset();
    };

    const resetForm = () => {
        const form = document.getElementById(pageFormId) as HTMLFormElement;
        form.reset();
    };

    useEffect(() => {
        if (selectedPage?.id_for_html === Constants.NewPageId)
            setIsEditing(true);
        else
            setIsEditing(false);
        resetForm();
    }, [selectedPage]);

    return (
        <>
            <Form
                // className="justify-content-center align-items-center"
                id="pageForm"
                onSubmit={handleSubmit}
            >
                {!selectedPage ? <p>Select a page to view details</p> : <>
                    <Form.Label htmlFor={pageFormId}>
                        Page {selectedPage?.name}
                    </Form.Label>
                    <InputGroup size="sm" className="mb-12 text-right">
                        <InputGroup.Text id={`Form-${selectedPage?.id_for_html}`}>
                            Counts
                        </InputGroup.Text>
                        <Form.Control
                            disabled={!isEditing}
                            id={countsInputId}
                            defaultValue={selectedPage?.counts}
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

export default EditPageForm;

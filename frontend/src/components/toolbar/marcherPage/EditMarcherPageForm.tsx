import { useState, useEffect } from "react";
import { Form, InputGroup } from "react-bootstrap";
import { Constants } from "../../../Constants";
import { createPage, getMarcherPage, updateMarcherPage, updatePageCounts } from "../../../api/api";
import { useSelectedPage } from "../../../context/SelectedPageContext";
import { useMarcherPageStore, usePageStore } from "../../../stores/Store";
import FormButtons from "../FormButtons";
import { useSelectedMarcher } from "../../../context/SelectedMarcherContext";
import { MarcherPage } from "../../../Interfaces";

function EditMarcherPageForm() {
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedMarcher, setSelectedMarcher } = useSelectedMarcher()!;
    const [marcherPage, setMarcherPage] = useState<MarcherPage | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const marcherPageFormId = "marcherPageFormId";
    const { marcherPages, fetchMarcherPages } = useMarcherPageStore()!;

    const xForm = "xForm";
    const yForm = "yForm";

    /* -------------------------------------- USE EFFECTS --------------------------------------*/
    // TODO this is duplicate code from MarcherPageDetails.tsx Should this be a context instead?
    // Load marcherPage(s) from selected marcher/page
    useEffect(() => {
        setMarcherPage(null);

        // If both a marcher and page is selected return a single marcherPage
        if (selectedPage && selectedMarcher) {
            setMarcherPage(marcherPages.find(marcherPage => marcherPage.marcher_id === selectedMarcher.id &&
                marcherPage.page_id === selectedPage.id) || null);
        }

        // Change the set the form to edit mode when creating a new page
        // Otherwise, disable edit mode when a different marcher or page is selected
        if (selectedPage?.id_for_html === Constants.NewPageId)
            setIsEditing(true);
        else
            setIsEditing(false);
        resetForm();
    }, [selectedPage, selectedMarcher, marcherPages]);

    /* -------------------------------------- HANDLERS --------------------------------------*/
    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        setIsEditing(false);
        event.preventDefault();
        const form = event.currentTarget;
        const x = form[xForm].value;
        const y = form[yForm].value;

        // Refresh pages in the PageStore after making changes
        updateMarcherPage(selectedMarcher!.id, selectedPage!.id, x, y).then(() => fetchMarcherPages());
    };

    const handleCancel = () => {
        setIsEditing(false);
        const form = document.getElementById(marcherPageFormId) as HTMLFormElement;
        form.reset();
    };

    const resetForm = () => {
        const form = document.getElementById(marcherPageFormId) as HTMLFormElement;
        form.reset();
    };

    return (
        <>
            <Form
                className="mx-2"
                id={marcherPageFormId}
                onSubmit={handleSubmit}
            >
                {selectedPage && selectedMarcher ? <>
                    <Form.Label htmlFor={marcherPageFormId}>
                        Page {selectedPage?.name} | {selectedMarcher?.drill_number || "nil"}
                    </Form.Label>
                    <InputGroup size="sm" className="mb-12 text-right">
                        <InputGroup.Text id={"x-label"}>
                            X
                        </InputGroup.Text>
                        <Form.Control
                            disabled={!isEditing}
                            id={xForm}
                            defaultValue={marcherPage?.x}
                            type="number"
                        />
                        <InputGroup.Text id={"y-label"}>
                            Y
                        </InputGroup.Text>
                        <Form.Control
                            disabled={!isEditing}
                            id={yForm}
                            defaultValue={marcherPage?.y}
                            type="number"
                        />
                    </InputGroup>

                    <FormButtons
                        isEditing={isEditing}
                        setIsEditing={setIsEditing}
                        handleCancel={handleCancel}
                    />
                </>
                    :
                    selectedMarcher && <p>Select a page to view details</p> ||
                    selectedPage && <p>Select a marcher to view details</p> ||
                    <p>Select a marcher and page to view details</p>
                }
            </Form >
        </>
    );
}

export default EditMarcherPageForm;

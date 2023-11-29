import { useSelectedPage } from "../../context/SelectedPageContext";
import { usePageStore } from "../../stores/Store";
import { updatePageCounts } from "../../api/api";
import { useEffect } from "react";

function PageEditor() {
    const { selectedPage } = useSelectedPage()!;
    const { fetchPages } = usePageStore()!;

    const countsInputId = "page-counts";
    const formId = "edit-page-form";

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        console.log("PageEditor: handleSubmit");
        event.preventDefault();
        const form = event.currentTarget;
        const counts = form[countsInputId].value;

        if (selectedPage) {
            updatePageCounts(selectedPage.id, counts).then(() => fetchPages());
        }

        // Remove focus from the input field
        const inputField = document.getElementById(countsInputId) as HTMLInputElement;
        if (inputField) {
            inputField.blur();
            inputField.defaultValue = counts;
            inputField.value = counts;
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        // Get the current value
        let currentValue = parseInt((event.target as HTMLInputElement).value);

        // Check which key was pressed
        switch (event.key) {
            case 'ArrowUp':
            case 'ArrowRight':
                // Increase the value by 1
                currentValue++;
                break;
            case 'ArrowDown':
            case 'ArrowLeft':
                // Decrease the value by 1
                currentValue--;
                break;
            default:
                // If the key wasn't an arrow key, do nothing
                return;
        }

        // Prevent the default action to stop the cursor from moving
        event.preventDefault();

        // Update the value
        (event.target as HTMLInputElement).value = currentValue.toString();
    };

    const resetForm = () => {
        const form = document.getElementById(formId) as HTMLFormElement;
        if (form) form.reset();
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
        // Reset the value to the default
        if (selectedPage) {
            // (event.target as HTMLInputElement).value = selectedPage.counts.toString();
            (event.target as HTMLInputElement).blur();
            resetForm();
        }
    };

    useEffect(() => {
        resetForm();
    }, [selectedPage]);

    return (
        <>{selectedPage && <div className="page-editor editor">
            <h3 className="header">
                <span>Page</span>
                <span>{selectedPage.name}</span>
            </h3>
            <form className="edit-group" id={formId} onSubmit={handleSubmit}>
                {/* <div className="input-group">
                    <label htmlFor="page-name">Name</label>
                    <input type="text" value={selectedPage.name} onChange={undefined} id="page-name" />
                </div> */}
                <div className="input-group">
                    <label htmlFor={countsInputId}>Counts</label>
                    <input type="number" defaultValue={selectedPage.counts}
                        id={countsInputId} onKeyDown={handleKeyDown} onBlur={handleBlur} />
                </div>
                <div className="input-group">
                    <label htmlFor="page-order">Order</label>
                    <input type="number" value={selectedPage.order} id="page-order" disabled={true} />
                </div>
                {/* <div className="input-group">
                    <label htmlFor="page-sets">Tempo</label>
                    Not yet implemented
                </div> */}
                {/* This is here so the form submits when enter is pressed */}
                <button type="submit" style={{ display: 'none' }}>
                    Submit
                </button>
            </form>
        </div>
        }</>
    );
}

export default PageEditor;

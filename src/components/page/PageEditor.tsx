import { useSelectedPage } from "../../context/SelectedPageContext";
import { useEffect, useState } from "react";
import { usePageStore } from "@/stores/page/usePageStore";
import { Page } from "@/global/classes/Page";
import { FaArrowRight } from "react-icons/fa";

function PageEditor() {
    const { selectedPage } = useSelectedPage()!;
    const { pages } = usePageStore()!;
    const [isFirstPage, setIsFirstPage] = useState(false);

    const countsInputId = "page-counts";
    const formId = "edit-page-form";

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const counts = form[countsInputId].value;

        if (selectedPage) {
            Page.updatePages([{ id: selectedPage.id, counts: counts }]);
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

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
        // Reset the value to the default
        if (selectedPage) {
            // (event.target as HTMLInputElement).value = selectedPage.counts.toString();
            (event.target as HTMLInputElement).blur();
            resetForm();
        }
    };

    const resetForm = () => {
        const form = document.getElementById(formId) as HTMLFormElement;
        if (form) form.reset();
    };

    // Reset the form when the selected page changes so the values are correct
    useEffect(() => {
        resetForm();
    }, [selectedPage]);

    useEffect(() => {
        if (pages.length > 0) {
            const firstPage = Page.getFirstPage(pages);
            setIsFirstPage(selectedPage === firstPage);
        }
    }, [pages, selectedPage]);

    return (
        <>{selectedPage && <div className="m-0 p-0  top-0 page-editor editor mb-4">
            <div className="grid grid-cols-7 pl-4 py-2 text-xl font-bold border-0 border-solid border-b-2 border-b-gray-500 bg-gray-700 mt-0">
                <div className="col-span-2">Page</div>
                {!isFirstPage && <>
                    <div>{selectedPage.getPreviousPage(pages)?.name} </div>
                    <div className="text-lg"><FaArrowRight /></div>
                </>} {selectedPage.name}
            </div>
            <form className="edit-group ml-2" id={formId} onSubmit={handleSubmit}>
                {/* <div className="input-group">
                    <label htmlFor="page-name">Name</label>
                    <input type="text" value={selectedPage.name} onChange={undefined} id="page-name" />
                </div> */}
                <div>
                    <label htmlFor={countsInputId}>Counts</label>
                    <input
                        className="bg-transparent text-inherit ml-3 border-none"
                        type="number"
                        disabled={isFirstPage}
                        defaultValue={isFirstPage ? 0 : selectedPage.counts}
                        id={countsInputId}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                    />
                </div>
                <div>
                    <label htmlFor="page-order">Order</label>
                    <input className="bg-transparent text-inherit ml-3 border-none" type="string" value={(pages.indexOf(selectedPage) + 1) + "/" + pages.length} id="page-order" disabled={true} />
                </div>
                <div>
                    <label htmlFor="page-tempo">Tempo</label>
                    <input className="bg-transparent text-inherit ml-3 border-none" type="number" value={isFirstPage ? 0 : selectedPage.tempo} id="page-tempo" disabled={true} />
                </div>
                {/* <div>
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

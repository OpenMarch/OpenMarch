import { useSelectedPage } from "../../context/SelectedPageContext";
import { useEffect, useState } from "react";
import { usePageStore } from "@/stores/PageStore";
import Page from "@/global/classes/Page";
import { SidebarCollapsible } from "@/components/sidebar/SidebarCollapsible";
import { Input } from "../ui/Input";
import { Switch } from "../ui/Switch";

function PageEditor() {
    const { selectedPage } = useSelectedPage()!;
    const { pages } = usePageStore()!;
    const [isFirstPage, setIsFirstPage] = useState(false);

    const countsInputId = "page-counts";
    const subsetInputId = "page-subset";
    const formId = "edit-page-form";

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const counts = form[countsInputId].value;
        const subset = form[subsetInputId].checked;

        if (selectedPage) {
            Page.updatePages([
                { id: selectedPage.id, counts: counts, is_subset: subset },
            ]);
        }

        // Remove focus from the input field
        const inputField = document.getElementById(
            countsInputId,
        ) as HTMLInputElement;
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
            case "ArrowUp":
            case "ArrowRight":
                // Increase the value by 1
                currentValue++;
                break;
            case "ArrowDown":
            case "ArrowLeft":
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
        if (selectedPage) resetForm();
    }, [selectedPage]);

    useEffect(() => {
        if (pages.length > 0) {
            const firstPage = Page.getFirstPage(pages);
            setIsFirstPage(selectedPage === firstPage);
        }
    }, [pages, selectedPage]);

    if (selectedPage)
        return (
            <SidebarCollapsible
                defaultOpen
                title={`Page ${selectedPage.name}`}
                className="mt-12"
            >
                <form
                    className="edit-group flex w-full flex-col gap-16 px-6"
                    id={formId}
                    onSubmit={handleSubmit}
                >
                    {/* <div className="input-group">
                    <label htmlFor="page-name">Name</label>
                    <Input type="text" value={selectedPage.name} onChange={undefined} id="page-name" />
                </div> */}
                    <div className="flex w-full items-center justify-between">
                        <label
                            className="w-full text-body text-text/80"
                            htmlFor={countsInputId}
                        >
                            Counts
                        </label>
                        <Input
                            compact
                            type="number"
                            className="w-fit min-w-0"
                            disabled={isFirstPage}
                            defaultValue={isFirstPage ? 0 : selectedPage.counts}
                            id={countsInputId}
                            onKeyDown={handleKeyDown}
                            onBlur={handleBlur}
                        />
                    </div>
                    <div className="flex w-full items-center justify-between gap-8">
                        <label
                            htmlFor={subsetInputId}
                            className="text-body text-text/80"
                        >
                            Subset
                        </label>
                        <Switch
                            disabled={isFirstPage}
                            onClick={(e) => {
                                if (selectedPage) {
                                    Page.updatePages([
                                        {
                                            id: selectedPage.id,
                                            is_subset: !selectedPage.isSubset,
                                        },
                                    ]);
                                }
                            }}
                            checked={selectedPage?.isSubset || false}
                            id={subsetInputId}
                        />
                    </div>
                    <div className="flex w-full items-center justify-between">
                        <label className="text-body text-text/80">
                            Measures
                        </label>
                        <p className="text-body leading-none text-text">
                            {selectedPage.measureRangeString()}
                        </p>
                    </div>
                    {/* <div>
                    <label htmlFor="page-sets">Tempo</label>
                    Not yet implemented
                </div> */}
                    {/* This is here so the form submits when enter is pressed */}
                    <button type="submit" className="hidden">
                        Submit
                    </button>
                </form>
            </SidebarCollapsible>
        );
}

export default PageEditor;

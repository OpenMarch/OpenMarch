import { useSelectedPage } from "../../context/SelectedPageContext";
import { useEffect, useState } from "react";
import { SidebarCollapsible } from "@/components/sidebar/SidebarCollapsible";
import { Switch } from "../ui/Switch";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { measureRangeString, updatePages } from "@/global/classes/Page";

function PageEditor() {
    const { selectedPage } = useSelectedPage()!;
    const { pages, fetchTimingObjects } = useTimingObjectsStore()!;
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
            updatePages(
                [{ id: selectedPage.id, is_subset: subset }],
                fetchTimingObjects,
            );
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
            const firstPage = pages[0];
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
                        <div className="w-fit min-w-0">
                            {isFirstPage ? 0 : selectedPage.counts.toString()}
                        </div>
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
                                    updatePages(
                                        [
                                            {
                                                id: selectedPage.id,
                                                is_subset:
                                                    !selectedPage.isSubset,
                                            },
                                        ],
                                        fetchTimingObjects,
                                    );
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
                            {measureRangeString(selectedPage)}
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

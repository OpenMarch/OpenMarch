import { useSelectedPage } from "../../context/SelectedPageContext";
import { useEffect, useState } from "react";
import { InspectorCollapsible } from "@/components/inspector/InspectorCollapsible";
import { Button, Switch } from "@openmarch/ui";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import {
    createPages,
    measureRangeString,
    splitPage,
    updatePages,
} from "@/global/classes/Page";
import { toast } from "sonner";
import { GroupFunction } from "@/utilities/ApiFunctions";
import { T, useTolgee } from "@tolgee/react";

// TODO: figure out how to make this work with the new music system
function PageEditor() {
    const { t } = useTolgee();
    const { selectedPage } = useSelectedPage()!;
    const { pages, fetchTimingObjects } = useTimingObjectsStore()!;
    const [isFirstPage, setIsFirstPage] = useState(false);

    const countsInputId = "page-counts";
    const subsetInputId = "page-subset";
    const formId = "edit-page-form";

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
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

    const handleSplitPage = async () => {
        if (selectedPage) {
            const newPageArgs = splitPage(selectedPage);
            if (newPageArgs) {
                const functionsToExecute: (() => Promise<{
                    success: boolean;
                }>)[] = [
                    () =>
                        createPages([newPageArgs.newPageArgs], async () => {}),
                ];
                if (newPageArgs.modifyPageRequest) {
                    functionsToExecute.push(() =>
                        updatePages(
                            newPageArgs.modifyPageRequest!,
                            async () => {},
                        ),
                    );
                }
                await GroupFunction({
                    functionsToExecute,
                    refreshFunction: fetchTimingObjects,
                    useNextUndoGroup: true,
                });
                toast.success(t("inspector.page.split.success"));
            }
        }
    };

    if (selectedPage)
        return (
            <InspectorCollapsible
                defaultOpen
                title={t("inspector.page.title", {
                    pageNumber: selectedPage.name,
                })}
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
                            className="text-body text-text/80 w-full"
                            htmlFor={countsInputId}
                        >
                            <T keyName="inspector.page.counts" />
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
                            <T keyName="inspector.page.subset" />
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
                            <T keyName="inspector.page.measures" />
                        </label>
                        <p className="text-body text-text leading-none">
                            {measureRangeString(selectedPage)}
                        </p>
                    </div>
                    <Button
                        variant="secondary"
                        size="compact"
                        onClick={handleSplitPage}
                        disabled={selectedPage?.beats.length <= 1}
                    >
                        <T keyName="inspector.page.splitPage" />
                    </Button>

                    {/* <div>
                    <label htmlFor="page-sets">Tempo</label>
                    Not yet implemented
                </div> */}
                    <button type="submit" className="hidden">
                        Submit{" "}
                        {/* Does not need to be translated, is just here so that the form is submitted on Enter */}
                    </button>
                </form>
            </InspectorCollapsible>
        );
}

export default PageEditor;

import { useSelectedPage } from "../../context/SelectedPageContext";
import { useEffect, useState } from "react";
import { InspectorCollapsible } from "@/components/inspector/InspectorCollapsible";
import { Button, Switch, TextArea } from "@openmarch/ui";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import {
    createPages,
    measureRangeString,
    splitPage,
    updatePages,
} from "@/global/classes/Page";
import { toast } from "sonner";
import { GroupFunction } from "@/utilities/ApiFunctions";
import { T, useTranslate } from "@tolgee/react";

// TODO: figure out how to make this work with the new music system
function PageEditor() {
    const { t } = useTranslate();
    const { selectedPage } = useSelectedPage()!;
    const { pages, fetchTimingObjects } = useTimingObjectsStore()!;
    const [isFirstPage, setIsFirstPage] = useState(false);
    const [notes, setNotes] = useState(selectedPage?.notes || "");

    const countsInputId = "page-counts";
    const subsetInputId = "page-subset";
    const notesInputId = "page-notes";
    const formId = "edit-page-form";

    // Update notes when selected page changes
    useEffect(() => {
        if (selectedPage) {
            setNotes(selectedPage.notes || "");
        }
    }, [selectedPage]);

    const handleNotesBlur = () => {
        // Normalize both values to "" for comparison
        const currentNotes = notes || "";
        const originalNotes = selectedPage?.notes || "";

        if (selectedPage && currentNotes !== originalNotes) {
            updatePages(
                [{ id: selectedPage.id, notes: notes || null }],
                fetchTimingObjects,
            ).then((res) => {
                if (res.success) {
                    toast.success("Page notes updated");
                } else {
                    toast.error("Failed to update page notes");
                }
            });
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
                const result = await GroupFunction({
                    functionsToExecute,
                    useNextUndoGroup: true,
                });

                if (result.success) {
                    fetchTimingObjects();
                    toast.success(t("inspector.page.split.success"));
                }
            }
        }
    };

    if (selectedPage)
        return (
            <InspectorCollapsible
                defaultOpen
                translatableTitle={{
                    keyName: "inspector.page.title",
                    parameters: { pageNumber: selectedPage.name },
                }}
                className="mt-12"
            >
                <form
                    className="edit-group flex w-full flex-col gap-16 px-6"
                    id={formId}
                    onSubmit={(e) => e.preventDefault()}
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
                    <div className="input-group">
                        <label
                            htmlFor={notesInputId}
                            className="text-body text-text/80"
                        >
                            <T keyName="inspector.page.notes" />
                        </label>
                        <TextArea
                            id={notesInputId}
                            value={notes}
                            onChange={(
                                e: React.ChangeEvent<HTMLTextAreaElement>,
                            ) => setNotes(e.target.value)}
                            onBlur={handleNotesBlur}
                            placeholder={t("inspector.page.notesPlaceholder")}
                            disabled={isFirstPage}
                        />
                    </div>
                    <Button
                        variant="secondary"
                        size="compact"
                        onClick={handleSplitPage}
                        disabled={selectedPage?.beats.length <= 1}
                    >
                        <T keyName="inspector.page.splitPage" />
                    </Button>
                </form>
            </InspectorCollapsible>
        );
}

export default PageEditor;

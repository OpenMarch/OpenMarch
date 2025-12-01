import React, { useEffect } from "react";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { InspectorCollapsible } from "./InspectorCollapsible";
import { Button, Switch } from "@openmarch/ui";
import { measureRangeString } from "../../global/classes/Page";
import { T } from "@tolgee/react";
import { updatePagesMutationOptions } from "../../hooks/queries";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useSplitPage } from "./PageEditorUtils";

// TODO: figure out how to make this work with the new music system
function PageEditor() {
    const queryClient = useQueryClient();
    const { selectedPage } = useSelectedPage()!;
    const updatePagesMutation = useMutation(
        updatePagesMutationOptions(queryClient),
    );
    const splitPage = useSplitPage().mutate;
    const isFirstPage = selectedPage?.previousPageId === null;

    const countsInputId = "page-counts";
    const subsetInputId = "page-subset";
    const formId = "edit-page-form";

    const resetForm = () => {
        const form = document.getElementById(formId) as HTMLFormElement;
        if (form) form.reset();
    };

    // Reset the form when the selected page changes so the values are correct
    useEffect(() => {
        if (selectedPage) resetForm();
    }, [selectedPage]);

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
                                    updatePagesMutation.mutate({
                                        modifiedPagesArgs: [
                                            {
                                                id: selectedPage.id,
                                                is_subset:
                                                    !selectedPage.isSubset,
                                            },
                                        ],
                                    });
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
                        onClick={() => splitPage({ page: selectedPage })}
                        disabled={selectedPage?.beats.length <= 1}
                    >
                        <T keyName="inspector.page.splitPage" />
                    </Button>
                </form>
            </InspectorCollapsible>
        );
}

export default PageEditor;

import React, { useEffect, useId } from "react";
import { InspectorCollapsible } from "./InspectorCollapsible";
import { Button, Switch } from "@openmarch/ui";
import { measureRangeString } from "../../global/classes/Page";
import { T } from "@tolgee/react";
import { updatePagesMutationOptions } from "../../hooks/queries";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useSplitPage } from "./PageEditorUtils";
import { useInspectorPage } from "./InspectorPageContext";
import { Help } from "./InspectorFields";
import { useCompactInspector } from "./useCompactInspector";
import { useAutoFold } from "./useAutoFold";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";

// TODO: figure out how to make this work with the new music system
function PageEditor() {
    const queryClient = useQueryClient();
    // While timeline playback runs, the page being played (the selected page waits for the stop)
    const { page: selectedPage, playing } = useInspectorPage();
    const updatePagesMutation = useMutation(
        updatePagesMutationOptions(queryClient),
    );
    const splitPage = useSplitPage().mutate;
    const isFirstPage = selectedPage?.previousPageId === null;
    // Tablet layout: fold the page section while marchers are selected so their
    // coordinates fit; it goes back to how it was when the selection clears
    const compact = useCompactInspector();
    const hasMarchersSelected =
        (useSelectedMarchers()?.selectedMarchers.length ?? 0) > 0;
    const folded = compact && hasMarchersSelected;
    const [open, setOpen] = useAutoFold(folded);

    const countsInputId = "page-counts";
    const subsetInputId = "page-subset";
    const formId = "edit-page-form";
    // A page of 1 count can't be cut in two: the button says why instead of failing
    const tooShortToSplit = (selectedPage?.beats.length ?? 0) <= 1;
    const splitReasonId = useId();

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
                // Folding keeps the form mounted, so a half-typed value survives
                open={open}
                onOpenChange={setOpen}
                keepMounted
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
                            disabled={isFirstPage || playing}
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
                    {/* The first page is the show's 0-count start: there's nothing to split */}
                    {!isFirstPage && (
                        <Button
                            variant="secondary"
                            size="compact"
                            onClick={() => splitPage({ page: selectedPage })}
                            disabled={tooShortToSplit || playing}
                            aria-describedby={
                                tooShortToSplit && !playing
                                    ? splitReasonId
                                    : undefined
                            }
                        >
                            <T keyName="inspector.page.splitPage" />
                        </Button>
                    )}
                    {!isFirstPage && tooShortToSplit && !playing && (
                        <Help
                            id={splitReasonId}
                            testId="inspector-page-split-reason"
                        >
                            <T keyName="pages.splitNeedsTwoCounts" />
                        </Help>
                    )}
                    {/* The page being played changes under the pointer: its edits wait */}
                    {playing && (
                        <Help testId="inspector-page-paused">
                            <T keyName="inspector.page.paused" />
                        </Help>
                    )}
                </form>
            </InspectorCollapsible>
        );
}

export default PageEditor;

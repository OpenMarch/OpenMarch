import React, { useEffect, useRef, useState } from "react";
import { T, useTranslate } from "@tolgee/react";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { updatePagesMutationOptions } from "../../hooks/queries";
import { NotesRichTextEditor } from "../notes/NotesRichTextEditor";

export function PageNotesSection() {
    const { selectedPage } = useSelectedPage()!;
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const updatePagesMutation = useMutation(
        updatePagesMutationOptions(queryClient),
    );

    const [notes, setNotes] = useState(selectedPage?.notes || "");
    const editingPageIdRef = useRef<number | null>(null);

    // Keep local notes in sync with the currently selected page
    useEffect(() => {
        if (selectedPage) {
            setNotes(selectedPage.notes || "");
            // Reset the editing ref when page changes to ensure we can save on the new page
            editingPageIdRef.current = selectedPage.id;
        }
    }, [selectedPage]);

    const handleNotesBlur = (nextNotesHtml: string) => {
        const currentSelectedPageId = selectedPage?.id;

        // If no page is selected, do nothing
        if (
            currentSelectedPageId === null ||
            currentSelectedPageId === undefined
        ) {
            return;
        }

        // Guard against saving to wrong page if selection changed during editing
        if (editingPageIdRef.current !== currentSelectedPageId) {
            console.warn("Page changed during editing, skipping save");
            return;
        }

        const pageIdToSave = editingPageIdRef.current;

        const currentNotes = nextNotesHtml || "";
        const originalNotes = selectedPage?.notes || "";

        if (currentNotes === originalNotes) return;

        setNotes(currentNotes);

        updatePagesMutation.mutate({
            modifiedPagesArgs: [
                {
                    id: pageIdToSave,
                    notes: currentNotes || null,
                },
            ],
        });
    };

    if (!selectedPage) return null;

    return (
        <section aria-label={t("inspector.page.notes")}>
            <div className="border-stroke border-t pt-12">
                <h3 className="text-h5 text-text mb-8">
                    <T keyName="inspector.page.notes" />
                </h3>
                <div className="input-group">
                    <NotesRichTextEditor
                        value={notes}
                        onChange={setNotes}
                        onBlur={handleNotesBlur}
                        onEditorFocus={() => {
                            if (selectedPage) {
                                editingPageIdRef.current = selectedPage.id;
                            }
                        }}
                    />
                </div>
            </div>
        </section>
    );
}

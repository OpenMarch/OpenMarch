import React, { useEffect, useState } from "react";
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

    // Keep local notes in sync with the currently selected page
    useEffect(() => {
        if (selectedPage) {
            setNotes(selectedPage.notes || "");
        }
    }, [selectedPage]);

    const handleNotesBlur = (nextNotesHtml: string) => {
        if (!selectedPage) return;

        const currentNotes = nextNotesHtml || "";
        const originalNotes = selectedPage.notes || "";

        if (currentNotes === originalNotes) return;

        setNotes(currentNotes);

        updatePagesMutation.mutate({
            modifiedPagesArgs: [
                {
                    id: selectedPage.id,
                    notes: currentNotes || null,
                },
            ],
        });
    };

    if (!selectedPage) return null;

    return (
        <section aria-label={t("inspector.page.notes")}>
            <div className="border-border border-t pt-12">
                <h3 className="text-h5 text-text mb-8">
                    <T keyName="inspector.page.notes" />
                </h3>
                <div className="input-group">
                    <div className="rounded-6 border-border bg-bg h-[12rem] overflow-y-auto border">
                        <NotesRichTextEditor
                            value={notes}
                            onChange={setNotes}
                            onBlur={handleNotesBlur}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}

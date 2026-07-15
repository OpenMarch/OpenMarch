import React, { useEffect, useMemo, useRef, useState } from "react";
import { T, useTranslate } from "@tolgee/react";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { updatePagesMutationOptions } from "../../hooks/queries";
import { NotesRichTextEditor } from "../notes/NotesRichTextEditor";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useTimingObjects } from "@/hooks";

export function PageNotesSection() {
    const { selectedPage } = useSelectedPage()!;
    const { isPlaying } = useIsPlaying()!;
    const { pages } = useTimingObjects()!;
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const updatePagesMutation = useMutation(
        updatePagesMutationOptions(queryClient),
    );

    // During playback, selectedPage is the departure page — show the next page's notes instead
    const displayPage = useMemo(() => {
        if (!isPlaying || !selectedPage?.nextPageId) return selectedPage;
        return (
            pages.find((p) => p.id === selectedPage.nextPageId) ?? selectedPage
        );
    }, [isPlaying, selectedPage, pages]);

    const [notes, setNotes] = useState(displayPage?.notes || "");
    const editingPageIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (displayPage && (isPlaying || editingPageIdRef.current === null)) {
            setNotes(displayPage.notes || "");
        }
    }, [displayPage, isPlaying]);

    const handleNotesBlur = (nextNotesHtml: string) => {
        if (!displayPage) return;

        // Guard: only save if we're still on the page where editing began
        const pageIdWhereEditingBegan = editingPageIdRef.current;
        if (
            pageIdWhereEditingBegan === null ||
            pageIdWhereEditingBegan !== displayPage.id
        ) {
            editingPageIdRef.current = null;
            if (pageIdWhereEditingBegan !== null) {
                console.warn("Page changed during editing, skipping save");
                setNotes(displayPage.notes || "");
            }
            return;
        }

        const currentNotes = nextNotesHtml || "";
        const originalNotes = displayPage.notes || "";

        if (currentNotes === originalNotes) {
            editingPageIdRef.current = null;
            return;
        }

        setNotes(currentNotes);
        updatePagesMutation.mutate(
            {
                modifiedPagesArgs: [
                    {
                        id: pageIdWhereEditingBegan,
                        notes: currentNotes || null,
                    },
                ],
            },
            {
                onSettled: () => {
                    editingPageIdRef.current = null;
                },
            },
        );
    };

    if (!displayPage) return null;

    return (
        <section aria-label={t("inspector.page.notes")}>
            <div className="border-stroke border-t pt-12">
                <h3 className="text-h5 text-text mb-8">
                    <T keyName="inspector.page.notes" />
                </h3>
                <div className="input-group">
                    <NotesRichTextEditor
                        value={notes}
                        editable={!isPlaying}
                        onChange={setNotes}
                        onBlur={handleNotesBlur}
                        onEditorFocus={() => {
                            if (displayPage) {
                                editingPageIdRef.current = displayPage.id;
                            }
                        }}
                    />
                </div>
            </div>
        </section>
    );
}

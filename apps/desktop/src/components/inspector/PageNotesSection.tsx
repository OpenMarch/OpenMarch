import { useEffect, useRef, useState } from "react";
import { T, useTranslate } from "@tolgee/react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { updatePagesMutationOptions } from "../../hooks/queries";
import { NotesRichTextEditor } from "../notes/NotesRichTextEditor";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useInspectedPage } from "@/hooks";

/**
 * Inspector section that shows and edits the notes for the page currently
 * under inspection.
 *
 * The displayed page comes from {@link useInspectedPage}, which returns the
 * next page during playback so notes for the upcoming target are visible
 * while marchers are still moving.
 */
export function PageNotesSection() {
    const displayPage = useInspectedPage();
    const { isPlaying } = useIsPlaying()!;
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const updatePagesMutation = useMutation(
        updatePagesMutationOptions(queryClient),
    );

    const [notes, setNotes] = useState(displayPage?.notes || "");
    const editingPageIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (displayPage && (isPlaying || editingPageIdRef.current === null)) {
            setNotes(displayPage.notes || "");
        }
    }, [displayPage, isPlaying]);

    /**
     * Persists the editor's contents when the user blurs the rich-text field.
     *
     * Skips the save when the inspected page changed mid-edit (e.g. playback
     * advanced to the next page) to avoid writing the previous page's text
     * onto a different page.
     */
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

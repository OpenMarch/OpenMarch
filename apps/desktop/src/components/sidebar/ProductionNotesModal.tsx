import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import {
    XIcon,
    PlusIcon,
    PencilIcon,
    TrashIcon,
    CheckIcon,
} from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import { NotePencilIcon } from "@phosphor-icons/react/dist/ssr";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import ProductionNote, {
    createProductionNotes,
    updateProductionNotes,
    deleteProductionNotes,
    getProductionNotesByPage,
    fromDatabaseProductionNotes,
} from "@/global/classes/ProductionNote";

export default function ProductionNotesModal() {
    return (
        <SidebarModalLauncher
            contents={<ProductionNotesContents />}
            newContentId="production-note"
            buttonLabel={<NotePencilIcon size={24} />}
            width="wide"
        />
    );
}

export function ProductionNotesContents() {
    const { toggleOpen } = useSidebarModalStore();
    const selectedPageContext = useSelectedPage();
    const [notes, setNotes] = useState<ProductionNote[]>([]);
    const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState<string>("");
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const selectedPage = selectedPageContext?.selectedPage;
    const MAX_NOTES = 5;

    // Fetch notes for the selected page
    const fetchNotes = async () => {
        if (!selectedPage) {
            setNotes([]);
            return;
        }

        try {
            const response = await getProductionNotesByPage(selectedPage.id);
            if (response.success) {
                const productionNotes = fromDatabaseProductionNotes(
                    response.data,
                );
                setNotes(productionNotes);
            } else {
                console.error("Failed to fetch notes:", response.error);
                toast.error("Failed to load production notes");
                setNotes([]);
            }
        } catch (error) {
            console.error("Error fetching notes:", error);
            toast.error("Failed to load production notes");
            setNotes([]);
        }
    };

    // Update notes when selected page changes
    useEffect(() => {
        setEditingNoteId(null);
        setEditingContent("");
        setLastSaved(null);
        fetchNotes();
    }, [selectedPage]);

    // Add new note
    const handleAddNote = () => {
        if (notes.length >= MAX_NOTES) {
            toast.error(`Maximum of ${MAX_NOTES} notes allowed per page`);
            return;
        }

        if (!selectedPage) {
            toast.error("No page selected");
            return;
        }

        // Create a temporary note ID for editing (will be replaced when saved)
        const tempId = -Date.now(); // Use negative number to avoid conflicts
        setEditingNoteId(tempId);
        setEditingContent("");
    };

    // Start editing a note
    const handleEditNote = (noteId: number) => {
        const note = notes.find((n) => n.id === noteId);
        if (note) {
            setEditingNoteId(noteId);
            setEditingContent(note.content);
        }
    };

    // Cancel editing
    const handleCancelEdit = () => {
        setEditingNoteId(null);
        setEditingContent("");
    };

    // Publish/save a note
    const handlePublishNote = async () => {
        if (!editingNoteId || !selectedPage) return;

        const trimmedContent = editingContent.trim();
        if (!trimmedContent) {
            toast.error("Note content cannot be empty");
            return;
        }

        setIsSaving(true);
        try {
            if (editingNoteId < 0) {
                // Creating a new note
                const response = await createProductionNotes(
                    [
                        {
                            page_id: selectedPage.id,
                            content: trimmedContent,
                            is_published: true,
                            order_index: notes.length,
                        },
                    ],
                    fetchNotes,
                );

                if (response.success) {
                    setLastSaved(new Date());
                    setEditingNoteId(null);
                    setEditingContent("");
                    toast.success("Note created successfully");
                } else {
                    console.error("Failed to create note:", response.error);
                    toast.error("Failed to create production note");
                }
            } else {
                // Updating existing note
                const response = await updateProductionNotes(
                    [
                        {
                            id: editingNoteId,
                            content: trimmedContent,
                            is_published: true,
                        },
                    ],
                    fetchNotes,
                );

                if (response.success) {
                    setLastSaved(new Date());
                    setEditingNoteId(null);
                    setEditingContent("");
                    toast.success("Note updated successfully");
                } else {
                    console.error("Failed to update note:", response.error);
                    toast.error("Failed to update production note");
                }
            }
        } catch (error) {
            console.error("Error saving note:", error);
            toast.error("Failed to save production note");
        } finally {
            setIsSaving(false);
        }
    };

    // Delete a note
    const handleDeleteNote = async (noteId: number) => {
        if (noteId < 0) {
            // Just cancel editing for temporary notes
            handleCancelEdit();
            return;
        }

        setIsSaving(true);
        try {
            const response = await deleteProductionNotes(
                new Set([noteId]),
                fetchNotes,
            );
            if (response.success) {
                setLastSaved(new Date());
                if (editingNoteId === noteId) {
                    setEditingNoteId(null);
                    setEditingContent("");
                }
                toast.success("Note deleted successfully");
            } else {
                console.error("Failed to delete note:", response.error);
                toast.error("Failed to delete production note");
            }
        } catch (error) {
            console.error("Error deleting note:", error);
            toast.error("Failed to delete production note");
        } finally {
            setIsSaving(false);
        }
    };

    const publishedNotes = notes.filter((note) => note.isPublished);
    const hasUnsavedChanges = editingNoteId !== null;
    const isCreatingNewNote = editingNoteId !== null && editingNoteId < 0;

    return (
        <div className="text-text flex h-full flex-col gap-16">
            <header className="flex items-center justify-between gap-16">
                <h4 className="text-h4 leading-none">Production Notes</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-16">
                {selectedPage ? (
                    <>
                        <div className="flex flex-col gap-8">
                            <div className="flex items-center justify-between">
                                <h5 className="text-h5 text-text-muted">
                                    Page {selectedPage.name}
                                </h5>
                                <div className="text-text-muted flex items-center gap-8 text-xs">
                                    {isSaving && (
                                        <span className="text-accent">
                                            Saving...
                                        </span>
                                    )}
                                    {hasUnsavedChanges && !isSaving && (
                                        <span className="text-accent">
                                            Editing...
                                        </span>
                                    )}
                                    {lastSaved &&
                                        !hasUnsavedChanges &&
                                        !isSaving && (
                                            <span>
                                                Saved{" "}
                                                {lastSaved.toLocaleTimeString()}
                                            </span>
                                        )}
                                </div>
                            </div>
                            <div className="text-text-muted text-sm">
                                {selectedPage.measures
                                    ? `Measures: ${selectedPage.measures[0]?.number || "N/A"} - ${selectedPage.measures[selectedPage.measures.length - 1]?.number || "N/A"}`
                                    : "No measures"}
                                {" • "}
                                {selectedPage.counts} counts
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col gap-12">
                            <div className="flex items-center justify-between">
                                <label className="text-text text-sm font-medium">
                                    Notes ({publishedNotes.length}/{MAX_NOTES})
                                </label>
                                <Button
                                    onClick={handleAddNote}
                                    disabled={
                                        isSaving ||
                                        notes.length >= MAX_NOTES ||
                                        hasUnsavedChanges
                                    }
                                    variant="primary"
                                    size="compact"
                                >
                                    <PlusIcon size={16} className="mr-4" />
                                    Add Note
                                </Button>
                            </div>

                            <div className="flex flex-1 flex-col gap-8 overflow-y-auto">
                                {/* Published Notes */}
                                {publishedNotes.map((note) => (
                                    <div
                                        key={note.id}
                                        className="rounded-6 border-stroke bg-bg-2 border p-12"
                                    >
                                        {editingNoteId === note.id ? (
                                            <div className="flex flex-col gap-8">
                                                <textarea
                                                    value={editingContent}
                                                    onChange={(e) =>
                                                        setEditingContent(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="Enter note content..."
                                                    className="rounded-4 border-stroke bg-bg text-text placeholder-text-muted focus:border-accent min-h-[100px] w-full resize-y border px-8 py-6 text-sm focus:outline-none"
                                                    disabled={isSaving}
                                                    autoFocus
                                                />
                                                <div className="flex items-center gap-8">
                                                    <Button
                                                        onClick={
                                                            handlePublishNote
                                                        }
                                                        disabled={
                                                            isSaving ||
                                                            !editingContent.trim()
                                                        }
                                                        variant="primary"
                                                        size="compact"
                                                    >
                                                        <CheckIcon
                                                            size={16}
                                                            className="mr-4"
                                                        />
                                                        Save
                                                    </Button>
                                                    <Button
                                                        onClick={
                                                            handleCancelEdit
                                                        }
                                                        disabled={isSaving}
                                                        variant="secondary"
                                                        size="compact"
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-8">
                                                <div className="flex items-start justify-between gap-8">
                                                    <p className="text-text flex-1 text-sm leading-relaxed">
                                                        {note.content}
                                                    </p>
                                                    <div className="flex items-center gap-4">
                                                        <button
                                                            onClick={() =>
                                                                handleEditNote(
                                                                    note.id,
                                                                )
                                                            }
                                                            disabled={
                                                                isSaving ||
                                                                hasUnsavedChanges
                                                            }
                                                            className="text-text-muted hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            <PencilIcon
                                                                size={16}
                                                            />
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                handleDeleteNote(
                                                                    note.id,
                                                                )
                                                            }
                                                            disabled={
                                                                isSaving ||
                                                                hasUnsavedChanges
                                                            }
                                                            className="text-text-muted hover:text-red disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            <TrashIcon
                                                                size={16}
                                                            />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="text-text-muted text-xs">
                                                    Created:{" "}
                                                    {new Date(
                                                        note.createdAt,
                                                    ).toLocaleString()}
                                                    {note.updatedAt !==
                                                        note.createdAt && (
                                                        <span>
                                                            {" "}
                                                            • Updated:{" "}
                                                            {new Date(
                                                                note.updatedAt,
                                                            ).toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Draft Note (being created) */}
                                {isCreatingNewNote && (
                                    <div className="rounded-6 border-accent bg-bg-2 border p-12">
                                        <div className="flex flex-col gap-8">
                                            <div className="text-accent flex items-center gap-8 text-xs">
                                                <span>New Note</span>
                                            </div>
                                            <textarea
                                                value={editingContent}
                                                onChange={(e) =>
                                                    setEditingContent(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Enter note content...

Examples:
• Tempo change at measure 16
• Watch for tight spacing in this section
• Emphasize the crescendo here
• Formation change happens on count 8"
                                                className="rounded-4 border-stroke bg-bg text-text placeholder-text-muted focus:border-accent min-h-[120px] w-full resize-y border px-8 py-6 text-sm focus:outline-none"
                                                disabled={isSaving}
                                                autoFocus
                                            />
                                            <div className="flex items-center gap-8">
                                                <Button
                                                    onClick={handlePublishNote}
                                                    disabled={
                                                        isSaving ||
                                                        !editingContent.trim()
                                                    }
                                                    variant="primary"
                                                    size="compact"
                                                >
                                                    <CheckIcon
                                                        size={16}
                                                        className="mr-4"
                                                    />
                                                    Create Note
                                                </Button>
                                                <Button
                                                    onClick={handleCancelEdit}
                                                    disabled={isSaving}
                                                    variant="secondary"
                                                    size="compact"
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Empty State */}
                                {publishedNotes.length === 0 &&
                                    !isCreatingNewNote && (
                                        <div className="flex flex-col items-center justify-center gap-16 py-32 text-center">
                                            <NotePencilIcon
                                                size={48}
                                                className="text-text-muted"
                                            />
                                            <div>
                                                <h5 className="text-h5 text-text-muted mb-4">
                                                    No Notes Yet
                                                </h5>
                                                <p className="text-text-muted text-sm">
                                                    Add a production note for
                                                    this page
                                                </p>
                                            </div>
                                        </div>
                                    )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center gap-16 py-32 text-center">
                        <NotePencilIcon size={48} className="text-text-muted" />
                        <div>
                            <h5 className="text-h5 text-text-muted mb-4">
                                No Page Selected
                            </h5>
                            <p className="text-text-muted text-sm">
                                Select a page to add production notes
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

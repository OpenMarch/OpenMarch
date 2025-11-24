import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import HardBreak from "@tiptap/extension-hard-break";
import clsx from "clsx";

type NotesRichTextEditorProps = {
    value: string;
    /** Optional; called when the editor commits content (on blur). */
    onChange?: (next: string) => void;
    /** Receives the latest HTML when the editor loses focus. */
    onBlur?: (next: string) => void;
    /** Called when the editor element receives focus. */
    onEditorFocus?: () => void;
    className?: string;
};

/**
 * Rich text editor used for page notes.
 *
 * - Uses HTML as the underlying storage format.
 * - Supports basic formatting (bold, italic, lists, headings) via Tiptap.
 * - Emits the current HTML string on every document update.
 */
export function NotesRichTextEditor({
    value,
    onChange,
    onBlur,
    onEditorFocus,
    className,
}: NotesRichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Keep the set small to speed up parsing/rendering for long notes.
                history: false,
                codeBlock: false,
                blockquote: false,
                // We handle Enter as a hard break ourselves to avoid extra paragraph spacing.
                hardBreak: false,
            }),
            HardBreak.extend({
                addKeyboardShortcuts() {
                    return {
                        // Treat Enter as a single line break, not a new paragraph.
                        Enter: () =>
                            this.editor.chain().focus().setHardBreak().run(),
                    };
                },
            }),
        ],
        content: value || "",
        editorProps: {
            attributes: {
                class: clsx(
                    // Typography and spacing only; container handles borders/height.
                    "prose max-w-none w-full px-8 py-6 text-body text-text focus-visible:outline-none",
                    className,
                ),
                spellcheck: "true",
                autocapitalize: "sentences",
                autocomplete: "off",
            },
        },
        onBlur({ editor }) {
            const html = editor.getHTML();
            onChange?.(html);
            onBlur?.(html);
        },
    });

    // Keep editor content in sync when the external value changes (e.g. page switched)
    useEffect(() => {
        if (!editor) return;

        // Fast-path: if both the prop and editor are effectively empty, skip any work.
        if (!value && editor.isEmpty) {
            return;
        }

        const current = editor.getHTML();
        if (value !== current) {
            // Use setContent with emitUpdate = false to avoid cascading updates.
            editor.commands.setContent(value || "", false);
        }
    }, [editor, value]);

    return <EditorContent editor={editor} onFocus={onEditorFocus} />;
}

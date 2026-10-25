import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import { NotesRichTextEditor } from "../NotesRichTextEditor";

/** Tiptap attaches the editor instance to its ProseMirror element. */
function getEditor(container: HTMLElement): Editor {
    const dom = container.querySelector(".ProseMirror") as
        (HTMLElement & { editor?: Editor }) | null;
    if (!dom?.editor) throw new Error("Editor not mounted");
    return dom.editor;
}

function getEditorDom(container: HTMLElement): HTMLElement {
    return container.querySelector(".ProseMirror") as HTMLElement;
}

// Page notes are stored as the editor's HTML. Every format the toolbar-less
// editor can produce must load and save back byte for byte.
const STORED_NOTES = [
    "<p>Plain text</p>",
    "<p>Line one<br>Line two<br>Line three</p>",
    "<p><strong>Bold</strong> <em>italic</em> <s>strike</s> <code>code</code></p>",
    "<h2>Heading</h2><p>Body</p>",
    "<ul><li><p>One</p></li><li><p>Two</p></li></ul>",
    "<ol><li><p>First</p></li><li><p>Second<br>more</p></li></ol>",
    "<p>Before</p><hr><p>After</p>",
    "<p>Ends with a heading</p><h3>Last</h3>",
];

describe("NotesRichTextEditor", () => {
    afterEach(() => {
        cleanup();
    });

    it.each(STORED_NOTES)("loads and saves %s unchanged", async (html) => {
        const onBlur = vi.fn();
        const onChange = vi.fn();
        const { container } = render(
            <NotesRichTextEditor
                value={html}
                onBlur={onBlur}
                onChange={onChange}
            />,
        );

        const editor = getEditor(container);
        expect(editor.getHTML()).toBe(html);

        act(() => {
            fireEvent.focus(getEditorDom(container));
            fireEvent.blur(getEditorDom(container));
        });

        // setEditable on mount emits one update with the loaded HTML.
        for (const [emitted] of onChange.mock.calls) expect(emitted).toBe(html);
        expect(onBlur).toHaveBeenLastCalledWith(html);
    });

    it("keeps the same schema as before: no links or underline", () => {
        const { container } = render(
            <NotesRichTextEditor value='<p><a href="https://example.com">link</a> <u>under</u></p>' />,
        );
        const editor = getEditor(container);

        expect(editor.getHTML()).toBe("<p>link under</p>");
        expect(editor.schema.marks.link).toBeUndefined();
        expect(editor.schema.marks.underline).toBeUndefined();
        expect(editor.schema.nodes.codeBlock).toBeUndefined();
        expect(editor.schema.nodes.blockquote).toBeUndefined();
    });

    it("emits HTML for typed edits and formatting", () => {
        const onChange = vi.fn();
        const { container } = render(
            <NotesRichTextEditor value="<p>Hello</p>" onChange={onChange} />,
        );
        const editor = getEditor(container);

        act(() => {
            editor.chain().focus("end").insertContent(" world").run();
        });
        expect(onChange).toHaveBeenLastCalledWith("<p>Hello world</p>");

        act(() => {
            editor.chain().selectAll().toggleBold().run();
        });
        expect(onChange).toHaveBeenLastCalledWith(
            "<p><strong>Hello world</strong></p>",
        );
    });

    it("turns Enter into a line break, not a new paragraph", () => {
        const onChange = vi.fn();
        const { container } = render(
            <NotesRichTextEditor value="<p>One</p>" onChange={onChange} />,
        );
        const editor = getEditor(container);

        act(() => {
            editor.commands.focus("end");
            fireEvent.keyDown(getEditorDom(container), {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
            });
        });
        act(() => {
            editor.commands.insertContent("Two");
        });

        expect(editor.getHTML()).toBe("<p>One<br>Two</p>");
    });

    it("replaces content when the value prop changes without emitting a change", () => {
        const onChange = vi.fn();
        const { container, rerender } = render(
            <NotesRichTextEditor value="<p>Page 1</p>" onChange={onChange} />,
        );

        rerender(
            <NotesRichTextEditor
                value="<p><strong>Page 2</strong></p>"
                onChange={onChange}
            />,
        );
        expect(getEditor(container).getHTML()).toBe(
            "<p><strong>Page 2</strong></p>",
        );

        rerender(<NotesRichTextEditor value="" onChange={onChange} />);
        expect(getEditor(container).isEmpty).toBe(true);

        // Only the mount-time update (from setEditable) reaches onChange.
        for (const [emitted] of onChange.mock.calls)
            expect(emitted).toBe("<p>Page 1</p>");
    });

    it("follows the editable prop", () => {
        const { container, rerender } = render(
            <NotesRichTextEditor value="<p>Notes</p>" editable={false} />,
        );
        expect(getEditor(container).isEditable).toBe(false);

        rerender(<NotesRichTextEditor value="<p>Notes</p>" editable />);
        expect(getEditor(container).isEditable).toBe(true);
    });
});

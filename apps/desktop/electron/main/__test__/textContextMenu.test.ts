// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { setMainLanguage } from "../i18n";
import { textContextMenuTemplate } from "../textContextMenu";

// A Japanese file of the test's own, so a translation pull can't change what it checks
vi.mock("../../../i18n/ja.json", () => ({
    default: { menu: { edit: { copy: "コピー" } } },
}));

afterEach(() => {
    setMainLanguage("en");
});

const params = {
    misspelledWord: "",
    dictionarySuggestions: [] as string[],
    isEditable: true,
    selectionText: "",
};

describe("the text context menu", () => {
    it("labels every role item, since Electron's role labels are English only", () => {
        const template = textContextMenuTemplate(params, vi.fn());
        const roles = template.filter((item) => item.role);
        expect(roles.map((item) => item.role)).toEqual([
            "undo",
            "redo",
            "cut",
            "copy",
            "paste",
            "selectAll",
        ]);
        expect(roles.map((item) => item.label)).toEqual([
            "Undo",
            "Redo",
            "Cut",
            "Copy",
            "Paste",
            "Select All",
        ]);
    });

    it("is built in the app language of the moment it opens", () => {
        setMainLanguage("ja");
        const japanese = textContextMenuTemplate(params, vi.fn());
        setMainLanguage("en");
        const english = textContextMenuTemplate(params, vi.fn());
        const copy = (template: typeof english) =>
            template.find((item) => item.role === "copy")?.label;
        expect(copy(english)).toBe("Copy");
        expect(copy(japanese)).toBe("コピー");
    });

    it("offers spelling suggestions, and only Copy and Select All over selected text", () => {
        const replace = vi.fn();
        const template = textContextMenuTemplate(
            {
                ...params,
                isEditable: false,
                misspelledWord: "marcher",
                dictionarySuggestions: ["marcher", "marchers"],
                selectionText: "text",
            },
            replace,
        );
        expect(template.map((item) => item.label ?? item.type)).toEqual([
            "marcher",
            "marchers",
            "separator",
            "Copy",
            "Select All",
        ]);
        (template[1]!.click as () => void)();
        expect(replace).toHaveBeenCalledWith("marchers");
        expect(
            textContextMenuTemplate({ ...params, isEditable: false }, vi.fn()),
        ).toEqual([]);
    });
});

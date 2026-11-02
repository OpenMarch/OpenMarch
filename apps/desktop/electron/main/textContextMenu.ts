import type { ContextMenuParams, MenuItemConstructorOptions } from "electron";
import { t } from "./i18n";

/**
 * The right-click menu of a window's page: spelling suggestions for a misspelled word, then the
 * edit actions of a text field, or Copy and Select All over selected text. Empty when there's
 * nothing to offer. Built for each popup, so its labels follow the app language; every role item
 * has a label because Electron's own role labels are English only.
 */
export function textContextMenuTemplate(
    params: Pick<
        ContextMenuParams,
        | "misspelledWord"
        | "dictionarySuggestions"
        | "isEditable"
        | "selectionText"
    >,
    replaceMisspelling: (suggestion: string) => void,
): MenuItemConstructorOptions[] {
    const template: MenuItemConstructorOptions[] = [];

    if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
        template.push(
            ...params.dictionarySuggestions.map((suggestion) => ({
                label: suggestion,
                click: () => replaceMisspelling(suggestion),
            })),
            { type: "separator" },
        );
    }

    const copy: MenuItemConstructorOptions = {
        role: "copy",
        label: t("menu.edit.copy"),
    };
    const selectAll: MenuItemConstructorOptions = {
        role: "selectAll",
        label: t("menu.edit.selectAll"),
    };
    if (params.isEditable) {
        template.push(
            { role: "undo", label: t("menu.edit.undo") },
            { role: "redo", label: t("menu.edit.redo") },
            { type: "separator" },
            { role: "cut", label: t("menu.edit.cut") },
            copy,
            { role: "paste", label: t("menu.edit.paste") },
            { type: "separator" },
            selectAll,
        );
    } else if (params.selectionText && params.selectionText.trim()) {
        template.push(copy, selectAll);
    }

    return template;
}

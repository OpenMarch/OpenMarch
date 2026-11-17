/**
 * The Edit field mode's panes (#824), for the keyboard: the field (where Tab and Shift+Tab walk
 * the lines) and the Field panel. F6 moves to the next one and Shift+F6 to the previous,
 * as in VS Code and the browsers. Each pane marks itself with `data-field-edit-pane`.
 */
export const FIELD_EDIT_PANES = ["field", "panel"] as const;
export type FieldEditPane = (typeof FIELD_EDIT_PANES)[number];

const FOCUSABLE = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(", ");

/** The pane the keyboard is in: the field when nothing in a pane has focus */
export function currentFieldEditPane(): FieldEditPane {
    const active = document.activeElement;
    const pane =
        active instanceof HTMLElement
            ? active.closest<HTMLElement>("[data-field-edit-pane]")?.dataset
                  .fieldEditPane
            : undefined;
    return FIELD_EDIT_PANES.includes(pane as FieldEditPane)
        ? (pane as FieldEditPane)
        : "field";
}

/**
 * Moves the keyboard to the next pane (`step` 1) or the previous one (-1): into the field
 * itself, or onto the first control of the panel. Returns the pane it went to.
 */
export function focusFieldEditPane(step: 1 | -1): FieldEditPane | null {
    let index = FIELD_EDIT_PANES.indexOf(currentFieldEditPane());
    for (let tries = 0; tries < FIELD_EDIT_PANES.length; tries++) {
        index =
            (index + step + FIELD_EDIT_PANES.length) % FIELD_EDIT_PANES.length;
        const name = FIELD_EDIT_PANES[index]!;
        const pane = document.querySelector<HTMLElement>(
            `[data-field-edit-pane="${name}"]`,
        );
        if (!pane) continue;
        const target =
            name === "field"
                ? pane
                : [...pane.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
                      (el) => !el.closest("[hidden], [inert]"),
                  );
        if (!target) continue;
        target.focus({ preventScroll: name === "field" });
        return name;
    }
    return null;
}

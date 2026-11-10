/**
 * The app's popup styles: one surface for popovers and menus (`rounded-6`, `bg-modal`,
 * `backdrop-blur-32`, `shadow-modal`), and body-size menu entries with `rounded-4` highlights.
 * For Radix popovers and menus, and for ones drawn by hand at a pointer (tempo lanes, the field).
 * See docs/conventions/ui-styling.md.
 */

/**
 * A popover's panel: the same surface as tooltips and menus, with room inside. Add the layout
 * (`flex flex-col gap-8`), a width and, for one placed by hand, `fixed` and a z-index.
 */
export const POPOVER_CLASS =
    "bg-modal text-text rounded-6 border-stroke shadow-modal backdrop-blur-32 border p-12";

/** A menu's panel. Add a width (`min-w-*`) where the menu needs one. */
export const MENU_CONTENT_CLASS =
    "bg-modal text-text rounded-6 border-stroke shadow-modal backdrop-blur-32 z-50 flex flex-col gap-2 border p-4";

/**
 * One Radix entry: Radix sets `data-highlighted` and `data-disabled`. The highlight is the text
 * color, faint: `bg-fg-2` is a near-white wash that barely shows on the menu's own surface.
 */
export const MENU_ITEM_CLASS =
    "rounded-4 text-body data-[highlighted]:bg-text/10 flex cursor-default items-center gap-8 px-8 py-4 text-left outline-hidden select-none data-[disabled]:opacity-50";

/** One entry of a menu drawn by hand, a plain `<button>`: the same look from hover and focus */
export const MENU_BUTTON_CLASS =
    "rounded-4 text-body enabled:hover:bg-text/10 focus-visible:bg-text/10 flex cursor-default items-center gap-8 px-8 py-4 text-left outline-hidden select-none disabled:opacity-50";

/** A heading row at the top of a menu (what the menu acts on) */
export const MENU_LABEL_CLASS =
    "text-sub text-text-subtitle flex items-baseline justify-between gap-12 px-8 py-4";

/** A line between groups of entries */
export const MENU_SEPARATOR_CLASS = "bg-stroke mx-4 my-2 h-px";

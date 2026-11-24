import { create } from "zustand";

/** How long the tag stays after the click that showed it, in ms */
export const LOCKED_TAG_MS = 4000;

type Tag = {
    /** The locked item clicked */
    readonly id: number;
    /** Where it was clicked, in field units: the tag stands beside it */
    readonly at: { readonly x: number; readonly y: number };
};

/**
 * The "Locked" tag a click on a locked item shows beside the click (props epic step 2, owner
 * 2026-11-24): locked items carry no padlock on the field, so the click itself says why nothing
 * was selected, and the tag is the way in: clicking it opens the item's Unlock and Edit menu, as
 * a right-click does. A second click on the item only shows it again, so a rage click unlocks
 * nothing; it goes after a few seconds.
 */
export const useLockedItemTagStore = create<{ readonly tag: Tag | null }>(
    () => ({ tag: null }),
);

let timer: ReturnType<typeof setTimeout> | undefined;

export function showLockedItemTag(id: number, at: Tag["at"]): void {
    clearTimeout(timer);
    useLockedItemTagStore.setState({ tag: { id, at } });
    timer = setTimeout(hideLockedItemTag, LOCKED_TAG_MS);
}

export function hideLockedItemTag(): void {
    clearTimeout(timer);
    if (useLockedItemTagStore.getState().tag !== null)
        useLockedItemTagStore.setState({ tag: null });
}

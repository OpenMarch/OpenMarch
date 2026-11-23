import { create } from "zustand";
import { syncFromStorage } from "@/stores/syncFromStorage";
import { readPicture, type CopiedPicture, type PictureFit } from "./picture";

/**
 * The app's own clipboard for a copied picture (#961, owner 2026-11-15): kept in localStorage
 * with the app's other per-user data, so it's still there in another show file, after a restart
 * and in the app's other windows. The system clipboard is never read or written for it, so
 * copying text doesn't replace it and the web editor asks for no permission.
 */
export const PICTURE_STORAGE_KEY = "openmarch:copiedPicture";

const parse = (raw: string): CopiedPicture | null =>
    readPicture(JSON.parse(raw));

function load(): CopiedPicture | null {
    // None in a node test that imports the store
    if (typeof localStorage === "undefined") return null;
    try {
        const stored = localStorage.getItem(PICTURE_STORAGE_KEY);
        return stored ? parse(stored) : null;
    } catch (error) {
        console.error("Failed to load the copied picture:", error);
        return null;
    }
}

/**
 * How a copied shape pastes (owner, 2026-11-15): as the shape, laid out for any number of
 * marchers and kept live, or as its exact positions, spots that so many marchers fill. Every new
 * copy starts as the shape; a picture with no shape always pastes as positions.
 */
export type PasteAs = "shape" | "positions";

export const useCopiedPictureStore = create<{
    picture: CopiedPicture | null;
    pasteAs: PasteAs;
}>(() => ({ picture: load(), pasteAs: "shape" }));

/**
 * What the Clipboard chip's live region says next (#961): a copy, a clear, a paste preview
 * opening. `n` counts them, so the same words said twice are announced twice.
 */
export const useClipboardAnnouncementStore = create<{
    text: string;
    n: number;
}>(() => ({ text: "", n: 0 }));

/**
 * How the open paste fits the marchers it was pasted onto (owner 2026-11-22): shown under the
 * paste's floating editor when spots stay empty or marchers are left out. Null with no paste
 * open, or one that fits.
 */
export const usePasteNoticeStore = create<{ fit: PictureFit | null }>(() => ({
    fit: null,
}));

/** Has screen readers say `text` (the toast that once said it is gone) */
export function announceClipboard(text: string): void {
    useClipboardAnnouncementStore.setState((s) => ({ text, n: s.n + 1 }));
}

/**
 * Empties the clipboard (owner, 2026-11-15): nothing to paste until something is copied again,
 * here and in every other window
 */
export function clearPicture(): void {
    useCopiedPictureStore.setState({ picture: null, pasteAs: "shape" });
    try {
        localStorage.removeItem(PICTURE_STORAGE_KEY);
    } catch (error) {
        console.error("Failed to clear the copied picture:", error);
    }
}

/** Another window copied: this one pastes the same picture */
syncFromStorage(PICTURE_STORAGE_KEY, parse, (picture) =>
    useCopiedPictureStore.setState({ picture, pasteAs: "shape" }),
);

// Another window cleared it (`syncFromStorage` skips a removed key)
if (typeof window !== "undefined")
    window.addEventListener("storage", (event) => {
        if (event.key === PICTURE_STORAGE_KEY && event.newValue === null)
            useCopiedPictureStore.setState({ picture: null, pasteAs: "shape" });
    });

/** Paste a copied shape as the shape or as its positions */
export const setPasteAs = (pasteAs: PasteAs): void =>
    useCopiedPictureStore.setState({ pasteAs });

/** Keeps `picture` as the one Paste uses, here and in every other window */
export function keepPicture(picture: CopiedPicture): void {
    useCopiedPictureStore.setState({ picture, pasteAs: "shape" });
    try {
        localStorage.setItem(PICTURE_STORAGE_KEY, JSON.stringify(picture));
    } catch (error) {
        // Still pastes in this window until it closes
        console.error("Failed to keep the copied picture:", error);
    }
}

/** The picture Paste would use, or null when nothing has been copied */
export const copiedPicture = (): CopiedPicture | null =>
    useCopiedPictureStore.getState().picture;

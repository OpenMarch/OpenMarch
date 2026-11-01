import { create } from "zustand";
import type {
    LibraryState,
    SaveStatus,
    StorageProblem,
} from "../../web/protocol";

/**
 * The web editor's show library and save status, as the page knows them.
 * `web/renderer` fills it from the worker's messages; the launch page's show
 * list and the title bar's save status read it. Unused in Electron.
 */
interface WebLibraryStoreState {
    /** Where shows are kept: "opfs" (browser storage) or "memory" (this tab only). */
    storage:
        | { kind: "opfs" }
        | { kind: "memory"; problem: StorageProblem }
        | null;
    /** Whether the browser agreed to keep the shows when space runs low. */
    persisted: boolean | null;
    library: LibraryState | null;
    saveStatus: SaveStatus | null;
    /** The show whose versions are listed, or null when that list is closed. */
    versionsFor: string | null;
    /** Whether the "Add to Home Screen" how-to is open. */
    homeScreenPromptOpen: boolean;
    set: (state: Partial<WebLibraryStoreState>) => void;
}

export const useWebLibraryStore = create<WebLibraryStoreState>((set) => ({
    storage: null,
    persisted: null,
    library: null,
    saveStatus: null,
    versionsFor: null,
    homeScreenPromptOpen: false,
    set: (state) => set(state),
}));

/** The open show's library entry, if it's stored. */
export const useOpenShowEntry = () =>
    useWebLibraryStore((state) =>
        state.library?.openId
            ? (state.library.shows.find(
                  (show) => show.id === state.library!.openId,
              ) ?? null)
            : null,
    );

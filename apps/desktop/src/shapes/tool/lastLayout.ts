import { create } from "zustand";
import { LAYOUT_FAMILIES, type LayoutFamily } from "../distribute/distribution";
import { userList } from "./userStorage";

/**
 * The Files layout the user picked last (#387): a new box starts in it. Like stars it is the
 * user's, not the show's, so it lives with the app's other per-user settings in localStorage.
 */
export const LAST_LAYOUT_STORAGE_KEY = "openmarch:shapeLastLayout";

const STORED = userList<LayoutFamily>(
    LAST_LAYOUT_STORAGE_KEY,
    (entry) =>
        typeof entry === "string" &&
        (LAYOUT_FAMILIES as readonly string[]).includes(entry)
            ? (entry as LayoutFamily)
            : null,
    "last-used box layout",
);

interface LastLayoutStore {
    /** Short back until the user picks a layout */
    family: LayoutFamily;
    remember: (family: LayoutFamily) => void;
}

export const useLastLayoutStore = create<LastLayoutStore>((set, get) => ({
    family: STORED.load()[0] ?? "shortBack",
    remember: (family) => {
        if (get().family === family) return;
        set({ family });
        STORED.save([family]);
    },
}));

STORED.sync((items) =>
    useLastLayoutStore.setState({ family: items[0] ?? "shortBack" }),
);

import { create } from "zustand";
import { userList } from "../tool/userStorage";

/**
 * Which construction guides a shape draws while it's edited (owner on #634), picked in the
 * editor's Guides menu: the circle an Arc is part of, and its angle lines, from the circle's center
 * out through its ends and on past them. The user's, not the show's, so they live with the app's
 * other per-user settings in localStorage. Both shown until hidden.
 */
export const SHAPE_GUIDES_STORAGE_KEY = "openmarch:shapeGuides";

/** A guide the Guides menu shows or hides */
export type ShapeGuide = "circle" | "angles";

type Shown = Record<ShapeGuide, boolean>;

const ALL: Shown = { circle: true, angles: true };

const STORED = userList<Shown>(
    SHAPE_GUIDES_STORAGE_KEY,
    (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Shown).circle === "boolean" &&
        typeof (entry as Shown).angles === "boolean"
            ? {
                  circle: (entry as Shown).circle,
                  angles: (entry as Shown).angles,
              }
            : null,
    "shape guides shown",
);

interface ShapeGuidesStore {
    shown: Shown;
    toggle: (guide: ShapeGuide) => void;
}

export const useShapeGuidesStore = create<ShapeGuidesStore>((set, get) => ({
    shown: STORED.load()[0] ?? ALL,
    toggle: (guide) => {
        const shown = { ...get().shown, [guide]: !get().shown[guide] };
        set({ shown });
        STORED.save([shown]);
    },
}));

STORED.sync((items) =>
    useShapeGuidesStore.setState({ shown: items[0] ?? ALL }),
);

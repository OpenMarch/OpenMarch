import Marcher from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import { create } from "zustand";

export const AlignmentEvents = ["default", "line", "lasso"] as const;
export type AlignmentEvent = (typeof AlignmentEvents)[number];

export interface AlignmentEventState {
    alignmentEvent: AlignmentEvent;
    /** The marchers associated with this cursor mode event change */
    alignmentEventMarchers: Marcher[];
    alignmentEventNewMarcherPages: MarcherPage[];
}

interface AlignmentEventStoreInterface extends AlignmentEventState {
    resetAlignmentEvent: () => void;
    setAlignmentEvent: (alignmentEvent: AlignmentEvent) => void;
    setAlignmentEventMarchers: (alignmentEventMarchers: Marcher[]) => void;
    setAlignmentEventNewMarcherPages: (
        alignmentEventNewMarcherPages: MarcherPage[],
    ) => void;
}

export const useAlignmentEventStore = create<AlignmentEventStoreInterface>(
    (set) => ({
        alignmentEvent: "default",
        alignmentEventMarchers: [],
        alignmentEventNewMarcherPages: [],

        /**
         * Reset the cursor mode to default and clear the marchers and marcher pages associated with this cursor mode event change
         */
        resetAlignmentEvent: () => {
            set({
                alignmentEvent: "default",
                alignmentEventMarchers: [],
                alignmentEventNewMarcherPages: [],
            });
        },

        /**
         * Set the alignmentEvent
         *
         * @param newAlignmentEvent the new alignmentEvent
         */
        setAlignmentEvent: (alignmentEvent: AlignmentEvent) => {
            set({ alignmentEvent });
        },

        /**
         * Set the marchers associated with this cursor mode event change
         *
         * @param alignmentEventMarchers
         */
        setAlignmentEventMarchers: (alignmentEventMarchers: Marcher[]) => {
            set({ alignmentEventMarchers });
        },

        /**
         * Set the new marcher pages associated with this cursor mode event
         *
         * @param alignmentEventNewMarcherPages
         */
        setAlignmentEventNewMarcherPages: (
            alignmentEventNewMarcherPages: MarcherPage[],
        ) => {
            set({ alignmentEventNewMarcherPages });
        },
    }),
);

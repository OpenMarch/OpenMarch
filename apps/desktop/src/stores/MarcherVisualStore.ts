import { create } from "zustand";
import Marcher from "@/global/classes/Marcher";
import MarcherVisualGroup, {
    marcherVisualsFromMarchers,
} from "@/global/classes/MarcherVisualGroup";

/** MarcherVisualMap is a type that maps marcher IDs to their visual groups. **/
export type MarcherVisualMap = Record<number, MarcherVisualGroup>;

interface MarcherVisualStoreInterface {
    marcherVisuals: MarcherVisualMap;
    updateMarcherVisuals: (receivedMarchers: Marcher[]) => Promise<void>;
}

export const useMarcherVisualStore = create<MarcherVisualStoreInterface>(
    (set, get) => ({
        marcherVisuals: {},

        updateMarcherVisuals: async (receivedMarchers) => {
            set((state) => {
                const newVisuals: Record<number, MarcherVisualGroup> = {
                    ...state.marcherVisuals,
                };

                return marcherVisualsFromMarchers(receivedMarchers, newVisuals);
            });
        },
    }),
);

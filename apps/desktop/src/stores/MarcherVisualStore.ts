import { create } from "zustand";
import Marcher from "@/global/classes/Marcher";
import MarcherVisualGroup, {
    marcherVisualsFromMarchers,
} from "@/global/classes/MarcherVisualGroup";
import { SectionAppearance } from "@/global/classes/SectionAppearance";

/** MarcherVisualMap is a type that maps marcher IDs to their visual groups. **/
export type MarcherVisualMap = Record<number, MarcherVisualGroup>;

interface MarcherVisualStoreInterface {
    marcherVisuals: MarcherVisualMap;
    updateMarcherVisuals: (
        receivedMarchers: Marcher[],
        sectionAppearances?: SectionAppearance[],
    ) => Promise<void>;
}

export const useMarcherVisualStore = create<MarcherVisualStoreInterface>(
    (set) => ({
        marcherVisuals: {},

        updateMarcherVisuals: async (receivedMarchers, sectionAppearances) => {
            set(() => ({
                marcherVisuals: marcherVisualsFromMarchers(
                    receivedMarchers,
                    sectionAppearances,
                ),
            }));
        },
    }),
);

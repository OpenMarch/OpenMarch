import { create } from "zustand";
import Marcher from "@/global/classes/Marcher";
import MarcherVisualGroup, {
    marcherVisualsFromMarchers,
} from "@/global/classes/MarcherVisualGroup";
import { SectionAppearance } from "@/global/classes/SectionAppearance";
import { FieldTheme } from "@openmarch/core";

/** MarcherVisualMap is a type that maps marcher IDs to their visual groups. **/
export type MarcherVisualMap = Record<number, MarcherVisualGroup>;

interface MarcherVisualStoreInterface {
    marcherVisuals: MarcherVisualMap;
    updateMarcherVisuals: (
        receivedMarchers: Marcher[],
        fieldTheme: FieldTheme,
        sectionAppearances?: SectionAppearance[],
    ) => Promise<void>;
}

export const useMarcherVisualStore = create<MarcherVisualStoreInterface>(
    (set) => ({
        marcherVisuals: {},

        updateMarcherVisuals: async (
            receivedMarchers,
            fieldTheme,
            sectionAppearances,
        ) => {
            set(() => ({
                marcherVisuals: marcherVisualsFromMarchers({
                    receivedMarchers,
                    sectionAppearances,
                    fieldTheme,
                }),
            }));
        },
    }),
);

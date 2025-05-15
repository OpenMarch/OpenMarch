import { create } from "zustand";
import { SectionAppearance } from "@/global/classes/SectionAppearance";

interface SectionAppearanceStoreInterface {
    sectionAppearances: SectionAppearance[];
    fetchSectionAppearances: () => Promise<void>;
}

export const useSectionAppearanceStore =
    create<SectionAppearanceStoreInterface>((set) => ({
        sectionAppearances: [],

        fetchSectionAppearances: async () => {
            try {
                const appearances =
                    await SectionAppearance.getSectionAppearances();
                set({ sectionAppearances: appearances });
            } catch (error) {
                console.error("Error fetching section appearances:", error);
            }
        },
    }));

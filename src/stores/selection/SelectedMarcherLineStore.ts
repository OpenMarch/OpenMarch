import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import { create } from "zustand";

interface SelectedMarcherLinesInterface {
    selectedMarcherLines: MarcherLine[];
    setSelectedMarcherLines: (selectedMarcherLines: MarcherLine[]) => void;
}

export const useSelectedMarcherLinesStore =
    create<SelectedMarcherLinesInterface>((set) => ({
        selectedMarcherLines: [],

        /**
         * Set the selectedMarcherLines
         *
         * @param newSelectedMarcherLines the new selectedMarcherLines
         */
        setSelectedMarcherLines: (newSelectedMarcherLines) => {
            set({ selectedMarcherLines: newSelectedMarcherLines });
        },
    }));

import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import { create } from "zustand";

interface MarcherLineStoreInterface {
    marcherLines: MarcherLine[];
    fetchMarcherLines: () => Promise<void>;
}

export const useMarcherLineStore = create<MarcherLineStoreInterface>((set) => ({
    marcherLines: [],

    /**
     * Fetch the marcherLines from the database and updates the store.
     * This is the only way to update retrieve the marcherLines from the database that ensures the UI is updated.
     * To access the marcherLines, use the `marcherLines` property of the store.
     */
    fetchMarcherLines: async () => {
        const receivedMarcherLines = await MarcherLine.readAll();
        if (!receivedMarcherLines) {
            console.error("Failed to fetch marcher lines");
            return;
        }
        set({ marcherLines: receivedMarcherLines });
    },
}));

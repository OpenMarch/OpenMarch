import { create } from "zustand";

import Marcher from "@/global/classes/Marcher";
import MarcherVisualSet from "@/global/classes/MarcherVisualSet";

interface MarcherVisualStoreInterface {
    marcherVisuals: Record<number, MarcherVisualSet>;
    updateMarcherVisuals: (receivedMarchers: Marcher[]) => Promise<void>;
}

export const useMarcherVisualStore = create<MarcherVisualStoreInterface>(
    (set, get) => ({
        marcherVisuals: {},

        updateMarcherVisuals: async (receivedMarchers) => {
            set((state) => {
                const newVisuals: Record<number, MarcherVisualSet> = {
                    ...state.marcherVisuals,
                };

                // add new visuals for received marchers
                for (const marcher of receivedMarchers) {
                    if (!newVisuals[marcher.id]) {
                        newVisuals[marcher.id] = new MarcherVisualSet(
                            marcher.id,
                        );
                    }
                }

                // remove visuals for marchers that are not received
                const receivedIds = new Set(receivedMarchers.map((m) => m.id));
                Object.keys(newVisuals).forEach((id) => {
                    if (!receivedIds.has(Number(id))) {
                        delete newVisuals[Number(id)];
                    }
                });

                return { marcherVisuals: newVisuals };
            });
            console.debug("Marcher visuals updated:", get().marcherVisuals);
        },
    }),
);

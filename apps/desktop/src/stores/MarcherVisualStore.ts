import { create } from "zustand";
import Marcher from "@/global/classes/Marcher";
import MarcherVisualGroup from "@/global/classes/MarcherVisualGroup";

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

                // add new visuals for received marchers
                for (const marcher of receivedMarchers) {
                    if (!newVisuals[marcher.id]) {
                        newVisuals[marcher.id] = new MarcherVisualGroup(
                            marcher,
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

            console.log("Marcher visuals updated:", get().marcherVisuals);
        },
    }),
);

import { createContext, useContext } from "react";
import type { StoreApi } from "zustand";
import type { QualitySettings } from "@/field/fieldQuality";
import { useFieldViewStore, type FieldView } from "./fieldView";
import { currentQualitySettings } from "./useFieldQuality";

/**
 * What the layers draw for: the view their frame hooks read the zoom from,
 * and the quality settings they cheapen by. The on-screen field uses the
 * defaults, the one view store (ADR 0005 D-2.4) and the machine's quality
 * mode (#205). The video export (#207) mounts the same layers off screen with
 * its own view, always at full quality.
 */
export type FieldDraw = {
    view: StoreApi<FieldView>;
    /** Read in frame hooks: allocates nothing. */
    quality: () => QualitySettings;
};

export const FieldDrawContext = createContext<FieldDraw>({
    view: useFieldViewStore,
    quality: currentQualitySettings,
});

export function useFieldDraw(): FieldDraw {
    return useContext(FieldDrawContext);
}

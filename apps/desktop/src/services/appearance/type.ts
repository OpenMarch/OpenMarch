import { ResolvedPerformerAppearance } from "@/entity-components/appearance";

export type MarcherAppearanceTimeline = {
    /** List of timestamps for when the appearance of this marcher changes */
    timestamps: number[];
    /**
     * Appearance objects in the same order as the `timestamps` array.
     * The appearances defined here apply after the timestamp they belong to until the next timestamp.
     */
    appearances: ResolvedPerformerAppearance[];
};

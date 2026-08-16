import { ResolvedPerformerAppearance } from "@/entity-components/appearance";

export type MarcherAppearanceTimeline = {
    /**
     * Ordered list of timestamps, in milliseconds, for when the appearance of this
     * marcher changes. Mirrors `MarcherTimeline.timestamps` (`@openmarch/core`) so
     * both can be sampled with the same binary search (`_getTimestampIndex`).
     */
    timestamps: Float32Array;
    /**
     * Appearance objects in the same order as the `timestamps` array.
     * The appearances defined here apply after the timestamp they belong to until the next timestamp.
     */
    appearances: ResolvedPerformerAppearance[];
};

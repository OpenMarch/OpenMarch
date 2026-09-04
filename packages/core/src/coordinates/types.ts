/** Rendering timeline for a single marcher across the entire show. */
export type MarcherTimeline = {
    /**
     * Ordered list of timestamps, in milliseconds, for each coordinate.
     */
    timestamps: Float32Array;
    /**
     * Ordered list of coordinates, in the same order as the timestamps.
     *
     * `coordinates.length === timestamps.length * 2`
     */
    coordinates: Float32Array;
};

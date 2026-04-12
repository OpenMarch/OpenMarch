/** Pulses per quarter note */
export const PPQN = 480 as const;

/**
 * The number of ticks to preload data for.
 *
 * I.e. load all data needed for `x` ticks ahead
 */
export const PRELOAD_BUFFER_TICKS = 32 * PPQN;

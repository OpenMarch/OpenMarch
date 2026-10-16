/**
 * The new field's fonts, shared by the on-screen field (`ThreeField.tsx`) and
 * the export's off-screen field (`offscreenField.tsx`), so both draw alike.
 */

/** The marcher labels' font. */
export const LABEL_FONT = 'bold "Courier New", monospace';
/**
 * The field's fonts (`createFieldGrid`): the default for yard numbers, and
 * "mono" for checkpoint labels, a family that doesn't exist, so the
 * platform's fallback draws them.
 */
export const NUMBER_FONT = '"Times New Roman"';
export const CHECKPOINT_FONT = '"mono"';
/** `CollisionMarker`'s label font. */
export const COLLISION_FONT = "Arial";

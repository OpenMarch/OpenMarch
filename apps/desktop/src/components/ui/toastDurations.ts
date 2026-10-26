/** How long a short touch-mode note stays (no button on it). */
export const NOTE_TOAST_DURATION_MS = 2500;

/**
 * How long a toast with a button (e.g. Undo) stays: long enough to read it
 * and reach for the button. Pass it as `duration` on such toasts; a toast's
 * own duration wins over the Toaster's default for notes.
 */
export const ACTION_TOAST_DURATION_MS = 6000;

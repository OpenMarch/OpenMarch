/**
 * The start flag's color (UI-11), shared by the flag, the From start bar, the transport button and
 * the field badge so they read as one thing. The theme's yellow is too light on the light ruler
 * (about 1.9:1), so light mode uses a darker ochre (about 3.6:1); dark mode keeps the yellow.
 */
export const START_INK = {
    bg: "bg-[rgb(150,120,0)] dark:bg-yellow",
    text: "text-[rgb(150,120,0)] dark:text-yellow",
    border: "border-[rgb(150,120,0)] dark:border-yellow",
    ring: "ring-[rgb(150,120,0)]/40 dark:ring-yellow/40",
} as const;

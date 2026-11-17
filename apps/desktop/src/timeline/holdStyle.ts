/**
 * **Hold style** (ADR 0015 D-5; fork #775): what a marcher's feet do over a Held hold. Holds stand
 * still unless asked. A Held hold may carry its own style (`timeline_held_marks.style`), which
 * wins over the show setting (Show settings, "On a hold") for the counts it covers; with none it
 * uses the show setting, as every hold that isn't a stored Held mark does.
 *
 * Pure: no React or database.
 */

/** What the feet do on a hold. High mark time plays mark time until it is animated. */
export type HoldStyle = "stand" | "markTime" | "highMarkTime";

/** The styles, in the order the menus list them. */
export const HOLD_STYLES: readonly HoldStyle[] = [
    "stand",
    "markTime",
    "highMarkTime",
];

/**
 * A stored style as this build reads it: one of `HOLD_STYLES`, else `null` (the show setting). A
 * value a later build wrote reads as `null` and is left in the file.
 */
export const holdStyleOf = (value: unknown): HoldStyle | null =>
    HOLD_STYLES.includes(value as HoldStyle) ? (value as HoldStyle) : null;

/**
 * The style of holds joined into one (touching holds are one hold, holds 04-anchors): that of the
 * earliest part that has one. So a hold grown over more counts keeps its style, and a new hold
 * that joins a styled one takes it.
 *
 * @param parts the joined holds' styles, earliest first
 */
export const joinedHoldStyle = (
    parts: readonly (HoldStyle | null | undefined)[],
): HoldStyle | null => parts.find((style) => style != null) ?? null;

/**
 * What a selection's Held holds at one count carry, for the menu's checked choice: the one style
 * they share (`null` is the show setting), or `"mixed"`.
 *
 * @param styles each Held marcher's style there; empty when none is Held
 */
export function sharedHoldStyle(
    styles: readonly (HoldStyle | null | undefined)[],
): HoldStyle | null | "mixed" | undefined {
    if (styles.length === 0) return undefined;
    const first = styles[0] ?? null;
    return styles.every((style) => (style ?? null) === first) ? first : "mixed";
}

/**
 * THE ONE PLACE TO CHANGE THE HOLDS WORDING. The words for a marcher's state on a page, and the
 * names of the hold commands, live in the `timeline.terms.*` block of `i18n/en.json`; change them
 * there and nowhere else. Every string that names a state takes the word as a placeholder
 * (`{defined}`, `{held}`, `{notDefined}`, …) filled from `holdTerms()`.
 *
 * Working words (owner, 2026-11-02; docs/timeline/research/holds/README.md, Vocabulary):
 * - **Defined**: the marcher has its own position on this page.
 * - **Held**: it stays where the last page left it, on purpose.
 * - **Not defined**: nothing decided yet; it shows the last position for now.
 *
 * The lowercase forms are separate keys because ICU can't lowercase a placeholder. Title case is
 * for a state shown on its own (a menu item, a bar title, "is Not defined" in a toast); sentences
 * use the lowercase forms. The sentences read the state words as adjectives ("is {held} on Page 3",
 * "Not {heldLower}"), so a replacement word has to read that way too, or those sentences change
 * with it.
 *
 * Strings about marchers that only show an earlier page's position say "no position of its own"
 * rather than {notDefined}: they can't tell a Held marcher from a Not defined one (the resolver
 * doesn't see held marks), so naming either state there could be wrong.
 */
import tolgee from "@/global/singletons/Tolgee";

/** Each term's key and English default, by placeholder name. */
export const HOLD_TERM_KEYS = {
    defined: ["timeline.terms.defined", "Defined"],
    definedLower: ["timeline.terms.definedLower", "defined"],
    held: ["timeline.terms.held", "Held"],
    heldLower: ["timeline.terms.heldLower", "held"],
    notDefined: ["timeline.terms.notDefined", "Not defined"],
    notDefinedLower: ["timeline.terms.notDefinedLower", "not defined"],
    defineAsShown: ["timeline.terms.defineAsShown", "Define as shown"],
    holdFromPrevious: [
        "timeline.terms.holdFromPrevious",
        "Hold from last keyframe",
    ],
    holdOverWindow: [
        "timeline.terms.holdOverWindow",
        "Hold from start flag to playhead",
    ],
    clearThisPage: ["timeline.terms.clearThisPage", "Clear this page"],
    removeKeyframe: ["timeline.terms.removeKeyframe", "Remove keyframe"],
    splitHold: ["timeline.terms.splitHold", "Split hold here"],
} as const satisfies Record<string, readonly [string, string]>;

export type HoldTerm = keyof typeof HOLD_TERM_KEYS;
export type HoldTerms = Readonly<Record<HoldTerm, string>>;

/** One term in the current language. */
export function holdTerm(term: HoldTerm): string {
    const [key, defaultValue] = HOLD_TERM_KEYS[term];
    return tolgee.t(key, defaultValue);
}

/** Every term in the current language, as placeholder params for a translated string. */
export function holdTerms(): HoldTerms {
    const terms = {} as Record<HoldTerm, string>;
    for (const term of Object.keys(HOLD_TERM_KEYS) as HoldTerm[])
        terms[term] = holdTerm(term);
    return terms;
}

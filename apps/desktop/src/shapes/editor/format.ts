/**
 * Steps as text, both ways: the one reading of a typed number of steps (the chip, interval lists,
 * the command bar) and the one way they're shown (#423).
 */

/** The fraction glyphs drill writers use, by the fraction in lowest terms */
export const FRACTIONS: Readonly<Record<string, string>> = {
    "1/2": "½",
    "1/3": "⅓",
    "2/3": "⅔",
    "1/4": "¼",
    "3/4": "¾",
    "1/6": "⅙",
    "5/6": "⅚",
};

/** Each glyph's value */
const GLYPH_VALUES = new Map(
    Object.entries(FRACTIONS).map(([plain, glyph]) => {
        const [p, q] = plain.split("/").map(Number);
        return [glyph, p! / q!];
    }),
);

const DECIMAL = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
/** "2½", "⅔" */
const WITH_GLYPH = new RegExp(
    String.raw`^(\d*)\s*([${[...GLYPH_VALUES.keys()].join("")}])$`,
);
/** "5/3", and mixed numbers "1 2/3" and "1-2/3" */
const FRACTION = /^(?:(\d+)(?:\s+|-))?(\d+)\/(\d+)$/;

/**
 * A number of steps as typed, without a unit: "2", "2.5", ".5", "2½", "⅔", "1 2/3", "1-2/3",
 * "5/3". 0 reads as 0; null for anything else, a zero denominator included. Interval lists read
 * each of their numbers with this.
 */
export function readSteps(text: string): number | null {
    const t = text.trim();
    if (DECIMAL.test(t)) return Number(t);
    const withGlyph = WITH_GLYPH.exec(t);
    if (withGlyph)
        return Number(withGlyph[1] || 0) + GLYPH_VALUES.get(withGlyph[2]!)!;
    const fraction = FRACTION.exec(t);
    if (!fraction) return null;
    const q = Number(fraction[3]);
    if (q === 0) return null;
    return Number(fraction[1] ?? 0) + Number(fraction[2]) / q;
}

/**
 * Steps as typed into a step number: {@link readSteps}, with an optional "step" or "steps" after
 * it. Null for anything else, or a value not above 0.
 */
export function parseSteps(text: string): number | null {
    const value = readSteps(text.trim().replace(/\s*steps?$/i, ""));
    return value !== null && value > 0 ? value : null;
}

/**
 * `steps` as a whole number and a glyph ("2⅔", "½", "3") when it is whole or a fraction with one
 * of `denominators`, to within 1e-6; null otherwise
 */
export function fractionText(
    steps: number,
    denominators: readonly number[],
): string | null {
    if (!(steps >= 0)) return null;
    for (const q of [1, ...denominators]) {
        const p = Math.round(steps * q);
        if (Math.abs(steps - p / q) > 1e-6) continue;
        const whole = Math.floor(p / q);
        const rest = p - whole * q;
        if (rest === 0) return String(whole);
        const glyph = FRACTIONS[`${rest}/${q}`];
        if (!glyph) return null;
        return whole === 0 ? glyph : `${whole}${glyph}`;
    }
    return null;
}

/**
 * Steps as drill writers say them: halves, thirds and quarters as glyphs (2½, 1⅔, 2¾, 3), anything
 * else to two decimals (1.6, 1.14)
 */
export function formatSteps(steps: number): string {
    return (
        fractionText(steps, [2, 3, 4]) ?? String(Math.round(steps * 100) / 100)
    );
}

/**
 * Steps that can go below 0 (a Line's offset, owner on #596): {@link formatSteps} with a minus sign
 * before it ("−1½"); never "−0"
 */
export function formatSignedSteps(steps: number): string {
    const text = formatSteps(Math.abs(steps));
    return steps < 0 && text !== "0" ? `−${text}` : text;
}

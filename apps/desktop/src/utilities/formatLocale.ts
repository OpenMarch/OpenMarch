/**
 * The locale for formatting dates and numbers on screen.
 *
 * With the app in English this is `undefined`, so dates and numbers follow the system's
 * regional format (an English app on a UK or German system writes the date and decimal mark
 * the way that region does, as the app did before it was translated). In any other app
 * language it's that language, so the text around a number and the number agree.
 *
 * Resolve it each time you format, never at module load, or it keeps the first language.
 * React components that format should subscribe with `useTolgee(["language"])` and pass
 * `getLanguage()` in, so they re-render when the language changes.
 */
import tolgee from "@/global/singletons/Tolgee";

export function formatLocale(
    language: string | undefined = tolgee.getLanguage(),
): string | undefined {
    if (!language) return undefined;
    if (language === "en" || language.toLowerCase().startsWith("en-"))
        return undefined;
    return language;
}

/**
 * `value` with exactly `digits` decimals, like `toFixed`, but with the app language's decimal
 * mark. In English it's exactly `toFixed` (always "."): it replaces text that never followed
 * the system's format, so English output stays as it was. No thousands separators.
 */
export function formatFixed(
    value: number,
    digits: number,
    language?: string,
): string {
    // `+ 0` turns -0 into 0, which Intl would write as "-0"
    return (value + 0).toLocaleString(formatLocale(language) ?? "en", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        useGrouping: false,
    });
}

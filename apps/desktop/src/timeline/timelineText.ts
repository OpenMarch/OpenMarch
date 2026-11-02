/**
 * Text for the screen, kept as a Tolgee key and its arguments until it is shown. The write path
 * (db-functions) words its refusals with it, and `timelineRangeWords` its pages, counts and move
 * names, without importing Tolgee: the text is translated where it is shown
 * (`translateTimelineText`), in the language the app has then.
 *
 * An argument is a plain value, another text (a move's name inside a refusal), or a list of them,
 * joined the way the app's language joins a list ("A, B and C"). Each piece is translated on its
 * own, so no message holds words from another language.
 */

/** An argument of a `TimelineText`. */
export type TimelineTextArg = string | number | TimelineText | TimelineTextList;

/** A Tolgee key with its arguments, translated when it is shown. */
export interface TimelineText {
    readonly key: string;
    readonly params?: Readonly<Record<string, TimelineTextArg>>;
}

/** Items joined as a list in the app's language: "A", "A and B", "A, B and C". */
export interface TimelineTextList {
    readonly list: readonly TimelineTextArg[];
}

/**
 * Builds a `TimelineText`; it doesn't translate. Called as `text.t(...)` so `pnpm check:i18n`
 * checks that the key is in `en.json`, as it does for Tolgee's own `t`.
 */
export const text = {
    t: (key: string, params?: Record<string, TimelineTextArg>): TimelineText =>
        params === undefined ? { key } : { key, params },
};

/** A list argument (`TimelineTextList`). */
export const textList = (
    items: readonly TimelineTextArg[],
): TimelineTextList => ({ list: items });

export const isTimelineText = (value: unknown): value is TimelineText =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { key?: unknown }).key === "string";

const isTextList = (value: unknown): value is TimelineTextList =>
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { list?: unknown }).list);

/** Translates one key with its (already translated) arguments. */
export type TimelineTextTranslate = (
    key: string,
    params: Record<string, string | number>,
) => string;

/**
 * English joins without a comma before "and" ("A, B and C"), as the app's English text does;
 * `Intl.ListFormat` gives that for British English.
 */
const listLocale = (language: string) =>
    language === "en" || language.startsWith("en-") ? "en-GB" : language;

/** `items` joined as a list in `language`. */
export function joinListIn(items: readonly string[], language: string): string {
    if (items.length <= 1) return items[0] ?? "";
    try {
        return new Intl.ListFormat(listLocale(language), {
            style: "long",
            type: "conjunction",
        }).format(items);
    } catch {
        return new Intl.ListFormat("en-GB", {
            style: "long",
            type: "conjunction",
        }).format(items);
    }
}

/** `value` as a string: nested texts and lists first, then the text itself. */
export function resolveTimelineText(
    value: TimelineTextArg,
    translate: TimelineTextTranslate,
    language: string,
): string {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (isTextList(value))
        return joinListIn(
            value.list.map((item) =>
                resolveTimelineText(item, translate, language),
            ),
            language,
        );
    const params: Record<string, string | number> = {};
    for (const [name, arg] of Object.entries(value.params ?? {}))
        params[name] =
            typeof arg === "number"
                ? arg
                : resolveTimelineText(arg, translate, language);
    return translate(value.key, params);
}

/**
 * `value` for a log or a developer's message, without Tolgee: each key with its arguments
 * (`timeline.where.page {"page":"2"}`), lists joined in English. The write path (db-functions)
 * uses it, since code the convert-on-open worker and the web build's worker run mustn't import
 * Tolgee; the user sees the text translated where it is shown (`translateTimelineText`).
 */
export function timelineTextForLog(value: TimelineTextArg): string {
    return resolveTimelineText(
        value,
        (key, params) =>
            Object.keys(params).length === 0
                ? key
                : `${key} ${JSON.stringify(params)}`,
        "en",
    );
}

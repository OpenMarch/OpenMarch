/**
 * Lists in the app's language. Resolved on each call, so call these where the text is shown,
 * never at module load, or the list keeps the language it was first built in.
 */
import tolgee from "@/global/singletons/Tolgee";
import { joinListIn } from "@/timeline/timelineText";

function listFormat(type: Intl.ListFormatType): Intl.ListFormat {
    return new Intl.ListFormat(tolgee.getLanguage() ?? "en", {
        type,
        style: type === "unit" ? "short" : "long",
    });
}

/** Items joined as a list in the app's language ("a, b, c" in English), with no "and". */
export function formatList(items: readonly string[]): string {
    return listFormat("unit").format(items);
}

/**
 * Items joined with the language's "and" ("a, b and c" in English, the same as the timeline's
 * lists: `joinListIn` keeps English free of the comma before "and").
 */
export function formatAndList(items: readonly string[]): string {
    return joinListIn(items, tolgee.getLanguage() ?? "en");
}

/**
 * A list of `count` items in the app's language, as parts: each item's index, and the
 * separators between them as text, for lists of elements (`formatList` for text).
 */
export function listParts(
    count: number,
): ({ item: number } | { text: string })[] {
    const items = Array.from({ length: count }, (_, i) => String(i));
    return listFormat("unit")
        .formatToParts(items)
        .map((part) =>
            part.type === "element"
                ? { item: Number(part.value) }
                : { text: part.value },
        );
}

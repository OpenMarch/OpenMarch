/**
 * A label exactly as the app shows it, from the app's English strings
 * (apps/desktop/i18n/en.json). A key that no longer exists throws, so a renamed button fails the
 * build instead of leaving the guide behind.
 *
 * Placeholders such as {held} are filled from the hold terms (src/data/generated/terms.json);
 * pass others as `values`. A trailing "…" is dropped, the way UI names are written in prose.
 */
import en from "../../../../desktop/i18n/en.json";
import terms from "../../data/generated/terms.json";

/** A key's value; a key may itself contain dots ("settings" › "field.gridLines"), so the longest match wins at each level. */
function lookup(obj: unknown, key: string): unknown {
    if (obj === null || typeof obj !== "object") return undefined;
    const parts = key.split(".");
    for (let i = parts.length; i > 0; i--) {
        const head = parts.slice(0, i).join(".");
        if (!(head in (obj as Record<string, unknown>))) continue;
        const value = (obj as Record<string, unknown>)[head];
        if (i === parts.length) return value;
        const found = lookup(value, parts.slice(i).join("."));
        if (found !== undefined) return found;
    }
    return undefined;
}

export function uiText(
    k: string,
    values?: Record<string, string | number>,
): string {
    const found = lookup(en, k);
    if (typeof found !== "string")
        throw new Error(
            `<Ui k="${k}">: no such string in apps/desktop/i18n/en.json`,
        );
    const fill = { ...terms, ...values } as Record<string, string | number>;
    const text = found
        .replace(/\{(\w+)\}/g, (all, name: string) =>
            name in fill ? String(fill[name]) : all,
        )
        .replace(/(…|\.\.\.)$/, "");
    if (/\{\w+[,}]/.test(text))
        throw new Error(
            `<Ui k="${k}">: "${found}" needs values for its placeholders`,
        );
    return text;
}

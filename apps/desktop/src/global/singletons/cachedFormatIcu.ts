import type {
    FinalFormatterMiddleware,
    PluginTools,
    TolgeeInstance,
    TolgeePlugin,
} from "@tolgee/react";
import { FormatIcu } from "@tolgee/format-icu";

/** How many formatted strings the cache keeps (least recently used go first). */
export const FORMAT_CACHE_SIZE = 2000;

type Param = string | number | boolean | null | undefined;

/** The cache key, or null when a param isn't a plain value (a tag function, a React element). */
function cacheKey(
    language: string,
    translation: string,
    params: Record<string, unknown> | undefined,
): string | null {
    let key = `${language}\u0000${translation}`;
    if (!params) return key;
    for (const name of Object.keys(params).sort()) {
        const value = params[name];
        if (
            value !== null &&
            value !== undefined &&
            typeof value !== "string" &&
            typeof value !== "number" &&
            typeof value !== "boolean"
        )
            return null;
        key += `\u0000${name}\u0001${typeof value}\u0001${String(value as Param)}`;
    }
    return key;
}

/**
 * Tolgee's ICU formatter with a cache of its results. `FormatIcu` parses the message into a new
 * `IntlMessageFormat` on every `t()` call, which made an inspector list re-render (a transition's
 * members, about 9 strings each) cost tens of milliseconds per edit. The output only depends on
 * the message, the language and the params, so a string result for plain-value params is reused;
 * anything else (tag functions, elements) goes to the formatter every time.
 */
export const CachedFormatIcu =
    (size: number = FORMAT_CACHE_SIZE): TolgeePlugin =>
    (tolgee: TolgeeInstance, tools: PluginTools) => {
        let inner: FinalFormatterMiddleware | undefined;
        FormatIcu()(tolgee, {
            ...tools,
            setFinalFormatter: (formatter) => {
                inner = formatter;
            },
        });
        const icu = inner;
        if (!icu) throw new Error("FormatIcu didn't set a formatter");
        const cache = new Map<string, string>();
        tools.setFinalFormatter({
            format: (props) => {
                const key = cacheKey(
                    props.language,
                    props.translation,
                    props.params,
                );
                if (key !== null) {
                    const hit = cache.get(key);
                    if (hit !== undefined) {
                        // most recently used last
                        cache.delete(key);
                        cache.set(key, hit);
                        return hit;
                    }
                }
                const result: unknown = icu.format(props);
                if (key !== null && typeof result === "string") {
                    cache.set(key, result);
                    if (cache.size > size)
                        cache.delete(cache.keys().next().value!);
                }
                return result;
            },
        });
        return tolgee;
    };

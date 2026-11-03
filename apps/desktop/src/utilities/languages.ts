// cspell:words Hola Bonjour Bahasa Melayu Halo Helo Kumusta สวัสดี ไทย

/** A language the app is translated into. */
export interface AppLanguage {
    /** Tolgee language code, also what `setLanguage` saves. */
    code: string;
    /** The language's name in that language. */
    name: string;
    /** "Hello" in that language, for the welcome flow's first page. */
    greeting: string;
}

/** The app's languages, in the order Settings and the welcome flow list them. */
export const APP_LANGUAGES: readonly AppLanguage[] = [
    { code: "en", name: "English", greeting: "Hello" },
    { code: "es", name: "Español", greeting: "Hola" },
    { code: "fr", name: "Français", greeting: "Bonjour" },
    { code: "pt-BR", name: "Português (Brasil)", greeting: "Olá" },
    { code: "id", name: "Bahasa Indonesia", greeting: "Halo" },
    { code: "ms", name: "Bahasa Melayu", greeting: "Helo" },
    { code: "fil", name: "Filipino", greeting: "Kumusta" },
    { code: "ja", name: "日本語", greeting: "こんにちは" },
    { code: "zh-Hans", name: "简体中文", greeting: "你好" },
    { code: "zh-Hant", name: "繁體中文", greeting: "你好" },
    { code: "th", name: "ไทย", greeting: "สวัสดี" },
];

/**
 * A browser or system language tag in the form the app's codes use. Chinese picks its
 * script: Taiwan, Hong Kong and Macau write Traditional, everywhere else Simplified. Tagalog
 * (`tl`) is Filipino, and `in` is the old code for Indonesian.
 */
function normalizeTag(tag: string): string {
    const lower = tag.toLowerCase();
    const [base, ...rest] = lower.split("-");
    if (base === "zh") {
        if (rest.includes("hant")) return "zh-hant";
        if (rest.includes("hans")) return "zh-hans";
        return rest.some((part) => ["tw", "hk", "mo"].includes(part))
            ? "zh-hant"
            : "zh-hans";
    }
    if (base === "tl") return ["fil", ...rest].join("-");
    if (base === "in") return ["id", ...rest].join("-");
    return lower;
}

/**
 * The app language that best matches the browser's or system's preferred
 * languages (`navigator.languages`): an exact match first, then the same
 * base language ("pt-PT" picks "pt-BR"). Chinese matches by script ("zh-TW" picks
 * Traditional). Null when none match.
 */
export function matchAppLanguage(
    preferred: readonly string[],
    languages: readonly AppLanguage[] = APP_LANGUAGES,
): string | null {
    for (const tag of preferred) {
        const lower = normalizeTag(tag);
        const exact = languages.find((l) => l.code.toLowerCase() === lower);
        if (exact) return exact.code;
        const base = lower.split("-")[0];
        const sameBase = languages.find(
            (l) => l.code.toLowerCase().split("-")[0] === base,
        );
        if (sameBase) return sameBase.code;
    }
    return null;
}

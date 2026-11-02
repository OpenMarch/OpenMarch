/**
 * Translated text for the main process: the application menu, native dialogs, window titles
 * and messages main sends for the renderer to show (docs/conventions/localization.md, "Main
 * process"). It reads the renderer's `i18n/*.json` files, bundled into main, and formats with
 * the same ICU formatter as the renderer, so a key reads the same in either process.
 *
 * Main follows the app language the renderer saves with `setLanguage` (the `language`
 * setting). Call `t()` when the text is shown, never at import time, or it keeps the language
 * of the moment it was first read.
 */
import { TolgeeCore, type TranslateParams } from "@tolgee/core";
import { FormatIcu } from "@tolgee/format-icu";
import en from "../../i18n/en.json";
import es from "../../i18n/es.json";
import fr from "../../i18n/fr.json";
import ja from "../../i18n/ja.json";
import ptBR from "../../i18n/pt-BR.json";

/** The app's languages; the same codes as `src/utilities/languages.ts`. */
export const MAIN_LANGUAGES = ["en", "es", "fr", "pt-BR", "ja"] as const;
export type MainLanguage = (typeof MAIN_LANGUAGES)[number];

const FALLBACK: MainLanguage = "en";

const tolgee = TolgeeCore()
    .use(FormatIcu())
    .init({
        language: FALLBACK,
        fallbackLanguage: FALLBACK,
        staticData: { en, es, fr, ja, "pt-BR": ptBR },
    });

let current: MainLanguage = FALLBACK;
const listeners = new Set<(language: MainLanguage) => void>();

/** A saved language setting as one of the app's languages; anything else is English. */
export function toMainLanguage(value: unknown): MainLanguage {
    return MAIN_LANGUAGES.find((code) => code === value) ?? FALLBACK;
}

/** The language main shows text in. */
export const getMainLanguage = (): MainLanguage => current;

/**
 * Switches main to the saved `language` setting (an unknown value means English) and tells
 * the listeners, which rebuild what they show. Returns whether the language changed.
 */
export function setMainLanguage(value: unknown): boolean {
    const next = toMainLanguage(value);
    if (next === current) return false;
    current = next;
    for (const listener of listeners) listener(next);
    return true;
}

/** Runs `listener` after every language change. Returns the unsubscribe function. */
export function onMainLanguageChange(
    listener: (language: MainLanguage) => void,
): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * The text for `key` in main's language, with ICU `{arguments}` filled from `params`. A key
 * the language lacks falls back to English, and a key English lacks shows the key itself
 * (`pnpm check:i18n` keeps that from shipping).
 */
export function t(
    key: string,
    params?: TranslateParams<string | number>,
): string {
    return tolgee.t({ key, params, language: current });
}

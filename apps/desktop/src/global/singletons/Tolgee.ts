import {
    Tolgee,
    FormatSimple,
    TolgeeInstance,
    PluginTools,
    TolgeePlugin,
} from "@tolgee/react";
import { FormatIcu } from "@tolgee/format-icu";

const TOLGEE_API_URL = "https://app.tolgee.io";

export const RemoveInContextTools =
    (): TolgeePlugin => (tolgee: TolgeeInstance, tools: PluginTools) => {
        tools.setDevBackend(undefined);
        tools.setUi(undefined);
        tools.setObserver(undefined);

        return tolgee;
    };

// Check if running in Playwright test environment
const isPlaywrightSession = (): boolean => {
    if (import.meta.env.VITE_PUBLIC_PLAYWRIGHT_SESSION) {
        return true;
    }
    try {
        return (
            typeof window !== "undefined" &&
            !!window.electron?.isPlaywrightSession
        );
    } catch {
        return false;
    }
};

/** Vitest and other non-browser test runners: avoid Tolgee dev backend window listeners. */
const isUnitTestEnvironment = (): boolean => import.meta.env.VITEST === true;

const isOfflineTolgeeEnvironment = (): boolean =>
    isPlaywrightSession() || isUnitTestEnvironment();

const tolgeeBuilder = Tolgee().use(FormatSimple()).use(FormatIcu());

if (isOfflineTolgeeEnvironment()) {
    tolgeeBuilder.use(RemoveInContextTools());
}

const tolgee = tolgeeBuilder.init({
    language: "en",
    // Disable API URL in tests to prevent external network calls and dev-backend timers
    apiUrl: isOfflineTolgeeEnvironment() ? undefined : TOLGEE_API_URL,
    staticData: {
        en: () => import("../../../i18n/en.json"),
        es: () => import("../../../i18n/es.json"),
        fr: () => import("../../../i18n/fr.json"),
        "pt-BR": () => import("../../../i18n/pt-BR.json"),
        ja: () => import("../../../i18n/ja.json"),
    },
});

export default tolgee;

import { Tolgee, DevTools, FormatSimple } from "@tolgee/react";
import { FormatIcu } from "@tolgee/format-icu";

const tolgee = Tolgee()
    .use(DevTools())
    .use(FormatSimple())
    .use(FormatIcu())
    .init({
        language: "en", // Default language, will be overridden by saved language

        // for development only
        ...(import.meta.env.MODE === "development" && {
            apiUrl: import.meta.env.VITE_APP_TOLGEE_API_URL,
            apiKey: import.meta.env.VITE_APP_TOLGEE_API_KEY,
        }),

        staticData: {
            en: () => import("../../../i18n/en.json"),
            es: () => import("../../../i18n/es.json"),
            "pt-BR": () => import("../../../i18n/pt-BR.json"),
            ja: () => import("../../../i18n/ja.json"),
        },
    });

export default tolgee;

import { Tolgee, DevTools, FormatSimple } from "@tolgee/react";
import { FormatIcu } from "@tolgee/format-icu";

const TOLGEE_API_URL = "https://app.tolgee.io";
const tolgeeDevTools = !!window.electron?.getSettingSync?.("tolgeeDevTools");
const tolgeeApiKey = window.electron?.getSettingSync?.("tolgeeApiKey");

const tolgee = Tolgee()
    .use(DevTools())
    .use(FormatSimple())
    .use(FormatIcu())
    .init({
        language: "en",
        ...(tolgeeDevTools &&
            tolgeeApiKey && {
                apiUrl: TOLGEE_API_URL,
                apiKey: tolgeeApiKey,
            }),
        staticData: {
            en: () => import("../../../i18n/en.json"),
            es: () => import("../../../i18n/es.json"),
            fr: () => import("../../../i18n/fr.json"),
            "pt-BR": () => import("../../../i18n/pt-BR.json"),
            ja: () => import("../../../i18n/ja.json"),
        },
    });

export default tolgee;

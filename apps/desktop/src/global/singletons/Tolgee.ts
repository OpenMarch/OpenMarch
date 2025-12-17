import { Tolgee, FormatSimple } from "@tolgee/react";
import { FormatIcu } from "@tolgee/format-icu";

const TOLGEE_API_URL = "https://app.tolgee.io";

const tolgee = Tolgee()
    .use(FormatSimple())
    .use(FormatIcu())
    .init({
        language: "en",
        apiUrl: TOLGEE_API_URL,
        staticData: {
            en: () => import("../../../i18n/en.json"),
            es: () => import("../../../i18n/es.json"),
            fr: () => import("../../../i18n/fr.json"),
            "pt-BR": () => import("../../../i18n/pt-BR.json"),
            ja: () => import("../../../i18n/ja.json"),
        },
    });

export default tolgee;

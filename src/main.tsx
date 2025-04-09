import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import "@fontsource/dm-mono";
import "@fontsource/dm-sans";
import { ThemeProvider } from "./context/ThemeContext";
import * as Sentry from "@sentry/electron/renderer";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import en from "../translations/en.json";
import ja from "../translations/ja.json";

i18next.use(initReactI18next).init({
    fallbackLng: "en",
    debug: true,
    initAsync: false,
    resources: {
        en: {
            translation: en,
        },
        ja: {
            translation: ja,
        },
    },
});

Sentry.init({
    dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <ThemeProvider>
            <App />
        </ThemeProvider>
    </React.StrictMode>,
);

postMessage({ payload: "removeLoading" }, "*");

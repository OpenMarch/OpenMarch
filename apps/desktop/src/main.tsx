import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import "@fontsource/dm-mono";
import "@fontsource/dm-sans";
import { ThemeProvider } from "./context/ThemeContext";
import { Tolgee, DevTools, TolgeeProvider, FormatSimple } from "@tolgee/react";
import { FormatIcu } from "@tolgee/format-icu";
import * as Sentry from "@sentry/electron/renderer";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

const options = {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    capture_exceptions: true,
    debug: import.meta.env.MODE === "development",
    opt_out_capturing_by_default: true,
};

if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
    posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, options);
}

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
            en: () => import("../i18n/en.json"),
            es: () => import("../i18n/es.json"),
            "pt-BR": () => import("../i18n/pt-BR.json"),
            ja: () => import("../i18n/ja.json"),
        },
    });

// Load saved language from electron store on app start
window.electron
    ?.getLanguage()
    .then((savedLanguage) => {
        if (savedLanguage && savedLanguage !== "en") {
            tolgee.changeLanguage(savedLanguage);
        }
    })
    .catch((error) => {
        console.warn("Failed to load saved language:", error);
    });

Sentry.init({
    dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
    enabled: false,
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <PostHogProvider client={posthog}>
            <TolgeeProvider
                tolgee={tolgee}
                fallback="Loading..." // loading fallback
            >
                <ThemeProvider>
                    <App />
                </ThemeProvider>
            </TolgeeProvider>
        </PostHogProvider>
    </React.StrictMode>,
);

postMessage({ payload: "removeLoading" }, "*");

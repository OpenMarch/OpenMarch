import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
// Load every weight the UI uses, or Chromium fakes medium/semibold/bold by smearing 400.
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import { ThemeProvider } from "./context/ThemeContext";
import * as Sentry from "@sentry/electron/renderer";
import posthog, { type PostHogConfig } from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";

// Check for Playwright session from either build-time or runtime environment
const isPlaywrightSession =
    import.meta.env.VITE_PUBLIC_PLAYWRIGHT_SESSION ||
    window.electron?.isPlaywrightSession;

const options: Partial<PostHogConfig> = {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    capture_exceptions: true,
    debug: import.meta.env.MODE === "development",
    opt_out_capturing_by_default: true,
    disable_session_recording: isPlaywrightSession,
    disable_persistence: isPlaywrightSession,
    disable_surveys: isPlaywrightSession,
    disable_surveys_automatic_display: isPlaywrightSession,
    disable_web_experiments: isPlaywrightSession,
};

if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
    posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, options);
}

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

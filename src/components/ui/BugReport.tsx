import { useEffect } from "react";
import * as Sentry from "@sentry/electron/renderer";
import i18next from "i18next";

export const feedbackObj = Sentry.feedbackIntegration({
    autoInject: false,
    showBranding: false,
    messagePlaceholder: i18next.t("sentry.bugReport.messagePlaceholder"),
    enableScreenshot: false,
});
export default function ErrorReport() {
    useEffect(() => {
        feedbackObj.attachTo("#feedback-button", {});
        return () => {
            feedbackObj.remove();
        };
    }, []);

    // If the version is the same, don't show the modal
    return (
        <div
            className="cursor-pointer outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-5"
            id="feedback-button"
        >
            {i18next.t("sentry.bugReport.button")}
        </div>
    );
}

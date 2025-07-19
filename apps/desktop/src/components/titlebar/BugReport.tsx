import { useEffect } from "react";
import * as Sentry from "@sentry/electron/renderer";
import { BugBeetleIcon } from "@phosphor-icons/react/dist/ssr";
import { T, useTolgee } from "@tolgee/react";

export const feedbackObj = Sentry.feedbackIntegration({
    autoInject: false,
    showBranding: false,
    messagePlaceholder: "", // Will be set dynamically
    enableScreenshot: false,
});

export default function BugReport() {
    const { t } = useTolgee();

    useEffect(() => {
        // Update the feedback integration with translated text
        feedbackObj.attachTo("#feedback-button", {
            messagePlaceholder: t("titlebar.bugReport.placeholder"),
        });

        return () => {
            feedbackObj.remove();
        };
    }, [t]);

    // If the version is the same, don't show the modal
    return (
        <div
            className="hover:text-accent text-sub flex cursor-pointer items-center gap-4 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-5"
            id="feedback-button"
        >
            <BugBeetleIcon size={16} />
            <T keyName="titlebar.bugReport" />
        </div>
    );
}

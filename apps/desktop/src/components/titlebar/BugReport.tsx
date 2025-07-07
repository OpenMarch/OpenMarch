import { useEffect } from "react";
import * as Sentry from "@sentry/electron/renderer";
import { BugBeetleIcon } from "@phosphor-icons/react/dist/ssr";

export const feedbackObj = Sentry.feedbackIntegration({
    autoInject: false,
    showBranding: false,
    messagePlaceholder:
        "What went wrong?\nWhat did you expect?\nHow can we reproduce the issue?",
    enableScreenshot: false,
});
export default function BugReport() {
    useEffect(() => {
        feedbackObj.attachTo("#feedback-button", {});
        return () => {
            feedbackObj.remove();
        };
    }, []);

    // If the version is the same, don't show the modal
    return (
        <div
            className="hover:text-accent text-sub flex cursor-pointer items-center gap-4 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-5"
            id="feedback-button"
        >
            <BugBeetleIcon size={16} />
            Submit bug or feedback
        </div>
    );
}

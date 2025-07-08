import { Button, Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { usePostHog } from "posthog-js/react";
import * as Sentry from "@sentry/electron/renderer";
import { useState, useEffect } from "react";
import AnalyticsMessage from "./launchpage/settings/AnalyticsMessage";

interface AnalyticsOptInModalProps {
    onChoice: (hasOptedIn: boolean) => void;
}

export default function AnalyticsOptInModal({
    onChoice,
}: AnalyticsOptInModalProps) {
    const posthog = usePostHog();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsOpen(true);
        }, 300);

        return () => clearTimeout(timer);
    }, []);

    const handleOptIn = () => {
        posthog.opt_in_capturing();
        Sentry.init({
            dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
            enabled: true,
        });
        window.electron.send("settings:set", { optOutAnalytics: false });
        onChoice(true);
        window.location.reload();
    };

    const handleOptOut = () => {
        posthog.opt_out_capturing();
        Sentry.init({
            dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
            enabled: false,
        });
        window.electron.send("settings:set", { optOutAnalytics: true });
        onChoice(false);
        window.location.reload();
    };

    return (
        <Dialog open={isOpen}>
            <DialogContent
                className="w-[40rem]"
                aria-describedby="Analytics Opt-In"
            >
                <DialogTitle>Help Us Improve OpenMarch</DialogTitle>
                <div className="flex flex-col gap-16">
                    <p className="text-text-subtitle text-sm">
                        To help us improve OpenMarch, we collect analytics data,
                        error logs, and session captures. This helps us
                        understand how you use the app and identify bugs. Read
                        our{" "}
                        <a
                            href="https://openmarch.com/privacy"
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent underline"
                        >
                            privacy policy
                        </a>{" "}
                        to learn more.
                    </p>
                    <p className="text-text-subtitle text-sm">
                        You can change this setting at any time in the app
                        settings.
                    </p>

                    <div className="flex flex-col gap-16 text-sm">
                        When you opt-in
                        <AnalyticsMessage hasOptedOut={false} />
                    </div>
                    <div className="flex flex-col gap-16 text-sm">
                        When you opt-out
                        <AnalyticsMessage hasOptedOut={true} />
                    </div>

                    <div className="flex justify-end gap-12 pt-16">
                        <Button onClick={handleOptOut} variant="secondary">
                            Opt Out
                        </Button>
                        <Button onClick={handleOptIn}>Opt In</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

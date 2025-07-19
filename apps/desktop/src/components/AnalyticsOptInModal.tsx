import { Button, Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { usePostHog } from "posthog-js/react";
import * as Sentry from "@sentry/electron/renderer";
import { useState, useEffect } from "react";
import AnalyticsMessage from "./launchpage/settings/AnalyticsMessage";
import { T } from "@tolgee/react";

interface AnalyticsOptInModalProps {
    onChoice: (hasOptedIn: boolean) => void;
}

export default function AnalyticsOptInModal({
    onChoice,
}: AnalyticsOptInModalProps) {
    const posthog = usePostHog();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;

        const checkEnv = async () => {
            const env = await window.electron.getEnv();
            if (env.isPlaywright || env.isCI) {
                posthog.opt_out_capturing();
                Sentry.init({
                    dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
                    enabled: false,
                });
                window.electron.send("settings:set", {
                    optOutAnalytics: true,
                });
                onChoice(false);
                setIsOpen(false);
            } else {
                timer = setTimeout(() => {
                    setIsOpen(true);
                }, 300);
            }
        };

        checkEnv();

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [onChoice, posthog]);

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
                <DialogTitle>
                    <T keyName="analyticsOptIn.title" />
                </DialogTitle>
                <div className="flex flex-col gap-16">
                    <p className="text-text-subtitle text-sm">
                        <T
                            keyName="analyticsOptIn.description"
                            params={{
                                a: (content) => (
                                    <a
                                        href="https://openmarch.com/privacy"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-accent underline"
                                    >
                                        {content}
                                    </a>
                                ),
                            }}
                        />
                    </p>
                    <p className="text-text-subtitle text-sm">
                        <T keyName="analyticsOptIn.settings" />
                    </p>

                    <div className="flex flex-col gap-16 text-sm">
                        <T keyName="analyticsOptIn.whenYouOptIn" />
                        <AnalyticsMessage hasOptedOut={false} />
                    </div>
                    <div className="flex flex-col gap-16 text-sm">
                        <T keyName="analyticsOptIn.whenYouOptOut" />
                        <AnalyticsMessage hasOptedOut={true} />
                    </div>

                    <div className="flex justify-end gap-12 pt-16">
                        <Button onClick={handleOptOut} variant="secondary">
                            <T keyName="analyticsOptIn.optOut" />
                        </Button>
                        <Button onClick={handleOptIn}>
                            <T keyName="analyticsOptIn.optIn" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

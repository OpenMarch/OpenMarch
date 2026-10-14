import { Button, Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import {
    applyAnalyticsConsent,
    saveAnalyticsChoice,
} from "@/utilities/analyticsConsent";
import { useState, useEffect } from "react";
import AnalyticsOptInDetails from "./AnalyticsOptInDetails";
import { T } from "@tolgee/react";

interface AnalyticsOptInModalProps {
    onChoice: (hasOptedIn: boolean) => void;
}

// eslint-disable-next-line max-lines-per-function
export default function AnalyticsOptInModal({
    onChoice,
}: AnalyticsOptInModalProps) {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;

        const checkEnv = async () => {
            const env = await window.electron.getEnv();
            if (env.isPlaywrightSession || env.isCI) {
                applyAnalyticsConsent(true);
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

        void checkEnv();

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [onChoice]);

    const handleOptIn = () => {
        saveAnalyticsChoice(false);
        onChoice(true);
        window.location.reload();
    };

    const handleOptOut = () => {
        saveAnalyticsChoice(true);
        onChoice(false);
        window.location.reload();
    };

    return (
        // modal is false to allow for PostHog interaction
        <Dialog open={isOpen} modal={false}>
            <DialogContent
                className="w-[40rem]"
                aria-describedby="Analytics Opt-In"
            >
                <DialogTitle>
                    <T keyName="analyticsOptIn.title" />
                </DialogTitle>
                <div className="flex flex-col gap-16">
                    <AnalyticsOptInDetails />

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

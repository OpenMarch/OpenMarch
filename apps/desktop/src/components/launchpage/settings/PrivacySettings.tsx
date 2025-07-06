import AnalyticsMessage from "@/components/launchpage/settings/AnalyticsMessage";
import { Collapsible } from "@/components/ui/Collapsible";
import { Switch } from "@openmarch/ui";
import { usePostHog } from "posthog-js/react";
import { useState, useEffect } from "react";
import * as Sentry from "@sentry/electron/renderer";

export default function PrivacySettings() {
    const posthog = usePostHog();
    const [hasOptedOut, setHasOptedOut] = useState(
        posthog.has_opted_out_capturing(),
    );

    useEffect(() => {
        setHasOptedOut(posthog.has_opted_out_capturing());
    }, [posthog]);
    return (
        <div>
            <Collapsible
                trigger={<p className="text-body">Share usage analytics</p>}
                className="flex flex-col gap-16 pt-16"
            >
                <p className="text-text-subtitle px-12 text-sm">
                    To help us improve OpenMarch, we collect anonymous analytics
                    data and screen recordings. This helps us understand how you
                    use the app and identify bugs. Read our{" "}
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
                <p className="text-text-subtitle px-12 text-sm">
                    You can opt out of this if you&apos;d prefer. Just know that
                    OpenMarch is a free tool built by volunteers, and this data
                    really helps us understand how designers are using the app
                    and find bugs—especially when we don&apos;t hear about them
                    right away on Discord or Facebook :)
                </p>
                <div className="flex w-full items-center justify-between gap-16 px-12">
                    <p className="text-body">Enable analytics</p>
                    <Switch
                        id="share-usage-analytics"
                        checked={!hasOptedOut}
                        onCheckedChange={(checked) => {
                            if (checked) {
                                posthog.opt_in_capturing();
                                Sentry.init({
                                    dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
                                    enabled: true,
                                });
                            } else {
                                posthog.opt_out_capturing();
                                Sentry.init({
                                    dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
                                    enabled: false,
                                });
                            }
                            setHasOptedOut(!checked);
                            window.electron.send("settings:set", {
                                optOutAnalytics: !checked,
                            });
                        }}
                    />
                </div>
            </Collapsible>

            <AnalyticsMessage hasOptedOut={hasOptedOut} />
        </div>
    );
}

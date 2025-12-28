import AnalyticsMessage from "@/components/launchpage/settings/AnalyticsMessage";
import { Collapsible } from "@/components/ui/Collapsible";
import { Switch } from "@openmarch/ui";
import { usePostHog } from "posthog-js/react";
import { useState, useEffect } from "react";
import { T } from "@tolgee/react";
import * as Sentry from "@sentry/electron/renderer";
import { initializeUserTracking } from "@/utilities/analytics";

export default function PrivacySettings() {
    const posthog = usePostHog();
    const [hasOptedOut, setHasOptedOut] = useState(
        posthog.has_opted_out_capturing(),
    );

    useEffect(() => {
        setHasOptedOut(posthog.has_opted_out_capturing());
    }, [posthog]);
    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-16 border p-12">
            <Collapsible
                trigger={
                    <p className="flex flex-col gap-16 px-8">
                        <T keyName="settings.privacy.analytics" />
                    </p>
                }
                className="flex flex-col gap-16 pt-16"
            >
                <p className="text-text-subtitle px-12 text-sm">
                    <T
                        keyName="settings.privacy.analytics.description"
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
                <p className="text-text-subtitle px-12 text-sm">
                    <T
                        keyName={
                            "settings.privacy.analytics.description.opt_out"
                        }
                    />
                </p>
                <div className="flex w-full items-center justify-between gap-16 px-12">
                    <p className="text-body">
                        <T keyName={"settings.privacy.analytics.toggle"} />
                    </p>
                    <Switch
                        id="share-usage-analytics"
                        checked={!hasOptedOut}
                        onCheckedChange={async (checked) => {
                            if (checked) {
                                posthog.opt_in_capturing();
                                Sentry.init({
                                    dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
                                    enabled: true,
                                });
                                // Initialize user tracking after opting in
                                await initializeUserTracking();
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

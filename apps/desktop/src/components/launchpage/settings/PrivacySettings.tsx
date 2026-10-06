import AnalyticsMessage from "@/components/launchpage/settings/AnalyticsMessage";
import { Collapsible } from "@/components/ui/Collapsible";
import { Switch } from "@openmarch/ui";
import { usePostHog } from "posthog-js/react";
import { useState, useEffect } from "react";
import { T } from "@tolgee/react";
import * as Sentry from "@sentry/electron/renderer";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";

export default function PrivacySettings() {
    const posthog = usePostHog();
    const [hasOptedOut, setHasOptedOut] = useState(
        posthog.has_opted_out_capturing(),
    );

    useEffect(() => {
        setHasOptedOut(posthog.has_opted_out_capturing());
    }, [posthog]);
    return (
        <div className="flex flex-col gap-16">
            <SettingsPanel>
                <Collapsible
                    trigger={
                        <p className="text-body text-text py-12">
                            <T keyName="settings.privacy.analytics" />
                        </p>
                    }
                    className="flex flex-col gap-12 pb-12"
                >
                    <p className="text-text-subtitle text-sub">
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
                    <p className="text-text-subtitle text-sub">
                        <T
                            keyName={
                                "settings.privacy.analytics.description.opt_out"
                            }
                        />
                    </p>
                    <SettingRow
                        label={
                            <T keyName="settings.privacy.analytics.toggle" />
                        }
                        htmlFor="share-usage-analytics"
                    >
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
                    </SettingRow>
                </Collapsible>
            </SettingsPanel>

            <AnalyticsMessage hasOptedOut={hasOptedOut} />
        </div>
    );
}

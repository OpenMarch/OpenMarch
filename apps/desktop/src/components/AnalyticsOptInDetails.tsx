import { T } from "@tolgee/react";
import AnalyticsMessage from "./launchpage/settings/AnalyticsMessage";

/** What analytics collects and what each choice means; shared by the opt-in modal and the welcome flow. */
export default function AnalyticsOptInDetails() {
    return (
        <>
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
        </>
    );
}

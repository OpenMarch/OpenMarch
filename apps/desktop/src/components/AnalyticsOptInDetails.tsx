import { T } from "@tolgee/react";
import AnalyticsMessage from "./launchpage/settings/AnalyticsMessage";
import { siteUrl } from "@/global/siteUrl";

/** What analytics collects and what each choice means; shared by the opt-in modal and the welcome flow. */
export default function AnalyticsOptInDetails() {
    return (
        <>
            <p className="text-text-subtitle text-body">
                <T
                    keyName="analyticsOptIn.description"
                    params={{
                        a: (content) => (
                            <a
                                href={siteUrl("/privacy")}
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
            <p className="text-text-subtitle text-body">
                <T keyName="analyticsOptIn.settings" />
            </p>

            <div className="text-body flex flex-col gap-16">
                <T keyName="analyticsOptIn.whenYouOptIn" />
                <AnalyticsMessage hasOptedOut={false} />
            </div>
            <div className="text-body flex flex-col gap-16">
                <T keyName="analyticsOptIn.whenYouOptOut" />
                <AnalyticsMessage hasOptedOut={true} />
            </div>
        </>
    );
}

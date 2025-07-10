import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";

interface AnalyticsMessageProps {
    hasOptedOut: boolean;
}

export default function AnalyticsMessage({
    hasOptedOut,
}: AnalyticsMessageProps) {
    if (!hasOptedOut) {
        return (
            <div className="bg-green/20 text-green-foreground border-green mx-12 flex items-center gap-8 rounded-md border p-12 text-sm">
                <CheckCircleIcon size={32} className="text-green" />
                <T keyName="settings.privacy.analytics.enabled" />
            </div>
        );
    }

    return (
        <div className="bg-red/20 text-red-foreground mx-12 flex items-center gap-8 rounded-md border border-red-500/50 p-12 text-sm">
            <XCircleIcon size={64} className="text-red-500" />
            <p>
                <T
                    keyName="settings.privacy.analytics.disabled"
                    params={{
                        a: (content) => (
                            <a
                                href="https://openmarch.com/about/submitting-feedback"
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
        </div>
    );
}

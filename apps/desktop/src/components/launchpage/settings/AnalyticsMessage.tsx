import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";

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
                You&apos;re sharing usage analytics. Thank you for helping make
                OpenMarch better for everyone.
            </div>
        );
    }

    return (
        <div className="bg-red/20 text-red-foreground mx-12 flex items-center gap-8 rounded-md border border-red-500/50 p-12 text-sm">
            <XCircleIcon size={64} className="text-red-500" />
            <p>
                You are not sharing analytics. If you experience issues or bugs,
                we will not know about them. If you have an issue, please{" "}
                <a
                    href="https://openmarch.com/about/submitting-feedback"
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline"
                >
                    submit feedback
                </a>{" "}
                so we can address it.
            </p>
        </div>
    );
}

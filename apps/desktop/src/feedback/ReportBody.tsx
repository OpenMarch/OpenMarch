/**
 * What the report drawer shows (fork #801). Signed out, it asks people to
 * sign in and offers GitHub and Discord instead. Signed in, it shows the
 * report form, then thanks once it's sent.
 */
import { useState } from "react";
import { T } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import { WarningIcon } from "@phosphor-icons/react";
import { useAuth } from "@/auth/useAuth";
import { version as appVersion } from "../../package.json";
import { isWebBuild } from "@/utilities/webBuild";
import ReportForm, { type RecordingInProgress } from "./ReportForm";
import {
    DISCORD_URL,
    githubBugReportUrl,
    type ReportContext,
} from "./reportDraft";

export const reportContext = (): ReportContext => ({
    appVersion,
    platform: navigator.platform,
    channel: isWebBuild ? "web" : "desktop",
});

/** Sign-in, the form, or the thanks once sent: the report drawer's content */
export function ReportBody({
    onRecordingChange,
}: {
    /** Told when a recording starts (with how to stop it) and ends (null) */
    onRecordingChange?: (recording: RecordingInProgress | null) => void;
} = {}) {
    const { isAuthenticated, isLoading } = useAuth();
    const [sent, setSent] = useState<SentReport | null>(null);
    // A new key starts a blank form once a report is sent
    const [formKey, setFormKey] = useState(0);
    const signedOut = !isLoading && !isAuthenticated;
    return (
        <>
            {signedOut && <SignInGate />}
            {sent && !signedOut && (
                <Sent sent={sent} onAnother={() => setSent(null)} />
            )}
            {/* Stays mounted while signing in again, so what's typed and recorded is kept */}
            <div hidden={isLoading || signedOut || sent !== null}>
                <ReportForm
                    key={formKey}
                    context={reportContext()}
                    onSent={(report) => {
                        setSent(report);
                        setFormKey((k) => k + 1);
                    }}
                    onRecordingChange={onRecordingChange}
                />
            </div>
        </>
    );
}

function SignInGate() {
    const { login } = useAuth();
    return (
        <section className="mx-auto flex max-w-[28rem] flex-col gap-16 px-24 py-48">
            <h1 className="text-h4">
                <T keyName="feedback.signIn.heading" />
            </h1>
            <p className="text-body text-text-subtitle">
                <T keyName="feedback.signIn.why" />
            </p>
            <Button className="self-start" onClick={() => void login()}>
                <T keyName="feedback.signIn.button" />
            </Button>
            <p className="text-sub text-text-subtitle">
                <T
                    keyName="feedback.signIn.alternatives"
                    params={{
                        github: (content) => (
                            <a
                                className="text-accent underline"
                                href={githubBugReportUrl(reportContext())}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {content}
                            </a>
                        ),
                        discord: (content) => (
                            <a
                                className="text-accent underline"
                                href={DISCORD_URL}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {content}
                            </a>
                        ),
                    }}
                />
            </p>
        </section>
    );
}

interface SentReport {
    readonly url: string;
    readonly showFileTooLarge: boolean;
}

function Sent({
    sent: { url, showFileTooLarge },
    onAnother,
}: {
    sent: SentReport;
    onAnother: () => void;
}) {
    return (
        <section className="mx-auto flex max-w-[28rem] flex-col gap-16 px-24 py-48">
            <h1 className="text-h4">
                <T keyName="feedback.sent.heading" />
            </h1>
            <p className="text-body text-text-subtitle">
                <T keyName="feedback.sent.body" />
            </p>
            {showFileTooLarge && (
                <p role="status" className="text-body flex items-start gap-8">
                    <WarningIcon
                        size={18}
                        className="text-yellow mt-2 shrink-0"
                    />
                    <T keyName="feedback.sent.showTooLarge" />
                </p>
            )}
            <div className="flex gap-8">
                <a
                    className="text-accent text-body underline"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                >
                    <T keyName="feedback.sent.view" />
                </a>
                <Button variant="secondary" size="compact" onClick={onAnother}>
                    <T keyName="feedback.sent.another" />
                </Button>
            </div>
        </section>
    );
}

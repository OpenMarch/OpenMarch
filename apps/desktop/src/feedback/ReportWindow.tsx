/**
 * Root of the #report window: "Report a bug or send feedback" (fork #801).
 * Signed out, it asks people to sign in and offers GitHub and Discord instead.
 * Signed in, it shows the report form.
 */
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { T, useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import TitleBar from "@/components/titlebar/TitleBar";
import Toaster from "@/components/ui/Toaster";
import { useAuth } from "@/auth/useAuth";
import { version as appVersion } from "../../package.json";
import ReportForm from "./ReportForm";
import {
    DISCORD_URL,
    githubBugReportUrl,
    type ReportContext,
} from "./reportForm";

const queryClient = new QueryClient();

export const reportContext = (): ReportContext => ({
    appVersion,
    platform: navigator.platform,
    channel: "desktop",
});

export default function ReportWindow() {
    const { t } = useTranslate();
    const title = t("feedback.window.title");
    useEffect(() => {
        document.title = title;
    }, [title]);

    // No app menu in this window, so close it with Cmd/Ctrl+W here
    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.defaultPrevented || event.key.toLowerCase() !== "w")
                return;
            const mod = window.electron.isMacOS ? event.metaKey : event.ctrlKey;
            if (!mod) return;
            event.preventDefault();
            window.electron.closeWindow();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <main className="bg-bg-1 text-text flex h-screen w-screen min-w-0 flex-col overflow-hidden font-sans">
                <TitleBar variant="settings" />
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <ReportBody />
                </div>
                <Toaster />
            </main>
        </QueryClientProvider>
    );
}

function ReportBody() {
    const { isAuthenticated, isLoading } = useAuth();
    const [sent, setSent] = useState<string | null>(null);
    if (isLoading) return null;
    if (!isAuthenticated) return <SignInGate />;
    if (sent) return <Sent url={sent} onAnother={() => setSent(null)} />;
    return <ReportForm context={reportContext()} onSent={setSent} />;
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

function Sent({ url, onAnother }: { url: string; onAnother: () => void }) {
    return (
        <section className="mx-auto flex max-w-[28rem] flex-col gap-16 px-24 py-48">
            <h1 className="text-h4">
                <T keyName="feedback.sent.heading" />
            </h1>
            <p className="text-body text-text-subtitle">
                <T keyName="feedback.sent.body" />
            </p>
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

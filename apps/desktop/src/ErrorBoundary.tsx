import { Button } from "@openmarch/ui";
import {
    SealWarningIcon,
    BugBeetleIcon,
    EnvelopeSimpleIcon,
    DiscordLogoIcon,
    ClipboardIcon,
} from "@phosphor-icons/react";
import React from "react";
import tolgee from "@/global/singletons/Tolgee";
import { siteUrl } from "@/global/siteUrl";

export default class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: Error | null; copied: boolean }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null, copied: false };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Optionally log error to an error reporting service
        console.error("Uncaught error:", error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    // eslint-disable-next-line max-lines-per-function
    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-bg-1 fixed inset-0 z-50 flex items-center justify-center">
                    <div className="rounded-16 text-text border-stroke bg-fg-1 flex w-full max-w-[90vw] flex-col items-center gap-12 border p-24 shadow-xl sm:w-[36rem]">
                        <SealWarningIcon size={48} className="text-red" />
                        <div className="text-h3 font-bold">
                            {tolgee.t("errorBoundary.title")}
                        </div>
                        <div className="flex w-full flex-col items-center gap-16 text-center text-base">
                            <div className="text-text-subtitle">
                                {tolgee.t("errorBoundary.stoppedBecause")}
                            </div>

                            <div className="border-stroke bg-bg-1 group rounded-4 relative my-4 flex w-full border p-8 font-mono text-xs">
                                <div className="flex-grow text-center">
                                    {this.state.error?.message}
                                </div>
                                <button
                                    onClick={() => {
                                        void navigator.clipboard.writeText(
                                            this.state.error?.message || "",
                                        );
                                        this.setState({ copied: true });
                                        setTimeout(
                                            () =>
                                                this.setState({
                                                    copied: false,
                                                }),
                                            2000,
                                        );
                                    }}
                                    className="touch:min-h-44 touch:min-w-44 touch:justify-center rounded-4 flex items-center gap-4 px-4"
                                    title={tolgee.t(
                                        "errorBoundary.copyErrorMessage",
                                    )}
                                    aria-label={tolgee.t(
                                        "errorBoundary.copyErrorMessage",
                                    )}
                                >
                                    <>
                                        <ClipboardIcon
                                            size={16}
                                            className="text-text-subtitle hover:text-text"
                                        />
                                        {this.state.copied && (
                                            <span className="text-green bg-bg-1 rounded-4 absolute right-0 mr-8 p-2 text-xs">
                                                {tolgee.t(
                                                    "errorBoundary.errorCopied",
                                                )}
                                            </span>
                                        )}
                                    </>
                                </button>
                            </div>

                            <div className="text-h4 mt-16">
                                {tolgee.t("errorBoundary.hearAboutThis")}
                            </div>
                            <div>{tolgee.t("errorBoundary.reachOut")}</div>
                            <div className="grid w-full grid-cols-3 gap-8 text-sm">
                                <Button
                                    variant="secondary"
                                    className="flex h-full w-full items-center justify-center gap-4"
                                    size="compact"
                                    onClick={() =>
                                        window.open(
                                            siteUrl(
                                                "/guides/submitting-feedback/",
                                            ),
                                            "_blank",
                                            "noopener,noreferrer",
                                        )
                                    }
                                >
                                    <BugBeetleIcon
                                        size={20}
                                        className="-ml-2"
                                    />
                                    {tolgee.t("errorBoundary.reportIssue")}
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="flex h-full w-full items-center justify-center gap-4"
                                    size="compact"
                                    onClick={() =>
                                        window.open(
                                            "https://discord.openmarch.com",
                                            "_blank",
                                            "noopener,noreferrer",
                                        )
                                    }
                                >
                                    <DiscordLogoIcon
                                        size={20}
                                        className="-ml-2"
                                    />
                                    {tolgee.t("errorBoundary.joinDiscord")}
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="flex h-full w-full items-center justify-center gap-4"
                                    size="compact"
                                    onClick={() => {
                                        void navigator.clipboard.writeText(
                                            "contact@openmarch.com",
                                        );
                                        alert(
                                            tolgee.t(
                                                "errorBoundary.emailCopied",
                                            ),
                                        );
                                    }}
                                >
                                    <EnvelopeSimpleIcon
                                        size={20}
                                        className="-ml-2"
                                    />
                                    {tolgee.t("errorBoundary.copySupportEmail")}
                                </Button>
                            </div>
                        </div>
                        <Button variant="primary" onClick={this.handleReload}>
                            {tolgee.t("errorBoundary.refreshApp")}
                        </Button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

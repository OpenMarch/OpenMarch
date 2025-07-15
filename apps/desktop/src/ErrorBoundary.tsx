import { Button } from "@openmarch/ui";
import {
    SealWarningIcon,
    BugBeetleIcon,
    EnvelopeSimpleIcon,
    DiscordLogoIcon,
    ClipboardIcon,
} from "@phosphor-icons/react";
import React from "react";

export default class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
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

    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-bg-1 fixed inset-0 z-50 flex items-center justify-center">
                    <div className="rounded-16 text-text border-stroke bg-fg-1 flex w-full max-w-[90vw] flex-col items-center gap-12 border p-24 shadow-xl sm:w-[36rem]">
                        <SealWarningIcon size={48} className="text-red" />
                        <div className="text-h3 font-bold">
                            Something went wrong :(
                        </div>
                        <div className="flex w-full flex-col items-center gap-16 text-center text-base">
                            <div className="text-text-subtitle">
                                OpenMarch stopped due to the following error
                            </div>

                            <div className="border-stroke bg-bg-1 group relative my-4 flex w-full rounded border p-8 font-mono text-xs">
                                <div className="flex-grow text-center">
                                    {this.state.error?.message}
                                </div>
                                <button
                                    onClick={() =>
                                        navigator.clipboard.writeText(
                                            this.state.error?.message || "",
                                        )
                                    }
                                    className="opacity-0 transition-opacity group-hover:opacity-100"
                                    title="Copy error message"
                                >
                                    <ClipboardIcon
                                        size={16}
                                        className="text-text-subtitle hover:text-text"
                                    />
                                </button>
                            </div>

                            <div className="text-h4 mt-16">
                                We want to hear about this!
                            </div>
                            <div>
                                Please reach out to us so we can fix this.
                                Hearing from you is what makes OpenMarch great!
                            </div>
                            <div className="grid w-full grid-cols-3 gap-8 text-sm">
                                <Button
                                    variant="secondary"
                                    className="flex h-full w-full items-center justify-center gap-4"
                                    size="compact"
                                    onClick={() =>
                                        window.open(
                                            "https://openmarch.com/guides/submitting-feedback/",
                                            "_blank",
                                            "noopener,noreferrer",
                                        )
                                    }
                                >
                                    <BugBeetleIcon
                                        size={20}
                                        className="-ml-2"
                                    />
                                    Report the issue
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
                                    Join our Discord community
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="flex h-full w-full items-center justify-center gap-4"
                                    size="compact"
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            "contact@openmarch.com",
                                        );
                                        alert("Email copied to clipboard!");
                                    }}
                                >
                                    <EnvelopeSimpleIcon
                                        size={20}
                                        className="-ml-2"
                                    />
                                    Copy support email
                                </Button>
                            </div>
                        </div>
                        <Button variant="primary" onClick={this.handleReload}>
                            Refresh App
                        </Button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

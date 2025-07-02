import ThemeSwitcher from "../titlebar/ThemeSwitcher";
import MouseSettings from "./MouseSettings";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@openmarch/ui";
import { Collapsible } from "../ui/Collapsible";
import { GearSix } from "@phosphor-icons/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Switch } from "@openmarch/ui";
import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";
import * as Sentry from "@sentry/electron/renderer";
import AnalyticsMessage from "./AnalyticsMessage";

export default function SettingsModal() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const posthog = usePostHog();
    const [hasOptedOut, setHasOptedOut] = useState(
        posthog.has_opted_out_capturing(),
    );

    useEffect(() => {
        setHasOptedOut(posthog.has_opted_out_capturing());
    }, [posthog]);

    return (
        <Dialog>
            <DialogTrigger
                asChild
                className="titlebar-button hover:text-accent flex cursor-pointer items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
            >
                <GearSix size={18} />
            </DialogTrigger>
            <DialogContent
                className="max-h-[80vh] w-[40rem] overflow-y-auto"
                aria-describedby="Settings"
            >
                <DialogTitle>Settings</DialogTitle>
                <div className="flex flex-col gap-48">
                    <div className="flex flex-col gap-16">
                        <h4 className="text-h5 leading-none">General</h4>
                        <div className="flex flex-col gap-16 px-12">
                            <div className="flex w-full items-center justify-between gap-16">
                                <p className="text-body">Theme</p>
                                <ThemeSwitcher />
                            </div>
                            <div className="flex w-full items-center justify-between gap-16">
                                <p className="text-body">Show waveform</p>
                                <Switch
                                    id="waveform"
                                    checked={uiSettings.showWaveform}
                                    onCheckedChange={(checked) =>
                                        setUiSettings({
                                            ...uiSettings,
                                            showWaveform: checked,
                                        })
                                    }
                                />
                            </div>
                            <Collapsible
                                trigger={
                                    <p className="text-body">
                                        Share usage analytics
                                    </p>
                                }
                                className="flex flex-col gap-16 pt-16"
                            >
                                <p className="text-text-subtitle px-12 text-sm">
                                    To help us improve OpenMarch, we collect
                                    anonymous analytics data and screen
                                    recordings. This helps us understand how you
                                    use the app and identify bugs. Read our{" "}
                                    <a
                                        href="https://openmarch.com/privacy"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-accent underline"
                                    >
                                        privacy policy
                                    </a>{" "}
                                    to learn more.
                                </p>
                                <p className="text-text-subtitle px-12 text-sm">
                                    You can opt out of this if you&apos;d
                                    prefer. Just know that OpenMarch is a free
                                    tool built by volunteers, and this data
                                    really helps us understand how designers are
                                    using the app and find bugs—especially when
                                    we don&apos;t hear about them right away on
                                    Discord or Facebook :)
                                </p>
                                <div className="flex w-full items-center justify-between gap-16 px-12">
                                    <p className="text-body">
                                        Enable analytics
                                    </p>
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
                                            window.electron.send(
                                                "settings:set",
                                                {
                                                    optOutAnalytics: !checked,
                                                },
                                            );
                                        }}
                                    />
                                </div>
                            </Collapsible>

                            <AnalyticsMessage hasOptedOut={hasOptedOut} />
                        </div>
                    </div>
                    <MouseSettings />
                </div>
            </DialogContent>
        </Dialog>
    );
}

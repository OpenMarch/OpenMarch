import { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@openmarch/ui";
import { version as currentVersion } from "../../package.json";
import { Button } from "@openmarch/ui";
import StyledMarkdown from "./StyledMarkdown";
import { Skeleton } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";

// eslint-disable-next-line max-lines-per-function
export default function VersionChecker() {
    const { t } = useTolgee();
    const [isOpen, setIsOpen] = useState(false);
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [changelog, setChangelog] = useState<string | null>(null);
    const [downloadUrls, setDownloadUrls] = useState<any>({});
    const [error, setError] = useState<string | null>(null);
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

    const fetchLatestVersion = useCallback(async () => {
        try {
            const response = await fetch(
                "https://api.github.com/repos/OpenMarch/OpenMarch/releases/latest",
            );
            const data = await response.json();
            if (data.tag_name) {
                setLatestVersion(data.tag_name);
                setChangelog(data.body);

                // Check if the installed version is outdated
                if (isNewerVersion(data.tag_name, currentVersion)) {
                    setIsUpdateAvailable(true);
                } else {
                    setIsUpdateAvailable(false);
                }

                // Find the download URLs for Windows, macOS, and Linux
                const assetUrls: any = {
                    windows: null,
                    mac: null,
                    linux: null,
                };

                data.assets.forEach((asset: any) => {
                    if (asset.name.endsWith(".exe")) {
                        assetUrls.windows = asset.browser_download_url;
                    } else if (asset.name.endsWith(".dmg")) {
                        if (asset.name.includes("x64"))
                            assetUrls.macIntel = asset.browser_download_url;
                        else assetUrls.macArm = asset.browser_download_url;
                    } else if (
                        asset.name.endsWith(".AppImage") ||
                        asset.name.endsWith(".tar.gz")
                    ) {
                        assetUrls.linux = asset.browser_download_url;
                    }
                });

                setDownloadUrls(assetUrls);
            } else {
                setError(t("versionCheck.error.noVersion"));
            }
        } catch (err) {
            setError(t("versionCheck.error.fetchFailed"));
        }
    }, [t]);

    useEffect(() => {
        void fetchLatestVersion(); // Fetch the latest
    }, [fetchLatestVersion]);

    useEffect(() => {
        if (
            latestVersion &&
            isUpdateAvailable &&
            localStorage.getItem("skippedVersion") !== latestVersion
        ) {
            setIsOpen(true);
        }
    }, [latestVersion, isUpdateAvailable]);

    /**
     * Compares two version strings and returns true if version A is newer than version B.
     * Versions should be in format "x.y.z" where x, y, z are numbers.
     *
     * @param versionA First version string to compare
     * @param versionB Second version string to compare
     * @returns boolean True if versionA is newer than versionB
     */
    function isNewerVersion(versionA: string, versionB: string): boolean {
        // Remove any leading 'v' if present
        const cleanVersionA = versionA.startsWith("v")
            ? versionA.substring(1)
            : versionA;
        const cleanVersionB = versionB.startsWith("v")
            ? versionB.substring(1)
            : versionB;

        // Split versions into components
        const componentsA = cleanVersionA.split(".").map(Number);
        const componentsB = cleanVersionB.split(".").map(Number);

        // Compare each component
        const maxLength = Math.max(componentsA.length, componentsB.length);

        for (let i = 0; i < maxLength; i++) {
            // Default to 0 if the component doesn't exist
            const valueA = i < componentsA.length ? componentsA[i] : 0;
            const valueB = i < componentsB.length ? componentsB[i] : 0;

            if (valueA > valueB) {
                return true;
            }

            if (valueA < valueB) {
                return false;
            }

            // If they're equal, continue to the next component
        }

        // If we get here, all components were equal
        return false;
    }

    // eslint-disable-next-line max-lines-per-function
    function SettingsModalContents() {
        return (
            <div className="bg flex flex-col gap-48">
                <div className="flex flex-col">
                    <div className="flex w-full items-center justify-between gap-16">
                        {error ? (
                            <p className="text-body text-red">{`Error: ${error}`}</p>
                        ) : latestVersion ? (
                            <h1 className="text-h2 text-accent font-mono">
                                {latestVersion}
                            </h1>
                        ) : (
                            <Skeleton className="h-64 w-[40%]" />
                        )}
                    </div>

                    {/* Displays the changelog if available */}
                    {changelog ? (
                        <div className="bg-fg-1 border-stroke rounded-6 mt-4 max-h-[400px] overflow-auto border p-12 text-sm">
                            <StyledMarkdown>{changelog}</StyledMarkdown>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-8">
                            <Skeleton className="h-128 w-[75%]" />
                            <Skeleton className="h-32" />
                            <Skeleton className="h-32" />
                        </div>
                    )}

                    <div className="flex w-full justify-between pt-16">
                        {/* Show the install button only if an update is available and matches user's OS */}
                        {downloadUrls.windows &&
                            navigator.userAgent.indexOf("Win") !== -1 && (
                                <Button
                                    onClick={() =>
                                        window.open(
                                            downloadUrls.windows,
                                            "_blank",
                                        )
                                    }
                                >
                                    <T keyName="versionCheck.installWindows" />
                                </Button>
                            )}
                        {downloadUrls.macArm &&
                            navigator.userAgent.indexOf("Mac") !== -1 && (
                                <Button
                                    onClick={() =>
                                        window.open(
                                            downloadUrls.macArm,
                                            "_blank",
                                        )
                                    }
                                >
                                    <T keyName="versionCheck.installMacArm" />
                                </Button>
                            )}
                        {downloadUrls.macIntel &&
                            navigator.userAgent.indexOf("Mac") !== -1 && (
                                <Button
                                    onClick={() =>
                                        window.open(
                                            downloadUrls.macIntel,
                                            "_blank",
                                        )
                                    }
                                >
                                    <T keyName="versionCheck.installMacIntel" />
                                </Button>
                            )}
                        {downloadUrls.linux &&
                            navigator.userAgent.indexOf("Linux") !== -1 && (
                                <Button
                                    onClick={() =>
                                        window.open(
                                            downloadUrls.linux,
                                            "_blank",
                                        )
                                    }
                                >
                                    <T keyName="versionCheck.installLinux" />
                                </Button>
                            )}{" "}
                        <Button
                            onClick={() => {
                                localStorage.setItem(
                                    "skippedVersion",
                                    latestVersion || "",
                                );
                                setIsOpen(false);
                            }}
                            variant="secondary"
                        >
                            <T keyName="versionCheck.skipVersion" />
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // If the version is the same, don't show the modal
    if (isUpdateAvailable) {
        return (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger
                    asChild
                    className="titlebar-button text-sub hover:text-accent flex cursor-pointer items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
                >
                    <T keyName="versionCheck.trigger" />
                </DialogTrigger>
                <DialogContent className="w-[60rem] max-w-full select-text">
                    <DialogTitle>
                        <T keyName="versionCheck.title" />
                    </DialogTitle>
                    <SettingsModalContents />
                </DialogContent>
            </Dialog>
        );
    } else return null;
}

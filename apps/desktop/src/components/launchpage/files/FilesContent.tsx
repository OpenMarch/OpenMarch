import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useState } from "react";
import { FileDottedIcon, CircleNotchIcon, XIcon } from "@phosphor-icons/react";
import WelcomeContent from "./WelcomeContent";
import { toast } from "sonner";
import { Button } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import { WarningCircleIcon } from "@phosphor-icons/react";

import type { RecentFile } from "electron/main/services/recent-files-service";

// eslint-disable-next-line max-lines-per-function
export default function FilesTabContent() {
    const { t } = useTolgee();

    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        void loadRecentFiles();
    }, []);

    const loadRecentFiles = async () => {
        setIsLoading(true);
        try {
            const files = await window.electron.getRecentFiles();
            setRecentFiles(files);
        } catch (error) {
            console.error("Failed to load recent files:", error);
            toast.error(t("launchpage.files.failedToLoadRecent"));
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenFile = async (file: RecentFile) => {
        try {
            const result = await window.electron.openRecentFile(file.path);
            if (result === 200) {
                // File opened successfully, the app will reload
                console.log("File opened successfully");
            } else {
                toast.error(t("launchpage.files.failedToOpen"));

                // Edge case that file moved/deleted after recent file fetch
                if (!file.isMissing) {
                    // refresh the recent files list, which should confirm file is missing
                    await loadRecentFiles();
                }
            }
        } catch (error) {
            console.error("Failed to open file:", error);
            toast.error(t("launchpage.files.failedToOpen"));
        }
    };

    const handleRemoveFile = async (
        filePath: string,
        event: React.MouseEvent,
    ) => {
        event.stopPropagation(); // Prevent opening the file when clicking the remove button
        try {
            await window.electron.removeRecentFile(filePath);
            void loadRecentFiles(); // Reload the list
        } catch (error) {
            console.error("Failed to remove file from recent list:", error);
            toast.error(t("launchpage.files.failedToRemoveRecent"));
        }
    };

    const handleClearRecentFiles = async () => {
        await window.electron.clearRecentFiles();
        setRecentFiles([]);
    };

    return (
        <Tabs.Content
            value="files"
            className="flex w-full min-w-0 flex-col items-center overflow-y-auto p-6"
        >
            <div className="flex h-full w-full flex-col p-6">
                {recentFiles.length !== 0 && (
                    <div className="flex items-center gap-16">
                        <h2 className="text-h3 font-medium">
                            <T keyName="launchpage.files.title" />
                        </h2>
                        <Button
                            size="compact"
                            variant="secondary"
                            tooltipText={t(
                                "launchpage.files.clearRecentFilesTooltip",
                            )}
                            tooltipDelay={300}
                            tooltipSide="top"
                            onClick={(e) => handleClearRecentFiles()}
                        >
                            <T keyName="launchpage.files.clearRecentFiles" />
                        </Button>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex h-full w-full">
                        <CircleNotchIcon
                            size={32}
                            aria-label="Loading"
                            className="text-text my-8 animate-spin"
                        />
                    </div>
                ) : recentFiles.length === 0 ? (
                    <WelcomeContent />
                ) : (
                    <div className="grid grid-cols-5 gap-12 max-[2000px]:grid-cols-4 max-[1420px]:grid-cols-3 max-[1150px]:grid-cols-2">
                        {recentFiles.map((file) => (
                            <div
                                key={file.path}
                                onClick={() => handleOpenFile(file)}
                                className="bg-fg-1 border-stroke rounded-16 hover:border-accent flex cursor-pointer flex-col items-center gap-12 border p-8 transition-colors"
                            >
                                <div className="bg-fg-2 border-stroke rounded-6 flex aspect-video h-auto w-full items-center justify-center border">
                                    {file.svgPreview ? (
                                        <div className="flex h-fit w-full items-center justify-center">
                                            <img
                                                src={`data:image/svg+xml;base64,${btoa(
                                                    file.svgPreview,
                                                )}`}
                                                alt={t(
                                                    "launchpage.files.fieldPreview",
                                                )}
                                                className="max-h-full max-w-full object-contain"
                                                loading="lazy"
                                            />
                                        </div>
                                    ) : (
                                        <FileDottedIcon
                                            size={32}
                                            className="text-text/40"
                                        />
                                    )}
                                </div>
                                <div className="flex w-full min-w-0 flex-1 justify-between p-4">
                                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-6">
                                        <div className="text-h5 min-w-0 break-words">
                                            {file.name}
                                        </div>
                                        {file.isMissing && (
                                            <div className="text-red text-body flex min-w-0 items-center gap-4">
                                                <WarningCircleIcon
                                                    size={16}
                                                    className="flex-shrink-0"
                                                />
                                                <span className="min-w-0 break-words">
                                                    {t(
                                                        "launchpage.files.movedOrMissing",
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                        <div className="text-text-subtitle text-body min-w-0 break-words">
                                            {new Date(
                                                file.lastOpened,
                                            ).toLocaleDateString()}{" "}
                                            {new Date(
                                                file.lastOpened,
                                            ).toLocaleTimeString(undefined, {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </div>
                                    </div>
                                    <Button
                                        size="compact"
                                        variant="secondary"
                                        tooltipText={t(
                                            "launchpage.files.removeFile",
                                        )}
                                        tooltipDelay={300}
                                        tooltipSide="top"
                                        onClick={(e) =>
                                            handleRemoveFile(file.path, e)
                                        }
                                        className="text-text/40 hover:text-red w-fit rounded-full px-4 transition-all"
                                    >
                                        <XIcon size={16} />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Tabs.Content>
    );
}

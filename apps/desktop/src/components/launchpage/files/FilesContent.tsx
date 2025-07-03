import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useState } from "react";
import {
    TrashIcon,
    FileDottedIcon,
    CircleNotchIcon,
} from "@phosphor-icons/react";
import WelcomeContent from "./WelcomeContent";
import { toast } from "sonner";
import { Button } from "@openmarch/ui";

interface RecentFile {
    path: string;
    name: string;
    lastOpened: number;
    svgPreview?: string;
}

export default function FilesTabContent() {
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadRecentFiles();
    }, []);

    const loadRecentFiles = async () => {
        setIsLoading(true);
        try {
            const files = await window.electron.getRecentFiles();
            setRecentFiles(files);
        } catch (error) {
            console.error("Failed to load recent files:", error);
            toast.error("Failed to load recent files");
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenFile = async (filePath: string) => {
        try {
            const result = await window.electron.openRecentFile(filePath);
            if (result === 200) {
                // File opened successfully, the app will reload
                console.log("File opened successfully");
            }
        } catch (error) {
            console.error("Failed to open file:", error);
            toast.error("Failed to open file");
        }
    };

    const handleRemoveFile = async (
        filePath: string,
        event: React.MouseEvent,
    ) => {
        event.stopPropagation(); // Prevent opening the file when clicking the remove button
        try {
            await window.electron.removeRecentFile(filePath);
            loadRecentFiles(); // Reload the list
        } catch (error) {
            console.error("Failed to remove file from recent list:", error);
            toast.error("Failed to remove file from recent list");
        }
    };

    return (
        <Tabs.Content
            value="files"
            className="flex w-full min-w-0 flex-col items-center overflow-y-auto p-6"
        >
            <div className="flex h-full w-full flex-col p-6">
                {recentFiles.length !== 0 && (
                    <h2 className="text-h3 font-medium">Files</h2>
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
                    <div className="grid grid-cols-4 gap-12 max-[1420px]:grid-cols-3 max-[1150px]:grid-cols-2">
                        {recentFiles.map((file) => (
                            <div
                                key={file.path}
                                onClick={() => handleOpenFile(file.path)}
                                className="bg-fg-2 border-stroke rounded-16 hover:border-accent flex cursor-pointer flex-col items-center justify-between gap-12 border p-8 transition-colors"
                            >
                                <div className="bg-fg-2 border-stroke rounded-6 flex aspect-video h-auto w-full items-center justify-center border">
                                    {file.svgPreview ? (
                                        <div className="flex h-fit w-full items-center justify-center">
                                            <img
                                                src={`data:image/svg+xml;base64,${btoa(
                                                    file.svgPreview,
                                                )}`}
                                                alt="Field Preview"
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
                                <div className="flex w-full items-start justify-between p-4">
                                    <div className="flex flex-col gap-6">
                                        <div className="text-h5 truncate">
                                            {file.name}
                                        </div>
                                        <div className="text-text-subtitle text-body">
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
                                        tooltipText="Remove from recent files"
                                        tooltipDelay={300}
                                        tooltipSide="top"
                                        onClick={(e) =>
                                            handleRemoveFile(file.path, e)
                                        }
                                        className="text-text/40 hover:text-red w-fit rounded-full p-2 transition-all"
                                    >
                                        <TrashIcon size={16} />
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

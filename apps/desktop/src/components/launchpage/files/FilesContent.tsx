import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useState } from "react";
import {
    TrashIcon,
    FileDottedIcon,
    CircleNotchIcon,
} from "@phosphor-icons/react";
import WelcomeContent from "./WelcomeContent";
import { toast } from "sonner";

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
            className="flex w-full min-w-0 flex-col items-center p-6"
        >
            <div className="flex h-full w-fit min-w-[60rem] flex-col p-6">
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
                    <div className="flex flex-col gap-8 overflow-auto">
                        {recentFiles.map((file) => (
                            <div
                                key={file.path}
                                onClick={() => handleOpenFile(file.path)}
                                className="bg-fg-2 border-stroke rounded-6 hover:bg-fg-3 flex cursor-pointer items-center justify-between border p-3 transition-colors"
                            >
                                <div className="flex items-center gap-4 overflow-hidden">
                                    <p>SVG PREVIEW {file.svgPreview}</p>
                                    <div className="relative h-full flex-shrink-0">
                                        <div className="border-stroke/50 bg-fg-1 flex h-full w-40 flex-shrink-0 items-center justify-center overflow-hidden border shadow-sm">
                                            {file.svgPreview ? (
                                                <div
                                                    className="flex h-full w-full items-center justify-center"
                                                    dangerouslySetInnerHTML={{
                                                        __html: file.svgPreview.replace(
                                                            "<svg ",
                                                            '<svg style="max-width:100%; max-height:100%; object-fit:contain;" ',
                                                        ),
                                                    }}
                                                />
                                            ) : (
                                                <FileDottedIcon
                                                    size={32}
                                                    className="text-text/40"
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div className="overflow-hidden">
                                        <div className="truncate font-medium">
                                            {file.name}
                                        </div>
                                        <div className="text-text/60 truncate text-sm">
                                            {file.path}
                                        </div>
                                        <div className="text-text/40 mt-1 text-xs">
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
                                </div>
                                <button
                                    onClick={(e) =>
                                        handleRemoveFile(file.path, e)
                                    }
                                    className="text-text/40 hover:text-destructive hover:bg-fg-1 ml-2 rounded-full p-1 transition-colors"
                                    title="Remove from recent files"
                                >
                                    <TrashIcon size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Tabs.Content>
    );
}

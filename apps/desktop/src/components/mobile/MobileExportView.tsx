import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@openmarch/ui";
import {
    XIcon,
    CircleNotchIcon,
    CheckCircleIcon,
    WarningCircleIcon,
} from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { toast } from "sonner";

type UploadStatus = "idle" | "loading" | "progress" | "error" | "success";

interface UploadProgress {
    status: "loading" | "progress" | "error" | "success";
    message?: string;
    progress?: number;
    error?: string;
}

/**
 * Mobile Export View - The main export functionality
 */
export default function MobileExportView() {
    const { toggleOpen } = useSidebarModalStore();
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [uploadMessage, setUploadMessage] = useState<string>("");
    const [uploadError, setUploadError] = useState<string>("");

    // Subscribe to upload progress updates
    useEffect(() => {
        const unsubscribe = window.electron.onUploadProgress(
            (progress: UploadProgress) => {
                if (progress.status === "loading") {
                    setUploadStatus("loading");
                    setUploadMessage(progress.message || "Preparing...");
                } else if (progress.status === "progress") {
                    setUploadStatus("progress");
                    setUploadProgress(progress.progress || 0);
                    setUploadMessage(progress.message || "Uploading...");
                } else if (progress.status === "error") {
                    setUploadStatus("error");
                    setUploadError(progress.error || "Upload failed");
                    setUploadMessage(progress.error || "Upload failed");
                    toast.error(progress.error || "Upload failed");
                } else if (progress.status === "success") {
                    setUploadStatus("success");
                    setUploadProgress(100);
                    setUploadMessage(progress.message || "Upload successful");
                    toast.success(progress.message || "Upload successful");
                }
            },
        );

        return () => {
            unsubscribe();
        };
    }, []);

    const handleUpload = useCallback(async () => {
        setUploadStatus("loading");
        setUploadProgress(0);
        setUploadMessage("");
        setUploadError("");

        try {
            const result = await window.electron.uploadDatabase();
            if (!result.success) {
                setUploadStatus("error");
                setUploadError(result.error || "Upload failed");
                toast.error(result.error || "Upload failed");
            }
            // Success is handled via progress callback
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            setUploadStatus("error");
            setUploadError(errorMessage);
            toast.error(errorMessage);
        }
    }, []);

    const isUploading =
        uploadStatus === "loading" || uploadStatus === "progress";
    const hasError = uploadStatus === "error";
    const isSuccess = uploadStatus === "success";

    return (
        <section className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Export to Mobile</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[30rem] grow flex-col gap-16 overflow-y-auto">
                <div className="flex flex-col gap-12">
                    <Button
                        onClick={handleUpload}
                        disabled={isUploading}
                        className="w-full"
                    >
                        {isUploading ? (
                            <span className="flex items-center gap-8">
                                <CircleNotchIcon
                                    size={16}
                                    className="animate-spin"
                                />
                                Pushing to Devices...
                            </span>
                        ) : isSuccess ? (
                            <span className="flex items-center gap-8">
                                <CheckCircleIcon size={16} />
                                Push to Devices
                            </span>
                        ) : (
                            "Push to Devices"
                        )}
                    </Button>

                    {/* Progress Display */}
                    {(isUploading || isSuccess) && (
                        <div className="flex flex-col gap-8">
                            {/* Progress Bar */}
                            <div className="rounded-6 bg-stroke h-8 w-full overflow-hidden">
                                <div
                                    className="bg-accent h-full transition-all duration-300 ease-out"
                                    style={{
                                        width: `${uploadProgress}%`,
                                    }}
                                />
                            </div>

                            {/* Status Message */}
                            {uploadMessage && (
                                <p className="text-body text-text-subtitle">
                                    {uploadMessage}
                                </p>
                            )}

                            {/* Progress Percentage */}
                            {uploadStatus === "progress" && (
                                <p className="text-body text-text-subtitle">
                                    {Math.round(uploadProgress)}%
                                </p>
                            )}
                        </div>
                    )}

                    {/* Error Display */}
                    {hasError && uploadError && (
                        <div className="rounded-6 bg-red/10 text-body text-red flex items-center gap-8 p-12">
                            <WarningCircleIcon size={16} />
                            <span>{uploadError}</span>
                        </div>
                    )}

                    {/* Success Message */}
                    {isSuccess && (
                        <div className="rounded-6 bg-green/10 text-body text-green flex items-center gap-8 p-12">
                            <CheckCircleIcon size={16} />
                            <span>Database uploaded successfully!</span>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

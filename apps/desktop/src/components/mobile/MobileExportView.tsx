import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Button,
    DialogTrigger,
    Dialog,
    DialogContent,
    DialogTitle,
    Input,
} from "@openmarch/ui";
import {
    CircleNotchIcon,
    CheckCircleIcon,
    WarningCircleIcon,
    GearSixIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import DetachButton from "./DetachButton";
import { Production } from "./queries/useProductions";
import { twMerge } from "tailwind-merge";

type UploadStatus = "idle" | "loading" | "progress" | "error" | "success";

interface UploadProgress {
    status: "loading" | "progress" | "error" | "success";
    message?: string;
    progress?: number;
    error?: string;
}

type RevisionItem = {
    id: number;
    pushed_at: Date;
    title: string;
};

// Fake revisions data for now (timestamps in UTC)
const FAKE_REVISIONS: RevisionItem[] = [];
//  [
//     {
//         id: 1,
//         title: "Add new music",
//         pushed_at: new Date("2026-01-02T02:13:00Z"),
//     },
//     {
//         id: 3,
//         title: "Opener first sets",
//         pushed_at: new Date("2025-12-30T01:09:00Z"),
//     },
//     {
//         id: 2,
//         title: "Stage Color guard",
//         pushed_at: new Date("2026-01-02T01:30:00Z"),
//     },
// ];

/**
 * Mobile Export View - The main export functionality
 */
export default function MobileExportView({
    currentProduction,
}: {
    currentProduction: Production;
}) {
    return (
        <section className="animate-scale-in flex h-full w-fit flex-col">
            <div className="flex w-[30rem] grow flex-col gap-16 overflow-y-auto">
                <_SubmitRevisionForm isFirstRevision={false} />
                <_RevisionsList
                    revisions={FAKE_REVISIONS}
                    activeRevisionId={1}
                    key={currentProduction.active_revision?.id || "none"}
                />
            </div>
        </section>
    );
}

const formatRevisionDate = (date: Date): string => {
    // Date methods (getDate, getMonth, getHours, etc.) automatically convert UTC to local timezone
    const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];

    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const amOrPm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");

    // Get ordinal suffix for day
    const getOrdinal = (n: number): string => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    return `${month} ${getOrdinal(day)}, ${year} ${displayHours}:${displayMinutes}${amOrPm}`;
};

export const _SubmitRevisionForm = ({
    isFirstRevision,
}: {
    isFirstRevision: boolean;
}) => {
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [uploadMessage, setUploadMessage] = useState<string>("");
    const [uploadError, setUploadError] = useState<string>("");
    const [revisionTitle, setRevisionTitle] = useState<string>(
        isFirstRevision ? "Initial revision" : "",
    );
    const [titleError, setTitleError] = useState<string>("");
    const pushDisabled =
        uploadStatus === "loading" ||
        uploadStatus === "progress" ||
        uploadStatus === "success";

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
        // Validate revision title if not first revision
        if (!isFirstRevision && !revisionTitle.trim()) {
            setTitleError("Please provide a revision title");
            return;
        }

        setTitleError("");
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
    }, [isFirstRevision, revisionTitle]);

    const isUploading =
        uploadStatus === "loading" || uploadStatus === "progress";
    const hasError = uploadStatus === "error";
    const isSuccess = uploadStatus === "success";

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void handleUpload();
    };

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setRevisionTitle(e.target.value);
        if (titleError) {
            setTitleError("");
        }
    };

    return (
        <>
            {/* New Revision Section */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-12">
                <div className="flex flex-col gap-6" hidden={isFirstRevision}>
                    <label className="text-body text-text-subtitle">
                        New revision title
                    </label>
                    <Input
                        placeholder="Describe what changed..."
                        value={revisionTitle}
                        onChange={handleTitleChange}
                        className={twMerge(
                            "w-full",
                            titleError && "border-red focus:border-red",
                        )}
                    />
                    {titleError && (
                        <p className="text-body text-red">{titleError}</p>
                    )}
                </div>
                <div className="flex items-center gap-8">
                    <Button
                        type="submit"
                        disabled={pushDisabled}
                        className="flex-1"
                    >
                        {isUploading ? (
                            <span className="flex items-center gap-8">
                                <CircleNotchIcon
                                    size={16}
                                    className="animate-spin"
                                />
                                Pushing to Mobile App...
                            </span>
                        ) : isSuccess ? (
                            <span className="flex items-center gap-8">
                                <CheckCircleIcon size={16} />
                                Push to Mobile App
                            </span>
                        ) : (
                            "Push to Mobile App"
                        )}
                    </Button>
                    <MobileExportSettingsDialog />
                </div>
            </form>

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
                <div className="rounded-6 bg-green/10 text-body text-accent flex items-center gap-8 p-12">
                    <CheckCircleIcon size={16} />
                    <span>Database uploaded successfully!</span>
                </div>
            )}
        </>
    );
};

export const _RevisionsList = ({
    revisions,
    activeRevisionId,
}: {
    revisions: RevisionItem[];
    activeRevisionId: number;
}) => {
    if (revisions.length === 0) {
        return (
            <h4
                className="text-text-subtitle text-body text-center"
                aria-label="No revisions message"
            >
                Revisions help you keep track of what is currently being shown
                on the performers' devices. Upload your first revision to get
                started.
            </h4>
        );
    }
    return (
        <div className="flex flex-col gap-6">
            <h2 className="text-body text-text-subtitle">All revisions</h2>
            <div className="flex flex-col gap-8">
                {revisions
                    .sort(
                        (a, b) => b.pushed_at.getTime() - a.pushed_at.getTime(),
                    )
                    .map((revision) => (
                        <div
                            key={revision.id}
                            className={twMerge(
                                "rounded-6 bg-fg-2 flex flex-col gap-4 border p-12",
                                activeRevisionId === revision.id
                                    ? "border-accent"
                                    : "border-stroke",
                            )}
                        >
                            <div>
                                <div className="text-body font-semibold">
                                    {revision.title}
                                </div>
                                {activeRevisionId === revision.id && (
                                    <div className="text-body text-accent">
                                        Currently active
                                    </div>
                                )}
                            </div>
                            <div className="text-body text-text-subtitle">
                                {formatRevisionDate(revision.pushed_at)}
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    );
};

const MobileExportSettingsDialog = () => {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary">
                    <GearSixIcon size={16} /> Settings
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[32rem]">
                <DialogTitle>Export Settings</DialogTitle>
                <div className="flex flex-col gap-16">
                    {/* Settings content will go here */}
                    <DetachButton variant="secondary" />
                </div>
            </DialogContent>
        </Dialog>
    );
};

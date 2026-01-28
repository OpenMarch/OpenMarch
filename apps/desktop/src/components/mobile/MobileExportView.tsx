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
    WarningCircleIcon,
    GearSixIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import DetachButton from "./DetachButton";
import {
    Production,
    RevisionPreview,
    uploadRevisionMutationOptions,
} from "./queries/useProductions";
import { twMerge } from "tailwind-merge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { animated, useTransition } from "@react-spring/web";

type UploadStatus = "idle" | "loading" | "error";

interface UploadProgress {
    status: "loading" | "progress" | "error" | "success";
    message?: string;
    progress?: number;
    error?: string;
}

/**
 * Mobile Export View - The main export functionality
 */
export default function MobileExportView({
    currentProduction,
}: {
    currentProduction: Production;
}) {
    return (
        <section className="animate-scale-in flex h-full w-full flex-col">
            <div className="flex grow flex-col gap-16 overflow-y-auto">
                <SubmitRevisionForm isFirstRevision={false} />
                <RevisionsList
                    revisions={currentProduction.revisions}
                    activeRevisionId={currentProduction.active_revision_id}
                    key={currentProduction.id}
                />
            </div>
        </section>
    );
}

const MAX_ERROR_DISPLAY_LENGTH = 120;

/**
 * Logs the full error and returns a truncated message for the UI.
 */
function toDisplayError(fullError: string): string {
    if (fullError.length <= MAX_ERROR_DISPLAY_LENGTH) return fullError;
    const looksLikeHtml =
        fullError.trimStart().startsWith("<") ||
        fullError.toLowerCase().includes("<!doctype") ||
        fullError.toLowerCase().includes("<html");
    if (looksLikeHtml) {
        return "Upload failed. Check console for details.";
    }
    return `${fullError.slice(0, MAX_ERROR_DISPLAY_LENGTH)}…`;
}

const formatRevisionDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Show relative time if less than 7 days ago
    if (diffDays < 7) {
        if (diffMinutes < 1) {
            return "Just now";
        } else if (diffMinutes < 60) {
            return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
        } else {
            return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
        }
    }

    // Show full formatted date if 7 days or older
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

    // Add weekday at the start
    return `${month} ${getOrdinal(day)}, ${year} - ${displayHours}:${displayMinutes}${amOrPm}`;
};

export const SubmitRevisionForm = ({
    isFirstRevision,
}: {
    isFirstRevision: boolean;
}) => {
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
    const [uploadError, setUploadError] = useState<string>("");
    const [revisionTitle, setRevisionTitle] = useState<string>(
        isFirstRevision ? "Initial revision" : "",
    );
    const [titleError, setTitleError] = useState<string>("");
    const queryClient = useQueryClient();
    const { mutate: uploadRevision } = useMutation(
        uploadRevisionMutationOptions({
            queryClient,
            onError: (error) => {
                const errorMessage =
                    error instanceof Error ? error.message : String(error);
                console.error("Upload error:", error);
                const display = toDisplayError(errorMessage);
                setUploadStatus("error");
                setUploadError(display);
                toast.error(display);
            },
        }),
    );

    // Subscribe to upload progress updates
    useEffect(() => {
        const unsubscribe = window.electron.onUploadProgress(
            (progress: UploadProgress) => {
                if (
                    progress.status === "loading" ||
                    progress.status === "progress"
                ) {
                    setUploadStatus("loading");
                } else if (progress.status === "error") {
                    const raw = progress.error || "Upload failed";
                    console.error("Upload error:", raw);
                    const display = toDisplayError(raw);
                    setUploadStatus("error");
                    setUploadError(display);
                    toast.error(display);
                } else if (progress.status === "success") {
                    setUploadStatus("idle");
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
        setUploadError("");

        const title = isFirstRevision
            ? "Initial revision"
            : revisionTitle.trim();
        uploadRevision({ title });
    }, [isFirstRevision, revisionTitle, uploadRevision]);

    const isUploading = uploadStatus === "loading";
    const hasError = uploadStatus === "error";

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
                        disabled={isUploading}
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
                        ) : (
                            "Push to Mobile App"
                        )}
                    </Button>
                    <MobileExportSettingsDialog />
                </div>
            </form>

            {/* Error Display */}
            {hasError && uploadError && (
                <div className="rounded-6 bg-red/10 text-body text-red flex items-center gap-8 p-12">
                    <WarningCircleIcon size={16} />
                    <span>{uploadError}</span>
                </div>
            )}
        </>
    );
};

// Smooth spring config for fluid, professional animations
const REVISION_SPRING_CONFIG = { tension: 280, friction: 36 };

// Estimated height per revision item (card height + gap)
const REVISION_ITEM_HEIGHT = 80;

export const RevisionsList = ({
    revisions,
    activeRevisionId,
}: {
    revisions: RevisionPreview[];
    activeRevisionId: number | null;
}) => {
    const sortedRevisions = useMemo(
        () =>
            [...revisions].sort(
                (a, b) =>
                    new Date(b.pushed_at).getTime() -
                    new Date(a.pushed_at).getTime(),
            ),
        [revisions],
    );

    // Map each revision with its calculated Y position for smooth layout transitions
    const revisionsWithPositions = useMemo(
        () =>
            sortedRevisions.map((revision, index) => ({
                ...revision,
                y: index * REVISION_ITEM_HEIGHT,
            })),
        [sortedRevisions],
    );

    const transitions = useTransition(revisionsWithPositions, {
        keys: (item) => item.id,
        from: { opacity: 0, scale: 0.85, y: -40, height: 0 },
        enter: (item) => async (next) => {
            await next({ opacity: 1, scale: 1, y: item.y, height: 80 });
        },
        update: (item) => ({ y: item.y }),
        leave: { opacity: 0, scale: 0.92, y: -20, height: 0 },
        config: REVISION_SPRING_CONFIG,
    });

    if (revisions.length === 0) {
        return (
            <h4
                className="text-text-subtitle text-body text-center"
                aria-label="No revisions message"
            >
                Revisions help you keep track of what is currently being shown
                on the performers&apos; devices. Upload your first revision to
                get started.
            </h4>
        );
    }

    return (
        <section className="flex flex-col gap-6" aria-label="Revisions list">
            <h2 className="text-body text-text-subtitle">All revisions</h2>
            <div
                className="relative"
                style={{
                    height: sortedRevisions.length * REVISION_ITEM_HEIGHT,
                }}
            >
                {transitions((style, revision) => (
                    <animated.div
                        style={{
                            position: "absolute",
                            width: "100%",
                            transform: style.y.to(
                                (y) => `translate3d(0, ${y}px, 0)`,
                            ),
                            opacity: style.opacity,
                            scale: style.scale.to((s) => `${s}`),
                        }}
                    >
                        <div
                            className={twMerge(
                                "rounded-6 bg-fg-2 flex flex-col gap-4 border p-12",
                                activeRevisionId === revision.id
                                    ? "border-accent"
                                    : "border-stroke",
                            )}
                        >
                            <h4 className="text-body font-semibold">
                                {revision.title}
                            </h4>
                            <div className="space-between flex">
                                <div className="text-body text-text-subtitle flex-grow">
                                    {formatRevisionDate(revision.pushed_at)}
                                </div>

                                {activeRevisionId === revision.id && (
                                    <div className="text-body text-accent">
                                        Currently active
                                    </div>
                                )}
                            </div>
                        </div>
                    </animated.div>
                ))}
            </div>
        </section>
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

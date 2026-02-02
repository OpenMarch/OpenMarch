import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Button, Input } from "@openmarch/ui";
import {
    CircleNotchIcon,
    WarningCircleIcon,
    DeviceMobileIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
    Production,
    RevisionPreview,
    uploadRevisionMutationOptions,
    productionKeys,
    AudioFilesIndexResponse,
} from "./queries/useProductions";
import { twMerge } from "tailwind-merge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { animated, useTransition } from "@react-spring/web";
import { MobileExportSettingsDialog } from "./settings/MobileExportSettings";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import AudioFile from "@/global/classes/AudioFile";
import { apiGet, apiPatch, apiPostFormData } from "@/auth/api-client";
import {
    isSilentPlaceholder,
    prepareAudioSyncResult,
    buildAudioUploadFormDataWithDuration,
    type AudioSyncResult,
} from "./utilities/audioSyncOnUpload";
import {
    prepareBackgroundImageSyncResult,
    buildBackgroundImageFormData,
    type BackgroundImageSyncResult,
} from "./utilities/backgroundImageSyncOnUpload";
import { getFieldPropertiesImage } from "@/global/classes/FieldProperties";

type UploadStatus = "idle" | "loading" | "error";

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
                <SubmitRevisionForm
                    isFirstRevision={false}
                    productionId={currentProduction.id}
                    currentProduction={currentProduction}
                />
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
    productionId,
    currentProduction,
}: {
    isFirstRevision: boolean;
    productionId?: number;
    currentProduction?: Production;
}) => {
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
    const [uploadError, setUploadError] = useState<string>("");
    const [revisionTitle, setRevisionTitle] = useState<string>(
        isFirstRevision ? "Initial revision" : "",
    );
    const [titleError, setTitleError] = useState<string>("");
    const [audioSyncResult, setAudioSyncResult] =
        useState<AudioSyncResult | null>(null);
    const [audioSyncLoading, setAudioSyncLoading] = useState(false);
    const [backgroundSyncResult, setBackgroundSyncResult] =
        useState<BackgroundImageSyncResult | null>(null);
    const [backgroundSyncLoading, setBackgroundSyncLoading] = useState(false);
    const queryClient = useQueryClient();
    const selectedAudioFile = useSelectedAudioFile()?.selectedAudioFile;

    const hasSelectedNonSilentAudio =
        selectedAudioFile != null &&
        !isSilentPlaceholder(selectedAudioFile.path, selectedAudioFile.id);

    useEffect(() => {
        if (
            productionId == null ||
            selectedAudioFile == null ||
            isSilentPlaceholder(selectedAudioFile.path, selectedAudioFile.id)
        ) {
            setAudioSyncResult(null);
            setAudioSyncLoading(false);
            return;
        }
        let cancelled = false;
        setAudioSyncLoading(true);
        void (async () => {
            try {
                const fullFile = await AudioFile.getSelectedAudioFile();
                if (cancelled || fullFile == null) return;
                const response = await apiGet<AudioFilesIndexResponse>(
                    `v1/productions/${productionId}/audio_files`,
                );
                if (cancelled) return;
                const result = await prepareAudioSyncResult(
                    fullFile,
                    response.audio_files,
                    AudioFile.computeChecksum,
                );
                if (cancelled) return;
                setAudioSyncResult(result);
            } catch (err) {
                if (!cancelled) {
                    console.error("Audio sync prep failed:", err);
                    setAudioSyncResult(null);
                }
            } finally {
                if (!cancelled) setAudioSyncLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [productionId, selectedAudioFile]);

    useEffect(() => {
        if (productionId == null || currentProduction == null) {
            setBackgroundSyncResult(null);
            setBackgroundSyncLoading(false);
            return;
        }
        let cancelled = false;
        setBackgroundSyncLoading(true);
        void (async () => {
            try {
                const localImage = await getFieldPropertiesImage();
                if (cancelled) return;
                const result = await prepareBackgroundImageSyncResult(
                    localImage,
                    currentProduction.background_image_checksum ?? null,
                    AudioFile.computeChecksum,
                );
                if (cancelled) return;
                setBackgroundSyncResult(result);
            } catch (err) {
                if (!cancelled) {
                    console.error("Background image sync prep failed:", err);
                    setBackgroundSyncResult(null);
                }
            } finally {
                if (!cancelled) setBackgroundSyncLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [productionId, currentProduction]);

    const syncActiveAudioAfterUpload = useCallback(async () => {
        if (productionId == null || audioSyncResult == null) return;
        const { serverAudioFileId, selectedAudioFileWithData } =
            audioSyncResult;
        if (
            isSilentPlaceholder(
                selectedAudioFileWithData.path,
                selectedAudioFileWithData.id,
            )
        ) {
            return;
        }
        try {
            if (serverAudioFileId != null) {
                await apiPatch(`v1/productions/${productionId}`, {
                    default_audio_file_id: serverAudioFileId,
                });
            } else {
                const formData = await buildAudioUploadFormDataWithDuration(
                    selectedAudioFileWithData,
                );
                await apiPostFormData(
                    `v1/productions/${productionId}/audio_files`,
                    formData,
                );
            }
            void queryClient.invalidateQueries({
                queryKey: productionKeys.byId(productionId),
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("Failed to set active audio on server:", err);
            toast.error(`Revision uploaded, but audio sync failed: ${msg}`);
        }
    }, [productionId, audioSyncResult, queryClient]);

    const syncBackgroundImageAfterUpload = useCallback(async () => {
        if (
            productionId == null ||
            backgroundSyncResult == null ||
            !backgroundSyncResult.needsUpload ||
            backgroundSyncResult.imageData == null
        ) {
            return;
        }
        try {
            const formData = buildBackgroundImageFormData(
                backgroundSyncResult.imageData,
            );
            await apiPostFormData(
                `v1/productions/${productionId}/background_image`,
                formData,
            );
            void queryClient.invalidateQueries({
                queryKey: productionKeys.byId(productionId),
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("Failed to sync background image on server:", err);
            toast.error(
                `Revision uploaded, but background image sync failed: ${msg}`,
            );
        }
    }, [productionId, backgroundSyncResult, queryClient]);

    const { mutate: uploadRevision } = useMutation(
        uploadRevisionMutationOptions({
            queryClient,
            onSuccess: async () => {
                setUploadStatus("idle");
                setRevisionTitle("");
                toast.success("Upload successful");
                await Promise.all([
                    syncActiveAudioAfterUpload(),
                    syncBackgroundImageAfterUpload(),
                ]);
            },
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
    const disableUpload =
        isUploading ||
        (hasSelectedNonSilentAudio && audioSyncLoading) ||
        backgroundSyncLoading;

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
                        disabled={isUploading}
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
                        disabled={disableUpload}
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
                        ) : (hasSelectedNonSilentAudio && audioSyncLoading) ||
                          backgroundSyncLoading ? (
                            <span className="flex items-center gap-8">
                                <CircleNotchIcon
                                    size={16}
                                    className="animate-spin"
                                />
                                Preparing...
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
                            <h4 className="text-body truncate font-semibold">
                                {revision.title}
                            </h4>
                            <div className="space-between flex">
                                <div className="text-body text-text-subtitle flex-grow">
                                    {formatRevisionDate(revision.pushed_at)}
                                </div>

                                {activeRevisionId === revision.id && (
                                    <span className="text-body text-accent inline-flex items-center gap-4">
                                        Active <DeviceMobileIcon />
                                    </span>
                                )}
                            </div>
                        </div>
                    </animated.div>
                ))}
            </div>
        </section>
    );
};

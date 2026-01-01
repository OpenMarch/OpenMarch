import Beat, { durationToTempo } from "@/global/classes/Beat";
import Measure from "@/global/classes/Measure";
import {
    updateMeasuresMutationOptions,
    createMeasuresMutationOptions,
    updateBeatsMutationOptions,
    createBeatsMutationOptions,
    deleteBeatsMutationOptions,
    createMeasuresAndBeatsMutationOptions,
    deleteMeasuresAndBeatsMutationOptions,
    deleteMeasuresMutationOptions,
} from "@/hooks/queries";
import { conToastError } from "@/utilities/utils";
import { Input, Button, UnitInput } from "@openmarch/ui";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { useTolgee, T } from "@tolgee/react";

// Module-level state to track the currently open menu
let currentOpenMenu: (() => void) | null = null;

const BeatOrMeasureContextMenu = ({
    beat,
    measure,
    beatIdsOnPages,
    children,
}: {
    beat: Beat;
    measure: Measure | null;
    beatIdsOnPages: Set<number>;
    children: React.ReactNode;
}) => {
    const [open, setOpen] = useState(false);
    const closeRef = useRef<(() => void) | null>(null);

    const handleClose = useCallback(() => {
        setOpen(false);
        // Clear the reference if this menu was the currently open one
        if (currentOpenMenu === closeRef.current) {
            currentOpenMenu = null;
        }
    }, []);

    const handleClick = (e: React.MouseEvent) => {
        // Only handle left click (button 0)
        if (e.button === 0 || e.type === "click") {
            // Close any currently open menu
            if (currentOpenMenu) {
                currentOpenMenu();
            }
            // Set this menu as the currently open one
            closeRef.current = handleClose;
            currentOpenMenu = handleClose;
            setOpen(true);
        }
    };

    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                handleClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, handleClose]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (currentOpenMenu === closeRef.current) {
                currentOpenMenu = null;
            }
        };
    }, []);

    // const handleContextMenu = (e: React.MouseEvent) => {
    //     e.preventDefault();
    //     e.stopPropagation();
    //     setOpen(true);
    // };

    return (
        <Popover.Root
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen) {
                    handleClose();
                }
            }}
        >
            <Popover.Trigger asChild onClick={handleClick}>
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="bg-modal text-text rounded-6 border-stroke shadow-modal z-50 m-6 flex flex-col gap-8 border p-16 py-12 backdrop-blur-md"
                    sideOffset={5}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <ContextMenuContent
                        beat={beat}
                        measure={measure}
                        beatIdsOnPages={beatIdsOnPages}
                        closeParent={handleClose}
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

const RehearsalMarkInput = ({
    measure,
    closeParent,
}: {
    measure: Measure | null;
    closeParent: () => void;
}) => {
    const [rehearsalMark, setRehearsalMark] = useState(
        measure?.rehearsalMark ?? "",
    );
    const queryClient = useQueryClient();
    const tolgee = useTolgee();
    const updateMeasureMutation = useMutation(
        updateMeasuresMutationOptions(queryClient),
    );

    // Update rehearsal mark when measure changes
    useEffect(() => {
        setRehearsalMark(measure?.rehearsalMark ?? "");
    }, [measure?.rehearsalMark]);

    const saveRehearsalMark = () => {
        if (!measure) return;

        const trimmedMark = rehearsalMark.trim();
        const currentMark = measure.rehearsalMark?.trim() ?? "";

        // Only update if the value has changed
        if (trimmedMark === currentMark) {
            return;
        }

        updateMeasureMutation.mutate(
            [
                {
                    id: measure.id,
                    rehearsal_mark: trimmedMark || null,
                },
            ],
            {
                onSuccess: () => {
                    closeParent();
                },
                onError: (error) => {
                    conToastError(
                        tolgee.t("audio.contextMenu.rehearsalMark.errorSaving"),
                        error,
                    );
                },
            },
        );
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            saveRehearsalMark();
        }
    };

    if (!measure) return null;

    return (
        <>
            <label className="text-text text-body">
                <T keyName="audio.contextMenu.rehearsalMark.label" />
            </label>
            <Input
                type="text"
                value={rehearsalMark}
                onChange={(e) => setRehearsalMark(e.target.value)}
                onBlur={saveRehearsalMark}
                onKeyDown={handleKeyDown}
                onClick={(e) => {
                    e.stopPropagation();
                }}
                onMouseDown={(e) => {
                    e.currentTarget.focus();
                    e.preventDefault();
                    e.stopPropagation();
                }}
                disabled={updateMeasureMutation.isPending}
            />
        </>
    );
};

const TempoInput = ({
    hasMeasure,
    beat,
    closeParent,
}: {
    hasMeasure: boolean;
    beat: Beat;
    closeParent: () => void;
}) => {
    // Convert duration to BPM for display
    const initialTempo = durationToTempo(beat.duration);
    const [tempo, setTempo] = useState(initialTempo.toString());
    const queryClient = useQueryClient();
    const tolgee = useTolgee();
    const mutation = useMutation(updateBeatsMutationOptions(queryClient));

    const saveTempo = () => {
        const newTempo = parseFloat(tempo);

        if (isNaN(newTempo) || newTempo <= 0) {
            // Reset to original value if invalid
            const currentTempo = durationToTempo(beat.duration);
            setTempo(currentTempo.toString());
            return;
        }

        // Convert BPM to duration: duration = 60 / BPM
        const newDuration = 60 / newTempo;

        // Truncate to 6 decimal places
        const truncatedDuration = Math.floor(newDuration * 1000000) / 1000000;

        if (truncatedDuration === beat.duration) {
            return;
        }

        mutation.mutate(
            [
                {
                    id: beat.id,
                    duration: truncatedDuration,
                },
            ],
            {
                onSuccess: () => {
                    closeParent();
                },
                onError: (error) => {
                    conToastError(
                        tolgee.t("audio.contextMenu.tempo.errorSaving"),
                        error,
                    );
                },
            },
        );
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            saveTempo();
        }
    };

    const handleBlur = () => {
        saveTempo();
    };

    // Update tempo when beat changes
    useEffect(() => {
        const currentTempo = durationToTempo(beat.duration);
        setTempo(currentTempo.toString());
    }, [beat.duration]);

    return (
        <>
            <label className="text-text text-body">
                <T
                    keyName={
                        hasMeasure
                            ? "audio.contextMenu.tempo.firstBeatTempo"
                            : "audio.contextMenu.tempo.label"
                    }
                />
            </label>
            <UnitInput
                type="number"
                step={1}
                min={1}
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                disabled={mutation.isPending}
                className="w-full"
                unit="BPM"
                autoFocus
            />
        </>
    );
};

const BeatButtons = ({
    beat,
    beatIsOnPage,
    closeParent,
}: {
    beat: Beat;
    beatIsOnPage: boolean;
    closeParent: () => void;
}) => {
    const queryClient = useQueryClient();
    const tolgee = useTolgee();
    const { mutate: createBeat, isPending: isCreatingBeat } = useMutation(
        createBeatsMutationOptions(queryClient),
    );
    const { mutate: deleteBeat, isPending: isDeletingBeat } = useMutation(
        deleteBeatsMutationOptions(queryClient),
    );
    const { mutate: createMeasure, isPending: isCreatingMeasure } = useMutation(
        createMeasuresMutationOptions(queryClient),
    );

    const handleCreateMeasure = () => {
        createMeasure(
            [
                {
                    start_beat: beat.id,
                    rehearsal_mark: null,
                },
            ],
            {
                onSuccess: () => {
                    closeParent();
                },
                onError: (error) => {
                    conToastError(
                        tolgee.t("audio.contextMenu.beat.errorCreatingMeasure"),
                        error,
                    );
                },
            },
        );
    };

    const handleCreateBeat = () => {
        createBeat(
            {
                newBeats: [
                    {
                        duration: beat.duration,
                        include_in_measure: true,
                    },
                ],
                startingPosition: beat.position,
            },
            {
                onSuccess: () => {
                    closeParent();
                },
                onError: (error) => {
                    conToastError(
                        tolgee.t("audio.contextMenu.beat.errorCreating"),
                        error,
                    );
                },
            },
        );
    };

    const handleDeleteBeat = () => {
        deleteBeat(new Set([beat.id]), {
            onSuccess: () => {
                closeParent();
            },
            onError: (error) => {
                conToastError(
                    tolgee.t("audio.contextMenu.beat.errorDeleting"),
                    error,
                );
            },
        });
    };
    return (
        <>
            <Button
                variant="secondary"
                className="mt-8 w-full justify-center"
                size="compact"
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={handleCreateMeasure}
                disabled={isCreatingMeasure}
            >
                <T keyName="audio.contextMenu.beat.markAsMeasure" />
            </Button>
            <div className="flex justify-between">
                <Button
                    variant="red"
                    size="compact"
                    tooltipText={
                        beatIsOnPage
                            ? tolgee.t(
                                  "audio.contextMenu.beat.cannotDeleteOnPage",
                              )
                            : undefined
                    }
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleDeleteBeat}
                    disabled={isDeletingBeat || beatIsOnPage}
                >
                    <TrashIcon />
                </Button>
                <Button
                    variant="primary"
                    size="compact"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleCreateBeat}
                    disabled={isCreatingBeat}
                >
                    <PlusIcon /> <T keyName="audio.contextMenu.beat.addBeat" />
                </Button>
            </div>
        </>
    );
};

const MeasureButtons = ({
    measure,
    anyMeasureBeatOnPage,
    closeParent,
}: {
    measure: Pick<Measure, "id" | "beats">;
    anyMeasureBeatOnPage: boolean;
    closeParent: () => void;
}) => {
    const queryClient = useQueryClient();
    const tolgee = useTolgee();
    const {
        mutate: createMeasuresAndBeats,
        isPending: isCreatingMeasuresAndBeats,
    } = useMutation(createMeasuresAndBeatsMutationOptions(queryClient));

    const {
        mutate: deleteMeasuresAndBeats,
        isPending: isDeletingMeasuresAndBeats,
    } = useMutation(deleteMeasuresAndBeatsMutationOptions(queryClient));
    const { mutate: deleteMeasures, isPending: isDeletingMeasures } =
        useMutation(deleteMeasuresMutationOptions(queryClient));

    const disabled =
        isCreatingMeasuresAndBeats ||
        isDeletingMeasuresAndBeats ||
        isDeletingMeasures;

    const handleDeleteMeasureAndBeats = () => {
        deleteMeasuresAndBeats(new Set([measure.id]), {
            onSuccess: () => {
                closeParent();
            },
            onError: (error) => {
                conToastError(
                    tolgee.t(
                        "audio.contextMenu.measure.errorDeletingMeasureAndBeats",
                    ),
                    error,
                );
            },
        });
    };

    const handleRemoveMeasureMarking = () => {
        deleteMeasures(new Set([measure.id]), {
            onSuccess: () => {
                closeParent();
            },
            onError: (error) => {
                conToastError(
                    tolgee.t("audio.contextMenu.measure.errorRemovingMarking"),
                    error,
                );
            },
        });
    };

    const handleCreateMeasureAndBeats = () => {
        createMeasuresAndBeats(
            {
                beatArgs: measure.beats.map((b) => ({
                    duration: b.duration,
                })),
                startingPosition:
                    measure.beats[measure.beats.length - 1].position,
            },
            {
                onSuccess: () => {
                    closeParent();
                },
                onError: (error) => {
                    conToastError(
                        tolgee.t(
                            "audio.contextMenu.measure.errorCreatingMeasureAndBeats",
                        ),
                        error,
                    );
                },
            },
        );
    };

    return (
        <>
            <Button
                variant="secondary"
                className="mt-8 w-full justify-center"
                size="compact"
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={handleRemoveMeasureMarking}
                disabled={disabled}
            >
                <T keyName="audio.contextMenu.measure.removeMarking" />
            </Button>
            <div className="flex justify-between">
                <Button
                    variant="red"
                    size="compact"
                    tooltipText={
                        anyMeasureBeatOnPage
                            ? tolgee.t(
                                  "audio.contextMenu.measure.cannotDeleteOnPage",
                              )
                            : undefined
                    }
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleDeleteMeasureAndBeats}
                    disabled={
                        isDeletingMeasuresAndBeats || anyMeasureBeatOnPage
                    }
                >
                    <TrashIcon />
                </Button>
                <Button
                    variant="primary"
                    size="compact"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleCreateMeasureAndBeats}
                    disabled={disabled}
                >
                    <PlusIcon />{" "}
                    <T keyName="audio.contextMenu.measure.addMeasure" />
                </Button>
            </div>
        </>
    );
};

const ContextMenuContent = ({
    beat,
    measure,
    closeParent,
    beatIdsOnPages,
}: {
    beat: Beat;
    measure: Measure | null;
    closeParent: () => void;
    beatIdsOnPages: Set<number>;
}) => {
    const tolgee = useTolgee();
    return (
        <div
            className="flex flex-col gap-8"
            aria-label={tolgee.t("audio.contextMenu.ariaLabel")}
        >
            <RehearsalMarkInput measure={measure} closeParent={closeParent} />
            <TempoInput
                beat={beat}
                closeParent={closeParent}
                hasMeasure={measure != null}
            />
            {measure ? (
                <MeasureButtons
                    measure={measure}
                    anyMeasureBeatOnPage={measure.beats.some((b) =>
                        beatIdsOnPages.has(b.id),
                    )}
                    closeParent={closeParent}
                />
            ) : (
                <BeatButtons
                    beat={beat}
                    beatIsOnPage={beatIdsOnPages.has(beat.id)}
                    closeParent={closeParent}
                />
            )}
        </div>
    );
};

export default BeatOrMeasureContextMenu;

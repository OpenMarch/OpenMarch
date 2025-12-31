import Beat, { durationToTempo } from "@/global/classes/Beat";
import Measure from "@/global/classes/Measure";
import {
    updateMeasuresMutationOptions,
    createMeasuresMutationOptions,
    updateBeatsMutationOptions,
    createBeatsMutationOptions,
    deleteBeatsMutationOptions,
} from "@/hooks/queries";
import { Input, Button, UnitInput } from "@openmarch/ui";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";

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

    const handleClick = (e: React.MouseEvent) => {
        // Only handle left click (button 0)
        if (e.button === 0 || e.type === "click") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger
                asChild
                onClick={handleClick}
                onContextMenu={handleContextMenu}
            >
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="bg-modal text-text rounded-6 border-stroke shadow-modal z-50 m-6 flex flex-col gap-8 border p-16 py-12 backdrop-blur-md"
                    sideOffset={5}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="flex flex-col gap-16">
                        <MeasureContextMenuContent
                            beat={beat}
                            measure={measure}
                            onClose={() => setOpen(false)}
                        />
                        <BeatContextMenuContent
                            beat={beat}
                            beatIdsOnPages={beatIdsOnPages}
                            onClose={() => setOpen(false)}
                        />
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

const MeasureContextMenuContent = ({
    beat,
    measure,
    onClose,
}: {
    beat: Beat;
    measure: Measure | null;
    onClose: () => void;
}) => {
    const [rehearsalMark, setRehearsalMark] = useState(
        measure?.rehearsalMark ?? "",
    );
    const rehearsalMarkInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const updateMeasureMutation = useMutation(
        updateMeasuresMutationOptions(queryClient),
    );
    const createMeasureMutation = useMutation(
        createMeasuresMutationOptions(queryClient),
    );

    // Update rehearsal mark when measure changes
    useEffect(() => {
        setRehearsalMark(measure?.rehearsalMark ?? "");
    }, [measure?.rehearsalMark]);

    const handleCreateMeasure = () => {
        createMeasureMutation.mutate([
            {
                start_beat: beat.id,
                rehearsal_mark: null,
            },
        ]);
        onClose();
    };

    const handleRehearsalMarkBlur = () => {
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
                    onClose();
                },
            },
        );
    };

    return (
        <div className="flex flex-col gap-8" aria-label="Measure context menu">
            <h4 className="text-text-subtitle text-sm">Measure</h4>

            {measure ? (
                <>
                    <label className="text-text text-body">
                        Rehearsal Mark
                    </label>
                    <Input
                        ref={rehearsalMarkInputRef}
                        type="text"
                        value={rehearsalMark}
                        onChange={(e) => setRehearsalMark(e.target.value)}
                        onBlur={handleRehearsalMarkBlur}
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
            ) : (
                <Button
                    variant="secondary"
                    className="w-full justify-center text-xs"
                    size="compact"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleCreateMeasure}
                    disabled={createMeasureMutation.isPending}
                >
                    <PlusIcon /> Create Measure
                </Button>
            )}
        </div>
    );
};

const BeatContextMenuContent = ({
    beat,
    onClose,
    beatIdsOnPages,
}: {
    beat: Beat;
    onClose: () => void;
    beatIdsOnPages: Set<number>;
}) => {
    // Convert duration to BPM for display
    const initialTempo = durationToTempo(beat.duration);
    const [tempo, setTempo] = useState(initialTempo.toString());
    const queryClient = useQueryClient();
    const mutation = useMutation(updateBeatsMutationOptions(queryClient));
    const createBeatMutation = useMutation(
        createBeatsMutationOptions(queryClient),
    );
    const deleteBeatMutation = useMutation(
        deleteBeatsMutationOptions(queryClient),
    );

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
            onClose();
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
                    onClose();
                },
            },
        );
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
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

    const handleCreateBeat = () => {
        createBeatMutation.mutate({
            newBeats: [
                {
                    duration: beat.duration,
                    include_in_measure: true,
                },
            ],
            startingPosition: beat.position,
        });
    };

    const handleDeleteBeat = () => {
        deleteBeatMutation.mutate(new Set([beat.id]));
    };

    return (
        <div className="flex flex-col gap-8" aria-label="Beat context menu">
            <h4 className="text-text-subtitle text-sm">Beat</h4>
            <label className="text-text text-body">Tempo</label>
            <UnitInput
                type="number"
                step={0.1}
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
            <div className="flex justify-between text-xs">
                <Button
                    variant="red"
                    size="compact"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleDeleteBeat}
                    disabled={mutation.isPending || beatIdsOnPages.has(beat.id)}
                >
                    <TrashIcon />
                </Button>
                <Button
                    variant="primary"
                    size="compact"
                    tooltipText={
                        beatIdsOnPages.has(beat.id)
                            ? "Beats on pages cannot be deleted"
                            : undefined
                    }
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={handleCreateBeat}
                    disabled={mutation.isPending}
                >
                    <PlusIcon /> Add Beat
                </Button>
            </div>
        </div>
    );
};

export default BeatOrMeasureContextMenu;

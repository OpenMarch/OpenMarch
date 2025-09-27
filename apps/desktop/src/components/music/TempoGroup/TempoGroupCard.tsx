import { TempoGroup } from "@/components/music/TempoGroup/TempoGroup";
import { useMemo, useState } from "react";
import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import EditableTempoGroup from "./EditableTempoGroup";
import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogTrigger,
    Button,
    AlertDialogAction,
    AlertDialogCancel,
    TooltipClassName,
} from "@openmarch/ui";
import { AlertDialog } from "@openmarch/ui";
import * as Tooltip from "@radix-ui/react-tooltip";
import { T } from "@tolgee/react";
import { useCascadeDeleteMeasures } from "@/global/classes/Measure";

export default function TempoGroupCard({
    tempoGroup,
    index,
    setNewGroupFormIndex,
}: {
    tempoGroup: TempoGroup;
    index: number;
    setNewGroupFormIndex: (index: number) => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    if (isEditing) {
        return (
            <EditableTempoGroup
                tempoGroup={tempoGroup}
                setIsVisible={setIsEditing}
            />
        );
    }
    return (
        <StaticTempoGroupCard
            tempoGroup={tempoGroup}
            setIsEditing={setIsEditing}
            setNewGroupFormIndex={setNewGroupFormIndex}
            index={index}
        />
    );
}

function StaticTempoGroupCard({
    tempoGroup,
    setIsEditing,
    setNewGroupFormIndex,
    index,
}: {
    tempoGroup: TempoGroup;
    setIsEditing: (isEditing: boolean) => void;
    setNewGroupFormIndex: (index: number) => void;
    index: number;
}) {
    const { mutate: cascadeDeleteMeasures, isPending: isDeleting } =
        useCascadeDeleteMeasures();
    const isManualTempo = useMemo(
        () => !!tempoGroup.manualTempos?.length,
        [tempoGroup.manualTempos],
    );
    const isMixedMeter = useMemo(
        () => !!tempoGroup.strongBeatIndexes?.length && !isManualTempo,
        [tempoGroup.strongBeatIndexes, isManualTempo],
    );
    const trimmedName = tempoGroup.name.trim();
    return (
        <>
            {tempoGroup.name && trimmedName !== "" && trimmedName !== "-" && (
                <div className="bg-fg-2 rounded-6 border-stroke mt-12 flex w-fit min-w-32 border px-8 py-4">
                    <h3 className="text-text-secondary text-h3">
                        {trimmedName}
                    </h3>
                </div>
            )}
            <div
                className={`bg-fg-2 border-stroke rounded-tr-6 rounded-b-6 rounded-6 flex justify-between border p-12`}
            >
                <div className="flex flex-col gap-8">
                    {tempoGroup.manualTempos ? (
                        <div>
                            <h3 className="text-h3">
                                <T keyName="music.custom" />
                            </h3>

                            <div className="flex- flex flex-wrap gap-4">
                                {tempoGroup.manualTempos.map((tempo, index) => (
                                    <div
                                        key={index}
                                        className="rounded-6 border-stroke bg-fg-1 bg-bg-1 border p-8 text-center"
                                    >
                                        {tempo}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <h3 className="text-h3">
                                {tempoGroup.tempo}{" "}
                                <span className="text-text-subtitle text-sm">
                                    {isMixedMeter ? "♩ " : ""}
                                    bpm
                                </span>
                            </h3>
                        </div>
                    )}
                    {tempoGroup.measureRangeString && (
                        <p className="text-text-subtitle text-sm">
                            {tempoGroup.measureRangeString}
                            {tempoGroup.numOfRepeats > 1 &&
                                ` (${tempoGroup.numOfRepeats}x)`}
                        </p>
                    )}
                </div>
                <div className="flex flex-col items-end justify-between gap-4">
                    <h4 className="text-h4 flex items-center gap-8">
                        <div
                            className="bg-fg-1 rounded-6 border-stroke h-fit border px-6 text-sm"
                            hidden={!isMixedMeter}
                        >
                            {Array.from({
                                length: tempoGroup.bigBeatsPerMeasure,
                            })
                                .map((_, i) =>
                                    tempoGroup.strongBeatIndexes?.includes(i)
                                        ? "3"
                                        : "2",
                                )
                                .join("+")}
                        </div>
                        {isMixedMeter
                            ? `${
                                  tempoGroup.bigBeatsPerMeasure * 2 +
                                  (tempoGroup.strongBeatIndexes?.length ?? 0)
                              }/8`
                            : `${tempoGroup.bigBeatsPerMeasure}/4`}
                    </h4>
                    <div className="flex items-center gap-4">
                        <AlertDialog>
                            <AlertDialogTrigger>
                                <button className="hover:text-red text-text duration-150 ease-out">
                                    <TrashIcon size={24} />
                                </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogTitle>
                                    <T keyName="music.deleteTempoGroupAlert" />
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    <T keyName="music.deleteTempoGroupDescription" />
                                </AlertDialogDescription>
                                <div className="flex flex-col items-center justify-center gap-8 align-middle">
                                    <AlertDialogAction>
                                        <Button
                                            variant="red"
                                            className="w-full"
                                            onClick={() => {
                                                cascadeDeleteMeasures(
                                                    tempoGroup.measures ?? [],
                                                );
                                            }}
                                            disabled={
                                                isDeleting ||
                                                !tempoGroup.measures
                                            }
                                        >
                                            <T keyName="music.deleteAllMeasures" />
                                        </Button>
                                    </AlertDialogAction>
                                    <div className="text-sub text-text-subtitle">
                                        <T keyName="music.undoWithCtrlZ" />
                                    </div>
                                    <AlertDialogCancel asChild>
                                        <Button
                                            variant="secondary"
                                            disabled={isDeleting}
                                            className="w-full"
                                        >
                                            <T keyName="music.cancel" />
                                        </Button>
                                    </AlertDialogCancel>
                                </div>
                            </AlertDialogContent>
                        </AlertDialog>

                        <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                                <button
                                    onClick={() => {
                                        setNewGroupFormIndex(index);
                                        setIsEditing(false);
                                    }}
                                    className="hover:text-accent text-text duration-150 ease-out"
                                >
                                    <PlusIcon size={24} />
                                </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                                <Tooltip.Content
                                    className={TooltipClassName}
                                    side="top"
                                >
                                    <T keyName="music.addNewTempoGroupAfter" />
                                </Tooltip.Content>
                            </Tooltip.Portal>
                        </Tooltip.Root>
                        <button
                            onClick={() => setIsEditing(true)}
                            className="hover:text-accent text-text duration-150 ease-out"
                        >
                            <PencilSimpleIcon size={24} />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

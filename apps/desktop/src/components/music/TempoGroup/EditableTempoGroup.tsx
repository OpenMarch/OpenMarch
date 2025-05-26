import {
    isMixedMeterTempoGroup,
    patternStringToLongBeatIndexes,
    splitPatternString,
    TempoGroup,
    updateTempoGroup,
} from "@/components/music/TempoGroup/TempoGroup";
import { Input, Button } from "@openmarch/ui";
import { Form, FormField, Label } from "@radix-ui/react-form";
import clsx from "clsx";
import React, { useMemo, useState } from "react";
import { mixedMeterPermutations } from "./TempoUtils";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { toast } from "sonner";

interface EditableTempoGroupProps {
    tempoGroup: TempoGroup;
    setIsVisible: (isVisible: boolean) => void;
}

export default function EditableTempoGroup({
    tempoGroup,
    setIsVisible,
}: EditableTempoGroupProps) {
    const subTextClass = clsx("text-text-subtitle text-sub");
    const { fetchTimingObjects } = useTimingObjectsStore();
    const isMixedMeter = useMemo(
        () => isMixedMeterTempoGroup(tempoGroup),
        [tempoGroup],
    );
    const beatsPerMeasure = useMemo(
        () =>
            tempoGroup.strongBeatIndexes?.length
                ? tempoGroup.strongBeatIndexes.length +
                  tempoGroup.bigBeatsPerMeasure * 2
                : tempoGroup.bigBeatsPerMeasure,
        [tempoGroup.strongBeatIndexes, tempoGroup.bigBeatsPerMeasure],
    );
    const [selectedPattern, setSelectedPattern] = useState<string>(
        tempoGroup.strongBeatIndexes
            ? Array.from({ length: tempoGroup.bigBeatsPerMeasure })
                  .map((_, index) =>
                      tempoGroup.strongBeatIndexes?.includes(index) ? "3" : "2",
                  )
                  .join(",")
            : "",
    );
    const [tempo, setTempo] = useState(tempoGroup.tempo.toString());
    const [name, setName] = useState(tempoGroup.name);
    const saveDisabled = useMemo(() => {
        return (isMixedMeter && !selectedPattern) || !tempo;
    }, [isMixedMeter, selectedPattern, tempo]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        updateTempoGroup({
            tempoGroup,
            newTempo: Number(tempo),
            newName: name,
            newStrongBeatIndexes: isMixedMeter
                ? patternStringToLongBeatIndexes(selectedPattern)
                : undefined,
            refreshFunction: fetchTimingObjects,
        });
        toast.success("Tempo group updated");
        setIsVisible(false);
    };

    return (
        <div
            className={`bg-fg-2 border-accent rounded-tr-6 rounded-b-6 rounded-6 flex justify-between border p-16`}
        >
            <Form
                className="grid w-full grid-cols-6 gap-16"
                onSubmit={handleSubmit}
            >
                <FormField
                    name="name"
                    className={clsx(
                        "flex flex-col gap-2",
                        isMixedMeter ? "col-span-2" : "col-span-3",
                    )}
                >
                    <Label className="text-sm select-all">Name</Label>
                    <Input
                        id="name-input"
                        name="name"
                        placeholder="Optional"
                        type="text"
                        className="select-all"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <p className={subTextClass}>
                        Rehearsal letter or identifier
                    </p>
                </FormField>
                <FormField
                    name="tempo"
                    className={clsx(
                        "flex flex-col gap-2",
                        isMixedMeter ? "col-span-2" : "col-span-3",
                    )}
                >
                    <Label className="text-sm">Tempo *</Label>
                    <Input
                        id="start-tempo-input"
                        name="tempo"
                        type="number"
                        min={1}
                        value={tempo}
                        onChange={(e) => setTempo(e.target.value)}
                        required
                    />
                    <p className={subTextClass}>Beats per minute</p>
                </FormField>

                {isMixedMeter && (
                    <FormField
                        name="beatPattern"
                        className="col-span-2 flex flex-col gap-2"
                    >
                        <Label className="text-sm">Beat Pattern *</Label>
                        <select
                            className="bg-bg-1 border-stroke rounded-4 border px-8 py-4"
                            required
                            value={selectedPattern}
                            onChange={(e) => setSelectedPattern(e.target.value)}
                        >
                            <option value="">Select a pattern</option>
                            {mixedMeterPermutations(beatsPerMeasure)
                                .filter(
                                    (p) =>
                                        p.length ===
                                        splitPatternString(selectedPattern)
                                            .length,
                                )
                                .map((pattern: number[], index: number) => (
                                    <option
                                        key={index}
                                        value={pattern.join(",")}
                                    >
                                        {pattern.join("+")}
                                    </option>
                                ))}
                        </select>
                    </FormField>
                )}
                <FormField
                    name="beatsPerMeasure"
                    className={clsx("col-span-3 flex flex-col gap-2")}
                >
                    <Label className={clsx("text-sm")}>
                        Beats per measure *
                    </Label>
                    <Input
                        id="bpm-input"
                        name="beatsPerMeasure"
                        type="number"
                        disabled
                        value={beatsPerMeasure}
                        required
                    />

                    <p className={subTextClass}>
                        Time signature: {beatsPerMeasure}/
                        {isMixedMeter ? "8" : "4"}
                    </p>
                </FormField>
                <FormField
                    name="repeats"
                    className={clsx("col-span-3 flex flex-col gap-2")}
                >
                    <Label className="text-sm">Number of measures *</Label>
                    <Input
                        id="repeats-input"
                        name="repeats"
                        type="number"
                        value={tempoGroup.numOfRepeats}
                        disabled
                    />
                </FormField>
                <div className="col-span-6 flex gap-8">
                    <div className="flex-grow" />

                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setIsVisible(false)}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" disabled={saveDisabled}>
                        Save Changes
                    </Button>
                </div>
            </Form>
        </div>
    );
}

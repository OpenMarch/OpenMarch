import AudioSelector from "./AudioSelector";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { XIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { TempoGroup } from "@/global/classes/TempoGroup";
import { Button, Input } from "@openmarch/ui";
import { Form, FormField, Label } from "@radix-ui/react-form";
import clsx from "clsx";
import React, { useMemo } from "react";
import { mixedMeterPermutations } from "./tempo-utils";

export default function MusicModal() {
    return (
        <SidebarModalLauncher
            contents={<MusicModalContents />}
            buttonLabel="Music"
        />
    );
}
function MusicModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const [newGroupFormHidden, setNewGroupFormHidden] = React.useState(true);

    return (
        <div className="animate-scale-in text-text flex w-fit flex-col gap-16">
            <header className="flex justify-between gap-24">
                <h4 className="text-h4 leading-none">Music</h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>
            {/* <div id="measure editing container">
                <MeasureEditor />
                </div> */}
            <div className="flex flex-col gap-16">
                <AudioSelector />
            </div>
            <h4 className="text-h4 leading-none">Tempo Groups</h4>
            <div id="tempo-groups" className="mx-12 flex flex-col gap-8">
                {testTempoGroups.map((tempoGroup, i) => (
                    <TempoGroupCard key={i} tempoGroup={tempoGroup} />
                ))}
                <div className="flex min-h-[20rem] flex-col">
                    <div className="flex justify-end py-8">
                        <Button
                            variant="secondary"
                            onClick={() =>
                                setNewGroupFormHidden(!newGroupFormHidden)
                            }
                        >
                            {newGroupFormHidden ? "Add New Group" : "Cancel"}
                        </Button>
                    </div>
                    {!newGroupFormHidden && <NewTempoGroupForm />}
                </div>
            </div>
        </div>
    );
}

// Example tempo groups for testing
export const testTempoGroups: TempoGroup[] = [
    // Simple 4/4 tempo group
    {
        name: " ",
        startTempo: 120,
        bigBeatsPerMeasure: 4,
        numOfRepeats: 8,
    },

    // Mixed meter 7/8 with long beat at the end (2+2+3)
    {
        name: "-",
        startTempo: 144,
        bigBeatsPerMeasure: 3,
        longBeatIndexes: [2],
        numOfRepeats: 4,
        measureRangeString: "m 1-4",
    },

    // Mixed meter 7/8 with long beat at the beginning (3+2+2)
    {
        name: "A",
        startTempo: 132,
        bigBeatsPerMeasure: 3,
        longBeatIndexes: [0],
        numOfRepeats: 6,
        measureRangeString: "m 5-10",
    },

    // Group with manual tempos (accelerando)
    {
        name: "",
        startTempo: 100,
        manualTempos: [
            100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122,
        ],
        bigBeatsPerMeasure: 4,
        numOfRepeats: 3,
        measureRangeString: "m 11-13",
    },

    // Mixed meter 10/8 with alternating long beats (3+2+3+2)
    {
        name: "B",
        startTempo: 138,
        bigBeatsPerMeasure: 4,
        longBeatIndexes: [0, 2],
        numOfRepeats: 5,
    },

    // Group with very slow tempo
    {
        name: "",
        startTempo: 72,
        bigBeatsPerMeasure: 4,
        numOfRepeats: 8,
    },

    // Mixed meter 8/8 with two long beats (3+3+2)
    {
        name: "C",
        startTempo: 126,
        bigBeatsPerMeasure: 3,
        longBeatIndexes: [0, 1],
        numOfRepeats: 4,
    },

    // Group with very fast tempo
    {
        name: "",
        startTempo: 176,
        bigBeatsPerMeasure: 4,
        numOfRepeats: 12,
    },
    // Group with very fast tempo
    {
        name: "",
        startTempo: 200,
        bigBeatsPerMeasure: 4,
        numOfRepeats: 12,
    },
];

function TempoGroupCard({ tempoGroup }: { tempoGroup: TempoGroup }) {
    const trimmedName = tempoGroup.name.trim();
    return (
        <>
            {tempoGroup.name && trimmedName !== "" && trimmedName !== "-" && (
                <div className="bg-fg-2 rounded-6 border-text mt-12 flex w-fit min-w-32 border px-8 py-4">
                    <h3 className="text-text-secondary text-h3">
                        {trimmedName}
                    </h3>
                </div>
            )}
            <div
                className={`bg-fg-2 border-stroke rounded-tr-6 rounded-b-6 rounded-6 flex justify-between border p-12`}
            >
                <div className="flex flex-col gap-8">
                    <div>
                        <h3 className="text-h3">
                            {tempoGroup.startTempo}{" "}
                            <span className="text-text-subtitle text-sm">
                                bpm
                            </span>
                        </h3>
                    </div>
                    {tempoGroup.measureRangeString && (
                        <p className="text-text-subtitle text-sm">
                            {tempoGroup.measureRangeString}
                        </p>
                    )}
                </div>
                <div className="flex flex-col items-end justify-between">
                    <h4 className="text-h4">
                        {tempoGroup.bigBeatsPerMeasure}/4
                    </h4>
                    <p className="text-right">{tempoGroup.numOfRepeats}x</p>
                </div>
            </div>
        </>
    );
}

function NewTempoGroupForm() {
    const subTextClass = clsx("text-text-subtitle text-sub ");
    const [isMixedMeter, setIsMixedMeter] = React.useState(false);
    const [beatsPerMeasure, setBeatsPerMeasure] = React.useState(4);
    const [selectedPattern, setSelectedPattern] = React.useState<string>("");
    const maxMixedMeterBeats = 30;
    const tooManyMixedMeterBeats = useMemo(
        () => beatsPerMeasure > maxMixedMeterBeats && isMixedMeter,
        [beatsPerMeasure, isMixedMeter],
    );

    const handleBeatsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value) || 0;
        setBeatsPerMeasure(value);
        // If mixed meter is enabled and the beats change, we might need to update available patterns
        if (isMixedMeter) {
            // Reset selected pattern when beats change
            setSelectedPattern("");
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        const name = (formData.get("name") as string) || "";
        const startTempo =
            parseInt(formData.get("startTempo") as string) || 120;
        const endTempo = formData.get("endTempo")
            ? parseInt(formData.get("endTempo") as string)
            : undefined;
        const repeats = parseInt(formData.get("repeats") as string) || 4;

        const newTempoGroup: TempoGroup = {
            name,
            startTempo,
            ...(endTempo && { endTempo }),
            bigBeatsPerMeasure: beatsPerMeasure,
            numOfRepeats: repeats,
            ...(isMixedMeter &&
                selectedPattern && {
                    longBeatIndexes: selectedPattern
                        .split(",")
                        .map((val, index) => (val === "3" ? index : null))
                        .filter((index): index is number => index !== null),
                }),
        };

        console.log("Created new tempo group:", newTempoGroup);
        // TODO: Add the new tempo group to the list
    };

    return (
        <div
            className={`bg-fg-2 border-accent rounded-tr-6 rounded-b-6 rounded-6 flex justify-between border p-12`}
        >
            <Form className="grid grid-cols-6 gap-16" onSubmit={handleSubmit}>
                <FormField
                    name="name"
                    className="col-span-2 flex flex-col gap-2"
                >
                    <Label className="text-sm select-all">Name</Label>
                    <Input
                        id="name-input"
                        placeholder="Optional"
                        type="text"
                        className="select-all"
                    />
                    <p className={subTextClass}>
                        Rehearsal letter or identifier
                    </p>
                </FormField>
                <FormField
                    name="startTempo"
                    className="col-span-2 flex flex-col gap-2"
                >
                    <Label className="text-sm">Start Tempo *</Label>
                    <Input
                        id="start-tempo-input"
                        type="number"
                        min={1}
                        defaultValue={"120"}
                        required
                    />
                    <p className={subTextClass}>Beats per minute</p>
                </FormField>

                <FormField
                    name="endTempo"
                    className="col-span-2 flex flex-col gap-2"
                >
                    <Label className="text-sm">End Tempo</Label>
                    <Input
                        id="end-tempo-input"
                        type="number"
                        min={1}
                        placeholder="Optional"
                        defaultValue={""}
                    />
                </FormField>
                <FormField
                    name="beatsPerMeasure"
                    className={clsx(
                        "flex flex-col gap-2",
                        isMixedMeter ? "col-span-2" : "col-span-3",
                    )}
                >
                    <Label
                        className={clsx(
                            "text-sm",
                            tooManyMixedMeterBeats ? "text-red" : "",
                        )}
                    >
                        Beats per measure *
                    </Label>
                    <Input
                        id="bpm-input"
                        type="number"
                        min={1}
                        value={beatsPerMeasure === 0 ? "" : beatsPerMeasure}
                        onChange={handleBeatsChange}
                        required
                        className={tooManyMixedMeterBeats ? "border-red" : ""}
                    />
                    {tooManyMixedMeterBeats ? (
                        <p className={clsx("text-red text-sub")}>
                            Mixed-meter shouldn&apos;t have more than{" "}
                            {maxMixedMeterBeats} beats. It will make your
                            computer sad. If you really need this, please
                            contact us so we can hear your cool mixed-meter
                            music that has {beatsPerMeasure} beats per measure
                        </p>
                    ) : (
                        <p className={subTextClass}>
                            Time signature: {beatsPerMeasure}/
                            {isMixedMeter ? "8" : "4"}
                        </p>
                    )}
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
                            disabled={tooManyMixedMeterBeats}
                            value={selectedPattern}
                            onChange={(e) => setSelectedPattern(e.target.value)}
                        >
                            <option value="">Select a pattern</option>
                            {!tooManyMixedMeterBeats &&
                                mixedMeterPermutations(beatsPerMeasure).map(
                                    (pattern: number[], index: number) => (
                                        <option
                                            key={index}
                                            value={pattern.join(",")}
                                        >
                                            {pattern.join("+")}
                                        </option>
                                    ),
                                )}
                        </select>
                    </FormField>
                )}
                <FormField
                    name="repeats"
                    className={clsx(
                        "flex flex-col gap-2",
                        isMixedMeter ? "col-span-2" : "col-span-3",
                    )}
                >
                    <Label className="text-sm">Repeats *</Label>
                    <Input
                        id="repeats-input"
                        type="number"
                        min={1}
                        defaultValue={"4"}
                        required
                    />
                </FormField>
                <div className="col-span-6 flex gap-4">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setIsMixedMeter(!isMixedMeter)}
                        disabled={!isMixedMeter && beatsPerMeasure < 5}
                    >
                        {isMixedMeter
                            ? "Make regular meter"
                            : "Make mixed meter"}
                    </Button>
                    <div className="flex-grow" />
                    <Button
                        type="submit"
                        disabled={isMixedMeter && beatsPerMeasure < 5}
                    >
                        Create
                    </Button>
                </div>
            </Form>
        </div>
    );
}

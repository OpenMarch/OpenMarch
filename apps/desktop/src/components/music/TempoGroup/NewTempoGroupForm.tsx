import {
    TempoGroup,
    getStrongBeatIndexesFromPattern,
    splitPatternString,
    useCreateFromTempoGroup,
} from "@/components/music/TempoGroup/TempoGroup";
import { Input, Button, UnitInput, TooltipClassName } from "@openmarch/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { Form, FormField, Label } from "@radix-ui/react-form";
import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import React, { useMemo } from "react";
import { mixedMeterPermutations } from "./TempoUtils";
import { toast } from "sonner";
import { T, useTolgee } from "@tolgee/react";
export const maxMixedMeterBeats = 30;

interface NewTempoGroupFormProps {
    startingPosition?: number;
    setSelfHidden?: () => void;
    scrollFunc?: () => void;
}

const NewTempoGroupForm = React.forwardRef<
    HTMLDivElement,
    NewTempoGroupFormProps
>((props, ref) => {
    const createFromTempoGroup = useCreateFromTempoGroup().mutate;
    const subTextClass = clsx("text-text-subtitle text-sub ");
    const [isMixedMeter, setIsMixedMeter] = React.useState(false);
    const [beatsPerMeasure, setBeatsPerMeasure] = React.useState(4);
    const [selectedPattern, setSelectedPattern] = React.useState<string>("");
    const [name, setName] = React.useState("");
    const [tempo, setTempo] = React.useState("120");
    const [endTempo, setEndTempo] = React.useState("");
    const [repeats, setRepeats] = React.useState("4");
    const { t } = useTolgee();

    const isDisabled = useMemo(() => {
        return (
            !tempo ||
            !beatsPerMeasure ||
            !repeats.trim() ||
            (isMixedMeter && !selectedPattern) ||
            (isMixedMeter && beatsPerMeasure < 5)
        );
    }, [tempo, beatsPerMeasure, repeats, isMixedMeter, selectedPattern]);

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

        const nameToUse = name.trim();
        const tempoValue = parseInt(tempo) || 120;
        const endTempoValue =
            endTempo && !isMixedMeter ? parseInt(endTempo) : undefined;
        const repeatsValue = parseInt(repeats) || 4;

        let newTempoGroup: TempoGroup;
        if (isMixedMeter) {
            const strongBeatIndexes =
                getStrongBeatIndexesFromPattern(selectedPattern);
            newTempoGroup = {
                name: nameToUse,
                tempo: tempoValue,
                ...(endTempoValue && { endTempo: endTempoValue }),
                bigBeatsPerMeasure: splitPatternString(selectedPattern).length,
                numOfRepeats: repeatsValue,
                strongBeatIndexes,
            };
        } else {
            newTempoGroup = {
                name: nameToUse,
                tempo: tempoValue,
                ...(endTempoValue && { endTempo: endTempoValue }),
                bigBeatsPerMeasure: beatsPerMeasure,
                numOfRepeats: repeatsValue,
            };
        }

        createFromTempoGroup({
            tempoGroup: newTempoGroup,
            endTempo: endTempoValue,
            startingPosition: props.startingPosition,
        });
        setName("");
        toast.success(t("music.tempoGroupCreated"));
        if (props.scrollFunc) {
            props.scrollFunc();
        }
        if (props.setSelfHidden) {
            props.setSelfHidden();
        }
    };

    return (
        <div
            className={`bg-fg-2 border-accent rounded-tr-6 rounded-b-6 rounded-6 flex justify-between border p-16`}
        >
            <Form className="grid grid-cols-6 gap-16" onSubmit={handleSubmit}>
                <FormField
                    name="name"
                    className="col-span-2 flex flex-col gap-2"
                >
                    <Label className="text-sm select-all">
                        <T keyName="music.name" />
                    </Label>
                    <Input
                        id="name-input"
                        name="name"
                        placeholder={t("music.tempoGroupNamePlaceholder")}
                        type="text"
                        className="select-all"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={(e) => {
                            setName(e.target.value.trim());
                        }}
                    />
                    <p className={subTextClass}>
                        <T keyName="music.rehearsalLetterOrIdentifier" />
                    </p>
                </FormField>
                <FormField
                    name="tempo"
                    className="col-span-2 flex flex-col gap-2"
                >
                    <Label className="text-sm">
                        <T keyName="music.startTempo" />
                    </Label>
                    <UnitInput
                        id="start-tempo-input"
                        name="tempo"
                        type="number"
                        unit="bpm"
                        min={1}
                        value={tempo}
                        onChange={(e) => setTempo(e.target.value)}
                        required
                    />
                </FormField>

                {isMixedMeter ? (
                    <FormField
                        name="beatPattern"
                        className="col-span-2 flex flex-col gap-2"
                    >
                        <Label className="text-sm">
                            <T keyName="music.beatPattern" />
                        </Label>
                        <select
                            className="bg-bg-1 border-stroke rounded-4 border px-8 py-4"
                            required
                            disabled={tooManyMixedMeterBeats}
                            value={selectedPattern}
                            onChange={(e) => setSelectedPattern(e.target.value)}
                        >
                            <option value="">
                                <T keyName="music.selectPattern" />
                            </option>
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
                ) : (
                    <FormField
                        name="endTempo"
                        className="col-span-2 flex flex-col gap-2"
                        hidden={isMixedMeter}
                    >
                        <Label className="text-sm">
                            <T keyName="music.endTempo" />
                            <Tooltip.Root>
                                <Tooltip.Trigger type="button">
                                    <InfoIcon
                                        size={18}
                                        className="text-text/60"
                                    />
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                    <Tooltip.Content
                                        className={TooltipClassName}
                                        side="top"
                                    >
                                        <T keyName="music.endTempoTooltip" />
                                    </Tooltip.Content>
                                </Tooltip.Portal>
                            </Tooltip.Root>
                        </Label>
                        <UnitInput
                            id="end-tempo-input"
                            name="endTempo"
                            type="number"
                            min={1}
                            unit="bpm"
                            placeholder={t("music.endTempoPlaceholder")}
                            value={endTempo}
                            onChange={(e) => setEndTempo(e.target.value)}
                        />
                    </FormField>
                )}
                <FormField
                    name="beatsPerMeasure"
                    className={clsx("col-span-3 flex flex-col gap-2")}
                >
                    <Label
                        className={clsx(
                            "text-sm",
                            tooManyMixedMeterBeats ? "text-red" : "",
                        )}
                    >
                        <T keyName="music.beatsPerMeasure" />
                    </Label>
                    <Input
                        id="bpm-input"
                        name="beatsPerMeasure"
                        type="number"
                        min={isMixedMeter ? 5 : 1}
                        max={isMixedMeter ? 30 : undefined}
                        value={beatsPerMeasure === 0 ? "" : beatsPerMeasure}
                        onChange={handleBeatsChange}
                        required
                        className={tooManyMixedMeterBeats ? "border-red" : ""}
                    />
                    {tooManyMixedMeterBeats ? (
                        <p className={clsx("text-red text-sub")}>
                            {t("music.mixedMeterTooManyBeats", {
                                maxBeats: maxMixedMeterBeats,
                                beatsPerMeasure,
                            })}
                        </p>
                    ) : (
                        <p className={subTextClass}>
                            {t("music.timeSignature", {
                                timeSignature: `${beatsPerMeasure}/${
                                    isMixedMeter ? "8" : "4"
                                }`,
                            })}
                        </p>
                    )}
                </FormField>
                <FormField
                    name="repeats"
                    className={clsx("col-span-3 flex flex-col gap-2")}
                >
                    <Label className="text-sm">
                        <T keyName="music.numberOfMeasures" />
                    </Label>
                    <Input
                        id="repeats-input"
                        name="repeats"
                        type="number"
                        min={1}
                        value={repeats}
                        onChange={(e) => setRepeats(e.target.value)}
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
                        {isMixedMeter ? (
                            <T keyName="music.makeSimpleMeter" />
                        ) : (
                            <T keyName="music.makeMixedMeter" />
                        )}
                    </Button>
                    <div className="flex-grow" />
                    {props.setSelfHidden && (
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={props.setSelfHidden}
                        >
                            <T keyName="music.cancel" />
                        </Button>
                    )}
                    <Button type="submit" disabled={isDisabled}>
                        <T keyName="music.create" />
                    </Button>
                </div>
            </Form>
        </div>
    );
});

export default NewTempoGroupForm;

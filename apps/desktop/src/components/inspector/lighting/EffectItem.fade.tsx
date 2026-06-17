import {
    defaultFadeEffectArgs,
    MIN_FADE_CHANGE_DURATION_MS,
    MIN_FADE_CHANGE_DURATION_S,
    type FadeEffectArgs,
} from "@openmarch/core";
import { Button, UnitInput } from "@openmarch/ui";
import ColorPicker from "@/components/ui/ColorPicker";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useTolgee } from "@tolgee/react";
import { type ChangeEvent, useEffect, useId, useState } from "react";
import { hex6ToRgba, isRgbaColor, rgbaToHex6 } from "./EffectItem.colors";

export type FadeEffectArgsInputProps = {
    currentArgs: FadeEffectArgs;
    currentArgsJson: string;
    argsChangeFn: (argsJson: string) => void;
};

export const FadeEffectArgsInput = ({
    currentArgs,
    currentArgsJson,
    argsChangeFn,
}: FadeEffectArgsInputProps) => {
    const { t } = useTolgee();
    const durationInputId = useId();
    const [changeDurationMs, setChangeDurationMs] = useState(
        currentArgs.changeDurationMs,
    );
    const [durationInput, setDurationInput] = useState(() =>
        String(currentArgs.changeDurationMs / 1000),
    );
    const [colors, setColors] = useState<string[]>(currentArgs.colors);

    // Sync from server only when persisted args change — not when parseEffectArgs
    // returns a new array reference for the same JSON (that caused new→old→new flashes).
    // currentArgs is derived from currentArgsJson in the parent on each render.
    useEffect(() => {
        setChangeDurationMs(currentArgs.changeDurationMs);
        setDurationInput(String(currentArgs.changeDurationMs / 1000));
        setColors(currentArgs.colors);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid array ref churn
    }, [currentArgsJson]);

    const commitArgs = (draft: FadeEffectArgs) => {
        const nextArgsJson = JSON.stringify(draft);
        if (nextArgsJson !== currentArgsJson) argsChangeFn(nextArgsJson);
    };

    const handleDurationChange = (e: ChangeEvent<HTMLInputElement>) => {
        setDurationInput(e.currentTarget.value);
    };

    const handleDurationBlur = () => {
        if (durationInput.trim() === "") {
            setDurationInput(String(changeDurationMs / 1000));
            return;
        }

        const parsed = Number.parseFloat(durationInput);
        const nextDurationMs = Number.isFinite(parsed)
            ? Math.max(MIN_FADE_CHANGE_DURATION_MS, Math.round(parsed * 1000))
            : changeDurationMs;
        setChangeDurationMs(nextDurationMs);
        setDurationInput(String(nextDurationMs / 1000));
        commitArgs({ changeDurationMs: nextDurationMs, colors });
    };

    const applyColorAtIndex = (index: number, color: unknown) => {
        if (!isRgbaColor(color)) return;
        const nextHex = rgbaToHex6(color);
        const nextColors = colors.map((hex, i) =>
            i === index ? nextHex : hex,
        );
        setColors(nextColors);
        commitArgs({ changeDurationMs, colors: nextColors });
    };

    const handleAddColor = () => {
        const nextColor =
            colors.at(-1) ?? defaultFadeEffectArgs.colors[0] ?? "#000000";
        const nextColors = [...colors, nextColor];
        setColors(nextColors);
        commitArgs({ changeDurationMs, colors: nextColors });
    };

    const handleRemoveColor = (index: number) => {
        if (index < 2 || colors.length <= 2) return;
        const nextColors = colors.filter((_, i) => i !== index);
        setColors(nextColors);
        commitArgs({ changeDurationMs, colors: nextColors });
    };

    return (
        <div className="flex flex-col gap-12">
            <div className="flex items-center justify-between gap-6">
                <label
                    htmlFor={durationInputId}
                    className="text-body text-text/80"
                >
                    {t(
                        "workspace.lightDesigner.effects.effectItem.changeDuration",
                    ) || "Change duration"}
                </label>
                <UnitInput
                    id={durationInputId}
                    unit="seconds"
                    compact
                    type="number"
                    min={MIN_FADE_CHANGE_DURATION_S}
                    step={MIN_FADE_CHANGE_DURATION_S}
                    className="w-[8rem]"
                    value={durationInput}
                    onChange={handleDurationChange}
                    onBlur={handleDurationBlur}
                />
            </div>

            <div className="flex flex-col gap-8">
                {colors.map((colorHex, index) => (
                    <div
                        key={`${index}-${colorHex}`}
                        className="flex items-end gap-6"
                    >
                        <div className="min-w-0 flex-1">
                            <ColorPicker
                                doNotUseForm
                                disableAlpha
                                className="px-0"
                                label={
                                    t(
                                        "workspace.lightDesigner.effects.effectItem.colorNumber",
                                        { number: index + 1 },
                                    ) || `Color ${index + 1}`
                                }
                                initialColor={hex6ToRgba(colorHex)}
                                onBlur={(color) =>
                                    applyColorAtIndex(index, color)
                                }
                            />
                        </div>
                        {index >= 2 ? (
                            <Button
                                type="button"
                                variant="secondary"
                                size="compact"
                                content="icon"
                                className="shrink-0"
                                aria-label={
                                    t(
                                        "workspace.lightDesigner.effects.effectItem.removeColorAria",
                                    ) || "Remove color"
                                }
                                onClick={() => handleRemoveColor(index)}
                            >
                                <TrashIcon size={18} aria-hidden />
                            </Button>
                        ) : null}
                    </div>
                ))}
                <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    className="gap-6 self-start"
                    onClick={handleAddColor}
                >
                    <PlusIcon size={18} aria-hidden />
                    {t("workspace.lightDesigner.effects.effectItem.addColor") ||
                        "Add color"}
                </Button>
            </div>
        </div>
    );
};

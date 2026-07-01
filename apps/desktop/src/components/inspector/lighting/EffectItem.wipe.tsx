import {
    defaultWipeEffectArgs,
    MIN_WIPE_CYCLE_DURATION_MS,
    MIN_WIPE_CYCLE_DURATION_S,
    MIN_WIPE_CYCLE_FREQUENCY_MS,
    MIN_WIPE_CYCLE_FREQUENCY_S,
    type WipeEffectArgs,
} from "@openmarch/core";
import { UnitInput } from "@openmarch/ui";
import ColorPicker from "@/components/ui/ColorPicker";
import { useTolgee } from "@tolgee/react";
import { type ChangeEvent, useEffect, useId, useState } from "react";
import { hex6ToRgba, isRgbaColor, rgbaToHex6 } from "./EffectItem.colors";

export type WipeEffectArgsInputProps = {
    currentArgs: WipeEffectArgs;
    currentArgsJson: string;
    argsChangeFn: (argsJson: string) => void;
};

export const WipeEffectArgsInput = ({
    currentArgs,
    currentArgsJson,
    argsChangeFn,
}: WipeEffectArgsInputProps) => {
    const { t } = useTolgee();
    const cycleDurationInputId = useId();
    const cycleFrequencyInputId = useId();
    const [colorHex, setColorHex] = useState(currentArgs.color);
    const [cycleDurationMs, setCycleDurationMs] = useState(
        currentArgs.cycleDurationMs,
    );
    const [cycleDurationInput, setCycleDurationInput] = useState(() =>
        String(currentArgs.cycleDurationMs / 1000),
    );
    const [cycleFrequencyMs, setCycleFrequencyMs] = useState(
        currentArgs.cycleFrequencyMs,
    );
    const [cycleFrequencyInput, setCycleFrequencyInput] = useState(() =>
        String(currentArgs.cycleFrequencyMs / 1000),
    );
    const [directionDegrees, setDirectionDegrees] = useState(
        currentArgs.directionDegrees,
    );

    useEffect(() => {
        setColorHex(currentArgs.color);
        setCycleDurationMs(currentArgs.cycleDurationMs);
        setCycleDurationInput(String(currentArgs.cycleDurationMs / 1000));
        setCycleFrequencyMs(currentArgs.cycleFrequencyMs);
        setCycleFrequencyInput(String(currentArgs.cycleFrequencyMs / 1000));
        setDirectionDegrees(currentArgs.directionDegrees);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid array ref churn
    }, [currentArgsJson]);

    const commitArgs = (draft: WipeEffectArgs) => {
        const nextArgsJson = JSON.stringify(draft);
        if (nextArgsJson !== currentArgsJson) argsChangeFn(nextArgsJson);
    };

    const handleCycleDurationChange = (e: ChangeEvent<HTMLInputElement>) => {
        setCycleDurationInput(e.currentTarget.value);
    };

    const handleCycleDurationBlur = () => {
        if (cycleDurationInput.trim() === "") {
            setCycleDurationInput(String(cycleDurationMs / 1000));
            return;
        }

        const parsed = Number.parseFloat(cycleDurationInput);
        const nextDurationMs = Number.isFinite(parsed)
            ? Math.max(MIN_WIPE_CYCLE_DURATION_MS, Math.round(parsed * 1000))
            : cycleDurationMs;
        setCycleDurationMs(nextDurationMs);
        setCycleDurationInput(String(nextDurationMs / 1000));
        commitArgs({
            color: colorHex,
            cycleDurationMs: nextDurationMs,
            cycleFrequencyMs,
            directionDegrees,
        });
    };

    const handleCycleFrequencyChange = (e: ChangeEvent<HTMLInputElement>) => {
        setCycleFrequencyInput(e.currentTarget.value);
    };

    const handleCycleFrequencyBlur = () => {
        if (cycleFrequencyInput.trim() === "") {
            setCycleFrequencyInput(String(cycleFrequencyMs / 1000));
            return;
        }

        const parsed = Number.parseFloat(cycleFrequencyInput);
        const nextFrequencyMs = Number.isFinite(parsed)
            ? Math.max(MIN_WIPE_CYCLE_FREQUENCY_MS, Math.round(parsed * 1000))
            : cycleFrequencyMs;
        setCycleFrequencyMs(nextFrequencyMs);
        setCycleFrequencyInput(String(nextFrequencyMs / 1000));
        commitArgs({
            color: colorHex,
            cycleDurationMs,
            cycleFrequencyMs: nextFrequencyMs,
            directionDegrees,
        });
    };

    const applyColor = (color: unknown) => {
        if (!isRgbaColor(color)) return;
        const nextHex = rgbaToHex6(color);
        setColorHex(nextHex);
        commitArgs({
            color: nextHex,
            cycleDurationMs,
            cycleFrequencyMs,
            directionDegrees,
        });
    };

    return (
        <div className="flex flex-col gap-12">
            <ColorPicker
                doNotUseForm
                disableAlpha
                className="px-0"
                label={
                    t("workspace.lightDesigner.effects.effectItem.color") ||
                    "Color"
                }
                initialColor={hex6ToRgba(colorHex)}
                defaultColor={hex6ToRgba(defaultWipeEffectArgs.color)}
                onBlur={applyColor}
            />

            <div className="flex items-center justify-between gap-6">
                <label
                    htmlFor={cycleDurationInputId}
                    className="text-body text-text/80"
                >
                    {t(
                        "workspace.lightDesigner.effects.effectItem.cycleDuration",
                    ) || "Cycle duration"}
                </label>
                <UnitInput
                    id={cycleDurationInputId}
                    unit="seconds"
                    compact
                    type="number"
                    min={MIN_WIPE_CYCLE_DURATION_S}
                    step={MIN_WIPE_CYCLE_DURATION_S}
                    className="w-[8rem]"
                    value={cycleDurationInput}
                    onChange={handleCycleDurationChange}
                    onBlur={handleCycleDurationBlur}
                />
            </div>

            <div className="flex items-center justify-between gap-6">
                <label
                    htmlFor={cycleFrequencyInputId}
                    className="text-body text-text/80"
                >
                    {t(
                        "workspace.lightDesigner.effects.effectItem.cycleFrequency",
                    ) || "Cycle frequency"}
                </label>
                <UnitInput
                    id={cycleFrequencyInputId}
                    unit="seconds"
                    compact
                    type="number"
                    min={MIN_WIPE_CYCLE_FREQUENCY_S}
                    step={MIN_WIPE_CYCLE_FREQUENCY_S}
                    className="w-[8rem]"
                    value={cycleFrequencyInput}
                    onChange={handleCycleFrequencyChange}
                    onBlur={handleCycleFrequencyBlur}
                />
            </div>
        </div>
    );
};

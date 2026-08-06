import {
    defaultFlickerEffectArgs,
    MIN_FLICKER_INTERVAL_MS,
    type FlickerEffectArgs,
} from "@openmarch/core";
import { UnitInput } from "@openmarch/ui";
import ColorPicker from "@/components/ui/ColorPicker";
import { useTolgee } from "@tolgee/react";
import { type ChangeEvent, useEffect, useId, useState } from "react";
import { hex6ToRgba, isRgbaColor, rgbaToHex6 } from "./EffectItem.colors";

export type FlickerEffectArgsInputProps = {
    currentArgs: FlickerEffectArgs;
    currentArgsJson: string;
    argsChangeFn: (argsJson: string) => void;
};

export const FlickerEffectArgsInput = ({
    currentArgs,
    currentArgsJson,
    argsChangeFn,
}: FlickerEffectArgsInputProps) => {
    const { t } = useTolgee();
    const intervalInputId = useId();
    const probabilityInputId = useId();

    const [colorHex, setColorHex] = useState(currentArgs.color);
    const [intervalMs, setIntervalMs] = useState(currentArgs.intervalMs);
    const [intervalInput, setIntervalInput] = useState(() =>
        String(currentArgs.intervalMs / 1000),
    );
    const [onProbability, setOnProbability] = useState(
        currentArgs.onProbability,
    );
    const [probabilityInput, setProbabilityInput] = useState(() =>
        String(Math.round(currentArgs.onProbability * 100)),
    );

    useEffect(() => {
        setColorHex(currentArgs.color);
        setIntervalMs(currentArgs.intervalMs);
        setIntervalInput(String(currentArgs.intervalMs / 1000));
        setOnProbability(currentArgs.onProbability);
        setProbabilityInput(
            String(Math.round(currentArgs.onProbability * 100)),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid array ref churn
    }, [currentArgsJson]);

    const commitArgs = (draft: FlickerEffectArgs) => {
        const nextArgsJson = JSON.stringify(draft);
        if (nextArgsJson !== currentArgsJson) argsChangeFn(nextArgsJson);
    };

    const applyColor = (color: unknown) => {
        if (!isRgbaColor(color)) return;
        const nextHex = rgbaToHex6(color);
        setColorHex(nextHex);
        commitArgs({ color: nextHex, intervalMs, onProbability });
    };

    const handleIntervalChange = (e: ChangeEvent<HTMLInputElement>) => {
        setIntervalInput(e.currentTarget.value);
    };

    const handleIntervalBlur = () => {
        if (intervalInput.trim() === "") {
            setIntervalInput(String(intervalMs / 1000));
            return;
        }

        const parsed = Number.parseFloat(intervalInput);
        const nextIntervalMs = Number.isFinite(parsed)
            ? Math.max(MIN_FLICKER_INTERVAL_MS, Math.round(parsed * 1000))
            : intervalMs;
        setIntervalMs(nextIntervalMs);
        setIntervalInput(String(nextIntervalMs / 1000));
        commitArgs({
            color: colorHex,
            intervalMs: nextIntervalMs,
            onProbability,
        });
    };

    const handleProbabilityChange = (e: ChangeEvent<HTMLInputElement>) => {
        setProbabilityInput(e.currentTarget.value);
    };

    const handleProbabilityBlur = () => {
        if (probabilityInput.trim() === "") {
            setProbabilityInput(String(Math.round(onProbability * 100)));
            return;
        }

        const parsed = Number.parseFloat(probabilityInput);
        const nextOnProbability = Number.isFinite(parsed)
            ? Math.min(1, Math.max(0, parsed / 100))
            : onProbability;
        setOnProbability(nextOnProbability);
        setProbabilityInput(String(Math.round(nextOnProbability * 100)));
        commitArgs({
            color: colorHex,
            intervalMs,
            onProbability: nextOnProbability,
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
                defaultColor={hex6ToRgba(defaultFlickerEffectArgs.color)}
                onBlur={applyColor}
            />
            <div className="flex items-center justify-between gap-6">
                <label
                    htmlFor={intervalInputId}
                    className="text-body text-text/80"
                >
                    {t(
                        "workspace.lightDesigner.effects.effectItem.flickerInterval",
                    ) || "Flicker interval"}
                </label>
                <UnitInput
                    id={intervalInputId}
                    unit="seconds"
                    compact
                    type="number"
                    min={MIN_FLICKER_INTERVAL_MS / 1000}
                    step={MIN_FLICKER_INTERVAL_MS / 1000}
                    className="w-[8rem]"
                    value={intervalInput}
                    onChange={handleIntervalChange}
                    onBlur={handleIntervalBlur}
                />
            </div>
            <div className="flex items-center justify-between gap-6">
                <label
                    htmlFor={probabilityInputId}
                    className="text-body text-text/80"
                >
                    {t(
                        "workspace.lightDesigner.effects.effectItem.flickerProbability",
                    ) || "On probability"}
                </label>
                <UnitInput
                    id={probabilityInputId}
                    unit="%"
                    compact
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    className="w-[8rem]"
                    value={probabilityInput}
                    onChange={handleProbabilityChange}
                    onBlur={handleProbabilityBlur}
                />
            </div>
        </div>
    );
};

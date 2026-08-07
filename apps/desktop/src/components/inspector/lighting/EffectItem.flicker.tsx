import {
    defaultFlickerEffectArgs,
    MIN_FLICKER_ON_OFF_MS,
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

const MIN_S = MIN_FLICKER_ON_OFF_MS / 1000;

type DwellField = "onMinMs" | "onMaxMs" | "offMinMs" | "offMaxMs";

export const FlickerEffectArgsInput = ({
    currentArgs,
    currentArgsJson,
    argsChangeFn,
}: FlickerEffectArgsInputProps) => {
    const { t } = useTolgee();
    const onMinInputId = useId();
    const onMaxInputId = useId();
    const offMinInputId = useId();
    const offMaxInputId = useId();

    const [colorHex, setColorHex] = useState(currentArgs.color);
    const [dwellMs, setDwellMs] = useState<Record<DwellField, number>>({
        onMinMs: currentArgs.onMinMs,
        onMaxMs: currentArgs.onMaxMs,
        offMinMs: currentArgs.offMinMs,
        offMaxMs: currentArgs.offMaxMs,
    });
    const [dwellInput, setDwellInput] = useState<Record<DwellField, string>>({
        onMinMs: String(currentArgs.onMinMs / 1000),
        onMaxMs: String(currentArgs.onMaxMs / 1000),
        offMinMs: String(currentArgs.offMinMs / 1000),
        offMaxMs: String(currentArgs.offMaxMs / 1000),
    });

    useEffect(() => {
        setColorHex(currentArgs.color);
        setDwellMs({
            onMinMs: currentArgs.onMinMs,
            onMaxMs: currentArgs.onMaxMs,
            offMinMs: currentArgs.offMinMs,
            offMaxMs: currentArgs.offMaxMs,
        });
        setDwellInput({
            onMinMs: String(currentArgs.onMinMs / 1000),
            onMaxMs: String(currentArgs.onMaxMs / 1000),
            offMinMs: String(currentArgs.offMinMs / 1000),
            offMaxMs: String(currentArgs.offMaxMs / 1000),
        });
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
        commitArgs({ color: nextHex, ...dwellMs });
    };

    const handleDwellChange =
        (field: DwellField) => (e: ChangeEvent<HTMLInputElement>) => {
            // Read the value synchronously — React nulls out e.currentTarget once the
            // event handler returns, and the setState updater below can run after that.
            const value = e.currentTarget.value;
            setDwellInput((prev) => ({ ...prev, [field]: value }));
        };

    const handleDwellBlur = (field: DwellField) => () => {
        const input = dwellInput[field];
        if (input.trim() === "") {
            setDwellInput((prev) => ({
                ...prev,
                [field]: String(dwellMs[field] / 1000),
            }));
            return;
        }

        const parsed = Number.parseFloat(input);
        const nextMs = Number.isFinite(parsed)
            ? Math.max(MIN_FLICKER_ON_OFF_MS, Math.round(parsed * 1000))
            : dwellMs[field];
        const nextDwellMs = { ...dwellMs, [field]: nextMs };
        setDwellMs(nextDwellMs);
        setDwellInput((prev) => ({ ...prev, [field]: String(nextMs / 1000) }));
        commitArgs({ color: colorHex, ...nextDwellMs });
    };

    const dwellField = (
        field: DwellField,
        inputId: string,
        labelKey: string,
        fallbackLabel: string,
    ) => (
        <div className="flex items-center justify-between gap-6">
            <label htmlFor={inputId} className="text-body text-text/80">
                {t(labelKey) || fallbackLabel}
            </label>
            <UnitInput
                id={inputId}
                unit="seconds"
                compact
                type="number"
                min={MIN_S}
                step={MIN_S}
                className="w-[8rem]"
                value={dwellInput[field]}
                onChange={handleDwellChange(field)}
                onBlur={handleDwellBlur(field)}
            />
        </div>
    );

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
            {dwellField(
                "onMinMs",
                onMinInputId,
                "workspace.lightDesigner.effects.effectItem.flickerOnMin",
                "Min on time (s)",
            )}
            {dwellField(
                "onMaxMs",
                onMaxInputId,
                "workspace.lightDesigner.effects.effectItem.flickerOnMax",
                "Max on time (s)",
            )}
            {dwellField(
                "offMinMs",
                offMinInputId,
                "workspace.lightDesigner.effects.effectItem.flickerOffMin",
                "Min off time (s)",
            )}
            {dwellField(
                "offMaxMs",
                offMaxInputId,
                "workspace.lightDesigner.effects.effectItem.flickerOffMax",
                "Max off time (s)",
            )}
        </div>
    );
};

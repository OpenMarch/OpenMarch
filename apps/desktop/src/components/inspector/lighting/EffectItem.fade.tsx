import { defaultFadeEffectArgs, type FadeEffectArgs } from "@openmarch/core";
import ColorPicker from "@/components/ui/ColorPicker";
import { useTolgee } from "@tolgee/react";
import { useEffect, useState } from "react";
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
    const [startColorHex, setStartColorHex] = useState(currentArgs.startColor);
    const [endColorHex, setEndColorHex] = useState(currentArgs.endColor);

    useEffect(() => {
        setStartColorHex(currentArgs.startColor);
        setEndColorHex(currentArgs.endColor);
    }, [currentArgs.startColor, currentArgs.endColor]);

    const commitArgs = (nextArgs: FadeEffectArgs) => {
        const nextArgsJson = JSON.stringify(nextArgs);
        if (nextArgsJson !== currentArgsJson) argsChangeFn(nextArgsJson);
    };

    const applyStartColor = (color: unknown) => {
        if (!isRgbaColor(color)) return;
        const nextHex = rgbaToHex6(color);
        setStartColorHex(nextHex);
        commitArgs({ startColor: nextHex, endColor: endColorHex });
    };

    const applyEndColor = (color: unknown) => {
        if (!isRgbaColor(color)) return;
        const nextHex = rgbaToHex6(color);
        setEndColorHex(nextHex);
        commitArgs({ startColor: startColorHex, endColor: nextHex });
    };

    return (
        <div className="flex flex-col gap-12">
            <ColorPicker
                doNotUseForm
                disableAlpha
                className="px-0"
                label={
                    t(
                        "workspace.lightDesigner.effects.effectItem.fadeStartColor",
                    ) || "Start color"
                }
                initialColor={hex6ToRgba(startColorHex)}
                defaultColor={hex6ToRgba(defaultFadeEffectArgs.startColor)}
                onBlur={applyStartColor}
            />
            <ColorPicker
                doNotUseForm
                disableAlpha
                className="px-0"
                label={
                    t(
                        "workspace.lightDesigner.effects.effectItem.fadeEndColor",
                    ) || "End color"
                }
                initialColor={hex6ToRgba(endColorHex)}
                defaultColor={hex6ToRgba(defaultFadeEffectArgs.endColor)}
                onBlur={applyEndColor}
            />
        </div>
    );
};

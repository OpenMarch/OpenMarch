import { defaultSolidEffectArgs, type SolidEffectArgs } from "@openmarch/core";
import ColorPicker from "@/components/ui/ColorPicker";
import { useTolgee } from "@tolgee/react";
import { useEffect, useState } from "react";
import { hex6ToRgba, isRgbaColor, rgbaToHex6 } from "./EffectItem.colors";

export type SolidEffectArgsInputProps = {
    currentArgs: SolidEffectArgs;
    currentArgsJson: string;
    argsChangeFn: (argsJson: string) => void;
};

export const SolidEffectArgsInput = ({
    currentArgs,
    currentArgsJson,
    argsChangeFn,
}: SolidEffectArgsInputProps) => {
    const { t } = useTolgee();
    const [colorHex, setColorHex] = useState(currentArgs.color);

    useEffect(() => {
        setColorHex(currentArgs.color);
    }, [currentArgs.color]);

    const commitArgs = (draftColor: string) => {
        const nextArgs: SolidEffectArgs = { color: draftColor };
        const nextArgsJson = JSON.stringify(nextArgs);
        if (nextArgsJson !== currentArgsJson) argsChangeFn(nextArgsJson);
    };

    const applyColor = (color: unknown) => {
        if (!isRgbaColor(color)) return;
        const nextHex = rgbaToHex6(color);
        setColorHex(nextHex);
        commitArgs(nextHex);
    };

    return (
        <ColorPicker
            doNotUseForm
            disableAlpha
            className="px-0"
            label={
                t("workspace.lightDesigner.effects.effectItem.color") || "Color"
            }
            initialColor={hex6ToRgba(colorHex)}
            defaultColor={hex6ToRgba(defaultSolidEffectArgs.color)}
            onBlur={applyColor}
        />
    );
};

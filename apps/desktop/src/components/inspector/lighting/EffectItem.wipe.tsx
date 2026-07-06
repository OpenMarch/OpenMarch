import { defaultWipeEffectArgs, type WipeEffectArgs } from "@openmarch/core";
import ColorPicker from "@/components/ui/ColorPicker";
import { useTolgee } from "@tolgee/react";
import { useEffect, useState } from "react";
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
    const [colorHex, setColorHex] = useState(currentArgs.color);
    const [directionDegrees, setDirectionDegrees] = useState(
        currentArgs.directionDegrees,
    );

    useEffect(() => {
        setColorHex(currentArgs.color);
        setDirectionDegrees(currentArgs.directionDegrees);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid array ref churn
    }, [currentArgsJson]);

    const commitArgs = (draft: WipeEffectArgs) => {
        const nextArgsJson = JSON.stringify(draft);
        if (nextArgsJson !== currentArgsJson) argsChangeFn(nextArgsJson);
    };

    const applyColor = (color: unknown) => {
        if (!isRgbaColor(color)) return;
        const nextHex = rgbaToHex6(color);
        setColorHex(nextHex);
        commitArgs({
            color: nextHex,
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
        </div>
    );
};

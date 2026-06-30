import type { LightingEffectWithMarchers } from "@/db-functions";
import { replaceLightingEffectLayersMutationOptions } from "@/hooks/queries";
import { useLightDesignerEffectLayerDrawStore } from "@/stores/LightDesignerEffectLayerDrawStore";
import { canLightingEffectTypeHaveLayers } from "@openmarch/core";
import { Button } from "@openmarch/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { T, useTolgee } from "@tolgee/react";
import { useEffect } from "react";

type EffectLayersSectionProps = {
    effect: LightingEffectWithMarchers;
    disabled?: boolean;
};

export default function EffectLayersSection({
    effect,
    disabled = false,
}: EffectLayersSectionProps) {
    const { t } = useTolgee();
    const drawState = useLightDesignerEffectLayerDrawStore.use.drawState();
    const startDrawMode =
        useLightDesignerEffectLayerDrawStore.use.startDrawMode();
    const cancelDrawMode =
        useLightDesignerEffectLayerDrawStore.use.cancelDrawMode();
    const { mutate: replaceLayers } = useMutation(
        replaceLightingEffectLayersMutationOptions(),
    );

    const isDrawingThisEffect =
        drawState.status === "drawing" && drawState.effectId === effect.id;

    useEffect(() => {
        if (
            drawState.status !== "completed" ||
            drawState.effectId !== effect.id
        ) {
            return;
        }

        replaceLayers(
            {
                lightingEffectId: effect.id,
                layers: [
                    ...effect.effect_layers.map(
                        ({ top, left, height, width }) => ({
                            top,
                            left,
                            height,
                            width,
                        }),
                    ),
                    drawState.rect,
                ],
            },
            {
                onSuccess: () => {
                    cancelDrawMode();
                },
            },
        );
    }, [cancelDrawMode, drawState, effect, replaceLayers]);

    if (!canLightingEffectTypeHaveLayers(effect.type)) {
        return null;
    }

    const handleCreateLayerClick = () => {
        if (disabled) return;
        if (isDrawingThisEffect) {
            cancelDrawMode();
            return;
        }
        startDrawMode(effect.id);
    };

    return (
        <div className="flex flex-col gap-6">
            <Button
                variant={isDrawingThisEffect ? "primary" : "secondary"}
                size="compact"
                className="w-fit"
                disabled={disabled}
                onClick={handleCreateLayerClick}
            >
                <PlusIcon size={16} aria-hidden />
                {isDrawingThisEffect ? (
                    <T
                        keyName="workspace.lightDesigner.effects.layers.drawing"
                        defaultValue="Drawing…"
                    />
                ) : (
                    <T
                        keyName="workspace.lightDesigner.effects.layers.create"
                        defaultValue="Create Layer"
                    />
                )}
            </Button>

            {effect.effect_layers.length > 0 && (
                <p className="text-sub text-text/60">
                    {t(
                        "workspace.lightDesigner.effects.layers.count",
                        "{count, plural, one {# layer} other {# layers}}",
                        { count: effect.effect_layers.length },
                    ) ||
                        `${effect.effect_layers.length} layer${effect.effect_layers.length === 1 ? "" : "s"}`}
                </p>
            )}
        </div>
    );
}

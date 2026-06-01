import { useIsPlaying } from "@/context/IsPlayingContext";
import { lightingSceneDataByIdQueryOptions } from "@/hooks/queries/lighting/queries";
import { createLightingEffectsMutationOptions } from "@/hooks/queries/lighting/mutations";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createNewLightingEffect } from "@openmarch/core";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslate } from "@tolgee/react";
import {
    barPxFromBoundary,
    computeBeatBoundaryPx,
    findClosestBoundaryIndex,
    getSceneStartBeatPosition,
    getSceneTotalBeats,
    type OrderedSceneStart,
} from "./SceneTimeline.utils";
import type Beat from "@/global/classes/Beat";
import type Page from "@/global/classes/Page";

const MIN_DRAFT_BAR_PX = 8;

type CreateDragState = {
    pointerDownBeatIdx: number;
    sceneTotalBeats: number;
    beatBoundaryPx: number[];
};

type LightingEffectCreateStripProps = {
    sceneId: number;
    widthPx: number;
    pixelsPerSecond: number;
    pages: readonly Page[];
    beats: readonly Beat[];
    orderedStarts: readonly OrderedSceneStart[];
    labelHeightPx: number;
};

/**
 * Bottom timeline strip (aligned with the scene number): drag to create a new
 * effect over a beat range. Uses the same width as {@link LightingEffectBars}
 * so x maps to the same beat boundaries.
 */
export default function LightingEffectCreateStrip({
    sceneId,
    widthPx,
    pixelsPerSecond,
    pages,
    beats,
    orderedStarts,
    labelHeightPx,
}: LightingEffectCreateStripProps) {
    const { isPlaying } = useIsPlaying()!;
    const { t } = useTranslate();
    const { data: sceneData } = useQuery(
        lightingSceneDataByIdQueryOptions(sceneId),
    );
    const effectCount = sceneData?.lightingEffectIds?.length ?? 0;

    const selectEffect = useLightDesignerSelectedEffectStore.use.selectEffect();
    const { mutate: createEffect } = useMutation(
        createLightingEffectsMutationOptions(),
    );

    const sceneStartBeatPos = useMemo(() => {
        if (!sceneData) return null;
        return getSceneStartBeatPosition(sceneData, pages);
    }, [sceneData, pages]);

    const sceneTotalBeats = useMemo(() => {
        if (!sceneData) return 0;
        return getSceneTotalBeats(sceneData, orderedStarts, pages);
    }, [sceneData, orderedStarts, pages]);

    const beatBoundaryPx = useMemo(() => {
        if (sceneStartBeatPos == null || sceneTotalBeats === 0) return [0];
        return computeBeatBoundaryPx(
            beats,
            sceneStartBeatPos,
            sceneTotalBeats,
            pixelsPerSecond,
        );
    }, [beats, sceneStartBeatPos, sceneTotalBeats, pixelsPerSecond]);

    const stripRef = useRef<HTMLDivElement>(null);
    const createDragState = useRef<CreateDragState | null>(null);
    /** Mirrors draft range for document listeners (avoid stale closure on pointerup). */
    const createDraftRangeRef = useRef<{
        startBeats: number;
        durationBeats: number;
    } | null>(null);
    const [createDraftRange, setCreateDraftRange] = useState<{
        startBeats: number;
        durationBeats: number;
    } | null>(null);

    const onPointerMove = useCallback((ev: PointerEvent) => {
        const strip = stripRef.current;
        if (!strip) return;
        const createDrag = createDragState.current;
        if (!createDrag) return;
        const rect = strip.getBoundingClientRect();
        const mouseRelX = ev.clientX - rect.left;
        const closestIdx = findClosestBoundaryIndex(
            createDrag.beatBoundaryPx,
            mouseRelX,
        );
        const totalBeats = createDrag.sceneTotalBeats;
        const anchor = Math.max(
            0,
            Math.min(totalBeats - 1, createDrag.pointerDownBeatIdx),
        );
        const clampedClosest = Math.max(0, Math.min(totalBeats, closestIdx));
        const startBeats = Math.min(anchor, clampedClosest);
        const endBoundary = Math.max(anchor + 1, clampedClosest);
        const durationBeats = Math.max(
            1,
            Math.min(totalBeats - startBeats, endBoundary - startBeats),
        );
        const next = { startBeats, durationBeats };
        createDraftRangeRef.current = next;
        setCreateDraftRange(next);
    }, []);

    const onPointerUp = useCallback(() => {
        const createDrag = createDragState.current;
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        if (createDrag && sceneData) {
            const draft = createDraftRangeRef.current;
            if (draft && draft.durationBeats > 0) {
                createNewLightingEffect((name, type, argsJson) => {
                    createEffect(
                        [
                            {
                                scene_id: sceneData.id,
                                name,
                                type,
                                args: argsJson,
                                start_offset_beats: draft.startBeats,
                                duration_beats: draft.durationBeats,
                            },
                        ],
                        {
                            onSuccess: (created) => {
                                const row = created[0];
                                if (row) {
                                    selectEffect({
                                        effectId: row.id,
                                        sceneId: sceneData.id,
                                    });
                                }
                            },
                        },
                    );
                });
            }
        }
        createDragState.current = null;
        createDraftRangeRef.current = null;
        setCreateDraftRange(null);
    }, [createEffect, onPointerMove, sceneData, selectEffect]);

    const startCreateDrag = useCallback(
        (ev: React.PointerEvent<HTMLDivElement>) => {
            if (isPlaying || !sceneData) return;
            const strip = stripRef.current;
            if (!strip) return;
            if (ev.target !== strip) return;
            ev.preventDefault();
            ev.stopPropagation();
            const rect = strip.getBoundingClientRect();
            const pointerX = ev.clientX - rect.left;
            const downIdx = findClosestBoundaryIndex(beatBoundaryPx, pointerX);
            const startBeats = Math.max(
                0,
                Math.min(sceneTotalBeats - 1, downIdx),
            );
            createDragState.current = {
                pointerDownBeatIdx: startBeats,
                sceneTotalBeats,
                beatBoundaryPx,
            };
            const initialDraft = { startBeats, durationBeats: 1 };
            createDraftRangeRef.current = initialDraft;
            setCreateDraftRange(initialDraft);
            document.addEventListener("pointermove", onPointerMove);
            document.addEventListener("pointerup", onPointerUp);
        },
        [
            beatBoundaryPx,
            isPlaying,
            onPointerMove,
            onPointerUp,
            sceneData,
            sceneTotalBeats,
        ],
    );

    if (sceneStartBeatPos == null || sceneTotalBeats === 0) return null;

    const showHint = createDraftRange == null;
    const hintText =
        effectCount === 0
            ? t("timeline.addEffect")
            : t("timeline.addEffectHint");
    const createDraftPx = createDraftRange
        ? barPxFromBoundary(
              beatBoundaryPx,
              createDraftRange.startBeats,
              createDraftRange.durationBeats,
          )
        : null;

    return (
        <div
            ref={stripRef}
            className={`relative w-full ${!isPlaying ? "cursor-crosshair" : ""}`}
            onPointerDown={startCreateDrag}
            style={{
                width: `${widthPx}px`,
                height: `${labelHeightPx}px`,
            }}
            aria-label={t("timeline.addEffect")}
        >
            {showHint && (
                <div className="text-text-subtitle pointer-events-none absolute inset-0 z-0 flex items-center justify-center text-xs font-medium">
                    {hintText}
                </div>
            )}
            {createDraftPx && (
                <div
                    className="border-accent/70 bg-accent/20 pointer-events-none absolute top-0 z-10 rounded-[6px] border border-dashed"
                    style={{
                        left: `${createDraftPx.leftPx}px`,
                        width: `${Math.max(
                            MIN_DRAFT_BAR_PX,
                            createDraftPx.widthPx,
                        )}px`,
                        height: `${labelHeightPx}px`,
                    }}
                    aria-hidden
                />
            )}
        </div>
    );
}

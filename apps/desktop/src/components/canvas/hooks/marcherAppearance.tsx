import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import {
    allLightingScenesQueryOptions,
    allMarchersQueryOptions,
    DEFAULT_STALE_TIME,
    fieldPropertiesQueryOptions,
    lightingEffectByIdQueryOptions,
    lightingSceneDataByIdQueryOptions,
    marcherAppearancesQueryOptions,
    marcherWithVisualsQueryOptions,
} from "@/hooks/queries";
import { useTimingObjects } from "@/hooks";
import { lightDesignerFrameRegistry } from "@/components/canvas/lightDesignerFrameRegistry";
import {
    buildLightingSceneTimeWindowsMs,
    findLightingSceneAtShowTime,
} from "@/components/timeline/SceneTimeline.utils";
import { compareBeats } from "@/global/classes/Beat";
import { lightingEffectBeatWindowToSceneLocalMs } from "@/utilities/lightingBeatSpans";
import type { LightingEffectWithMarchers } from "@/db-functions";
import type { AppearanceComponentOptional } from "@/entity-components/appearance";
import { useWorkspaceViewStore } from "@/stores/WorkspaceViewStore";
import { getCurrentShowTimeMs } from "@/utilities/showTime";
import {
    buildLightingScenePlan,
    sampleMarcherLightingFill,
    type LightingRgba,
    type LightingScenePlan,
} from "@openmarch/core";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

export function MarcherAppearance({
    canvas,
}: {
    canvas: OpenMarchCanvas | null;
}) {
    const workspaceMode = useWorkspaceViewStore.use.mode();

    if (workspaceMode === "editor")
        return <EditorMarcherAppearances canvas={canvas} />;
    if (workspaceMode === "lightDesigner")
        return <LightDesignerMarcherAppearances canvas={canvas} />;
    throw new Error(`Unsupported workspace mode: ${workspaceMode}`);
}

const EditorMarcherAppearances = ({
    canvas,
}: {
    canvas: OpenMarchCanvas | null;
}) => {
    const queryClient = useQueryClient();
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { data: marcherVisuals } = useQuery(marcherWithVisualsQueryOptions());

    const { selectedPage } = useSelectedPage()!;
    const { data: marcherAppearances } = useQuery(
        marcherAppearancesQueryOptions(selectedPage?.id, queryClient),
    );

    useEffect(() => {
        if (
            !canvas ||
            !marchers ||
            marcherAppearances == null ||
            marcherVisuals == null
        )
            return;

        // Add all marcher appearances to the canvas
        marchers.forEach((marcher) => {
            const visualGroup = marcherVisuals[marcher.id];
            const appearancesForMarcher = marcherAppearances[marcher.id];
            if (!visualGroup || !appearancesForMarcher) return;

            const canvasMarcher = visualGroup.getCanvasMarcher();
            canvasMarcher.setAppearance(
                appearancesForMarcher,
                {
                    requestRenderAll: false,
                },
                fieldProperties?.theme.defaultMarcher.label,
            );
        });

        canvas.requestRenderAll();
    }, [
        canvas,
        marchers,
        marcherAppearances,
        marcherVisuals,
        fieldProperties?.theme.defaultMarcher.label,
    ]);

    return null;
};

const defaultLightingBaseFill: LightingRgba = {
    r: 0,
    g: 0,
    b: 0,
    a: 1,
};

const LightDesignerMarcherAppearances = ({
    canvas,
}: {
    canvas: OpenMarchCanvas | null;
}) => {
    const queryClient = useQueryClient();
    const { isPlaying } = useIsPlaying()!;
    const { pages, beats } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { data: marcherVisuals } = useQuery(marcherWithVisualsQueryOptions());
    const { data: marcherAppearances } = useQuery(
        marcherAppearancesQueryOptions(selectedPage?.id, queryClient),
    );
    const { data: lightingScenes = [] } = useQuery(
        allLightingScenesQueryOptions(),
    );

    const sceneIds = useMemo(
        () => lightingScenes.map((s) => s.id),
        [lightingScenes],
    );

    const sceneDataResults = useQueries({
        queries: sceneIds.map((id) => ({
            ...lightingSceneDataByIdQueryOptions(id),
            staleTime: DEFAULT_STALE_TIME,
        })),
    });

    const sortedEffectIds: number[] = (() => {
        const ids = new Set<number>();
        for (const q of sceneDataResults) {
            for (const eid of q.data?.lightingEffectIds ?? []) ids.add(eid);
        }
        return Array.from(ids).sort((a, b) => a - b);
    })();

    const effectResults = useQueries({
        queries: sortedEffectIds.map((id) => ({
            ...lightingEffectByIdQueryOptions(id),
            staleTime: DEFAULT_STALE_TIME,
        })),
    });

    const sceneKey = `${sceneIds.join(".")}|${sceneDataResults
        .map((q) => (q.data?.lightingEffectIds ?? []).join("."))
        .join("|")}`;

    const effectKey = sortedEffectIds
        .map((id, i) => {
            const d = effectResults[i]?.data;
            return d
                ? `${id}:${d.type}:${d.args}:${d.start_offset_beats}:${d.duration_beats}:${[...d.marcherIds].sort((a, b) => a - b).join(".")}`
                : "";
        })
        .join("|");

    const beatsSorted = useMemo(() => [...beats].sort(compareBeats), [beats]);

    const sceneStartBeatPositionBySceneId = useMemo(() => {
        const map = new Map<number, number>();
        for (const ls of lightingScenes) {
            const page = pages.find((p) => p.id === ls.start_page_id);
            const pos = page?.beats[0]?.position;
            if (pos != null) map.set(ls.id, pos);
        }
        return map;
    }, [lightingScenes, pages]);

    const plansBySceneId = useMemo(() => {
        const effectByIdInner = new Map<number, LightingEffectWithMarchers>();
        for (let i = 0; i < sortedEffectIds.length; i++) {
            const id = sortedEffectIds[i]!;
            const row = effectResults[i]?.data;
            if (row) effectByIdInner.set(id, row);
        }
        const out = new Map<number, LightingScenePlan>();
        for (let i = 0; i < sceneIds.length; i++) {
            const sid = sceneIds[i]!;
            const effectIds =
                sceneDataResults[i]?.data?.lightingEffectIds ?? [];
            const anchorPos = sceneStartBeatPositionBySceneId.get(sid);
            const inputs = [];
            for (const eid of effectIds) {
                const row = effectByIdInner.get(eid);
                if (!row) continue;
                if (anchorPos == null) {
                    inputs.push({
                        type: row.type,
                        argsJson: row.args,
                        durationMs: 0,
                        marcherIds: [...row.marcherIds],
                        startMs: 0,
                    });
                    continue;
                }
                const { startMs, durationMs } =
                    lightingEffectBeatWindowToSceneLocalMs(
                        beatsSorted,
                        anchorPos,
                        row.start_offset_beats,
                        row.duration_beats,
                    );
                inputs.push({
                    type: row.type,
                    argsJson: row.args,
                    durationMs,
                    marcherIds: [...row.marcherIds],
                    startMs,
                });
            }
            out.set(sid, buildLightingScenePlan(inputs));
        }
        return out;
        // Keys fingerprint query payloads; effectResults/sceneDataResults are read from the latest render closure.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- stable via sceneKey + effectKey
    }, [sceneKey, effectKey, beatsSorted, sceneStartBeatPositionBySceneId]);

    const windows = useMemo(
        () => buildLightingSceneTimeWindowsMs(pages, lightingScenes),
        [pages, lightingScenes],
    );

    const lastFillKeyRef = useRef(new Map<number, string>());

    useEffect(() => {
        lastFillKeyRef.current.clear();
    }, [plansBySceneId, windows, marcherAppearances, marcherVisuals]);

    const labelDefault = fieldProperties?.theme.defaultMarcher.label;

    const applyAtShowTime = useCallback(
        (tShowMs: number, requestCanvasRender: boolean) => {
            if (
                !canvas ||
                !marchers ||
                marcherAppearances == null ||
                marcherVisuals == null
            )
                return;

            const baseFillForSample = defaultLightingBaseFill;
            const active = findLightingSceneAtShowTime(windows, tShowMs);
            const plan =
                active != null ? plansBySceneId.get(active.sceneId) : undefined;

            marchers.forEach((marcher) => {
                const visualGroup = marcherVisuals[marcher.id];
                const appearancesForMarcher = marcherAppearances[marcher.id];
                if (!visualGroup || !appearancesForMarcher) return;

                const canvasMarcher = visualGroup.getCanvasMarcher();
                let fillOverride: LightingRgba | undefined;
                if (plan && active) {
                    fillOverride = sampleMarcherLightingFill(
                        plan,
                        active.tSceneMs,
                        marcher.id,
                        baseFillForSample,
                    );
                }
                const resolvedFill = fillOverride ?? defaultLightingBaseFill;
                const key = `${Math.round(resolvedFill.r)},${Math.round(resolvedFill.g)},${Math.round(resolvedFill.b)}`;
                if (lastFillKeyRef.current.get(marcher.id) === key) return;
                lastFillKeyRef.current.set(marcher.id, key);

                const lightingLayer: AppearanceComponentOptional = {
                    fill_color: {
                        r: resolvedFill.r,
                        g: resolvedFill.g,
                        b: resolvedFill.b,
                        a: resolvedFill.a,
                    },
                    visible: true,
                    label_visible: true,
                };
                canvasMarcher.setAppearance(
                    [lightingLayer, ...appearancesForMarcher],
                    { requestRenderAll: false },
                    labelDefault,
                );
            });

            if (requestCanvasRender) canvas.requestRenderAll();
        },
        [
            canvas,
            marchers,
            marcherAppearances,
            marcherVisuals,
            windows,
            plansBySceneId,
            labelDefault,
        ],
    );

    useEffect(() => {
        lightDesignerFrameRegistry.set((tMs) => applyAtShowTime(tMs, false));
        return () => {
            lightDesignerFrameRegistry.set(null);
        };
    }, [applyAtShowTime]);

    useEffect(() => {
        if (isPlaying) return;
        applyAtShowTime(getCurrentShowTimeMs(false, selectedPage), true);
    }, [
        isPlaying,
        selectedPage,
        applyAtShowTime,
        marcherAppearances,
        marcherVisuals,
        plansBySceneId,
        windows,
    ]);

    return null;
};

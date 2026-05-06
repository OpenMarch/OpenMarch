import { useIsPlaying } from "@/context/IsPlayingContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
import { useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSelectedPage } from "@/context/SelectedPageContext";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { TrashIcon } from "@phosphor-icons/react";
import { FIRST_PAGE_ID } from "@/db-functions";
import {
    allLightingScenesQueryOptions,
    lightingSceneIdInPageIdQueryOptions,
    lightingScenePositionByLightingSceneIdMapQueryOptions,
} from "@/hooks/queries/lighting/queries";
import {
    createLightingScenesMutationOptions,
    deleteLightingSceneWithReassignmentMutationOptions,
} from "@/hooks/queries/lighting/mutations";
import {
    buildSceneDeletePlan,
    buildOrderedSceneStarts,
    buildSceneTimelineSegments,
    resolveLightingInspectorSelectedPageId,
    timelineLeftPxAtPageStart,
    totalTimelineWidthPx,
} from "./SceneTimeline.utils";
import LightingEffectBars, {
    expandedSceneHeightPx,
} from "./LightingEffectBars";
import { useTranslate } from "@tolgee/react";

const SPACING = 4;
const COLLAPSED_HEIGHT_PX = 32;
const SCENE_LABEL_HEIGHT_PX = 16;

export default function SceneTimeline() {
    const { t } = useTranslate();
    const { isPlaying } = useIsPlaying()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { uiSettings } = useUiSettingsStore();
    const { pages, beats } = useTimingObjects()!;
    const { data: positionMap = {} } = useQuery(
        lightingScenePositionByLightingSceneIdMapQueryOptions(),
    );
    const pps = uiSettings.timelinePixelsPerSecond;

    const { data: scenes = [] } = useQuery(allLightingScenesQueryOptions());
    const { mutate: createScenes } = useMutation(
        createLightingScenesMutationOptions(),
    );
    const { mutate: deleteSceneWithReassignment } = useMutation(
        deleteLightingSceneWithReassignmentMutationOptions(),
    );
    const [hoveredSceneId, setHoveredSceneId] = useState<number | null>(null);
    const [selectedSceneLaneCount, setSelectedSceneLaneCount] = useState(0);

    const segments = useMemo(
        () => buildSceneTimelineSegments(pages, scenes, pps),
        [pages, scenes, pps],
    );
    const orderedStarts = useMemo(
        () => buildOrderedSceneStarts(pages, scenes),
        [pages, scenes],
    );
    const sceneStartPageIdBySceneId = useMemo(() => {
        const entries = orderedStarts.map((s) => [s.sceneId, s.startPageId]);
        return Object.fromEntries(entries) as Record<number, number>;
    }, [orderedStarts]);
    const playbackStartPageId = useMemo(() => {
        if (selectedPage == null) return null;
        if (selectedPage.id === 0) return selectedPage.id;
        return selectedPage.nextPageId ?? null;
    }, [selectedPage]);
    const { data: selectedSceneId } = useQuery({
        ...lightingSceneIdInPageIdQueryOptions(playbackStartPageId ?? 0),
        enabled: playbackStartPageId != null,
    });

    const totalWidthPx = useMemo(
        () => totalTimelineWidthPx(pages, pps),
        [pages, pps],
    );

    const expandedHeightPx = useMemo(
        () =>
            selectedSceneId != null
                ? expandedSceneHeightPx(
                      Math.max(1, selectedSceneLaneCount),
                      SCENE_LABEL_HEIGHT_PX,
                  )
                : COLLAPSED_HEIGHT_PX,
        [selectedSceneId, selectedSceneLaneCount],
    );

    const splitAtPageIndex = useCallback(
        (pageIndex: number) => {
            const page = pages[pageIndex];
            if (!page) return;
            if (scenes.some((s) => s.start_page_id === page.id)) return;
            createScenes([{ start_page_id: page.id, name: null }]);
        },
        [createScenes, pages, scenes],
    );
    const handleDeleteScene = useCallback(
        (sceneId: number) => {
            if (isPlaying) return;
            const deletePlan = buildSceneDeletePlan(orderedStarts, sceneId);
            if (!deletePlan.canDelete) return;

            deleteSceneWithReassignment({
                sceneId,
                reassignedSceneId: deletePlan.reassignedSceneId,
                reassignedStartPageId: FIRST_PAGE_ID,
            });
        },
        [deleteSceneWithReassignment, isPlaying, orderedStarts],
    );

    const selectScene = useCallback(
        (sceneId: number) => {
            if (isPlaying) return;
            const startPageId = sceneStartPageIdBySceneId[sceneId];
            if (startPageId == null) return;
            const pageIdToSelect = resolveLightingInspectorSelectedPageId(
                pages,
                startPageId,
            );
            if (pageIdToSelect == null) return;
            setSelectedPage({ id: pageIdToSelect });
        },
        [isPlaying, pages, sceneStartPageIdBySceneId, setSelectedPage],
    );

    if (pages.length === 0) {
        return null;
    }

    const containerMinHeight = Math.max(
        COLLAPSED_HEIGHT_PX + 8,
        expandedHeightPx + 8,
    );

    return (
        <div
            className="relative h-fit shrink-0"
            style={{
                width: `${totalWidthPx}px`,
                minHeight: `${containerMinHeight}px`,
            }}
            aria-label="lighting scenes"
        >
            {segments.map((seg) => {
                const barLeftPx = seg.leftPx + SPACING;
                const isSelected = selectedSceneId === seg.sceneId;
                const isHovered = hoveredSceneId === seg.sceneId;
                const cannotDeleteScene =
                    isPlaying || orderedStarts.length <= 1;
                const segmentInnerWidthPx = Math.max(
                    0,
                    seg.widthPx - SPACING * 2,
                );
                const splitButtons = !isPlaying
                    ? seg.internalSplitPageIndices.map((pageIndex) => {
                          const boundaryAbsPx = timelineLeftPxAtPageStart(
                              pages,
                              pageIndex,
                              pps,
                          );
                          const leftInSegment = boundaryAbsPx - barLeftPx;
                          if (isSelected) {
                              return (
                                  <div
                                      key={`split-${seg.sceneId}-${pageIndex}`}
                                      className="pointer-events-none absolute top-0 z-10 flex h-full w-[10px] -translate-x-1/2 items-stretch justify-center"
                                      style={{ left: `${leftInSegment}px` }}
                                      aria-hidden
                                  >
                                      <span className="border-text/40 h-full shrink-0 border-l border-dashed" />
                                  </div>
                              );
                          }

                          return (
                              <button
                                  key={`split-${seg.sceneId}-${pageIndex}`}
                                  type="button"
                                  className="hover:bg-text-invert/10 absolute top-0 z-10 flex h-full w-[10px] -translate-x-1/2 cursor-pointer items-stretch justify-center border-0 bg-transparent p-0"
                                  style={{ left: `${leftInSegment}px` }}
                                  aria-label="Split scene at page boundary"
                                  onClick={(e) => {
                                      if (isPlaying) return;
                                      e.stopPropagation();
                                      splitAtPageIndex(pageIndex);
                                  }}
                                  onPointerDown={(e) => e.stopPropagation()}
                              >
                                  <span
                                      className="border-text-invert/40 pointer-events-none h-full shrink-0 border-l border-dashed"
                                      aria-hidden
                                  />
                              </button>
                          );
                      })
                    : null;

                return (
                    <ContextMenu.Root key={seg.sceneId}>
                        <ContextMenu.Trigger>
                            {isSelected ? (
                                <div
                                    className={clsx(
                                        "border-stroke bg-fg-1 ring-text absolute top-0 overflow-clip rounded-[10px] border ring-2 transition-all",
                                        !isPlaying &&
                                            !isSelected &&
                                            "cursor-pointer",
                                    )}
                                    style={{
                                        left: `${barLeftPx}px`,
                                        width: `${segmentInnerWidthPx}px`,
                                        height: `${expandedHeightPx}px`,
                                    }}
                                    role="button"
                                    tabIndex={isPlaying ? -1 : 0}
                                    aria-pressed
                                    aria-label={`Scene ${positionMap[seg.sceneId] ?? seg.sceneId} (selected)`}
                                    onPointerEnter={() =>
                                        setHoveredSceneId(seg.sceneId)
                                    }
                                    onPointerLeave={() =>
                                        setHoveredSceneId(null)
                                    }
                                    onClick={() => selectScene(seg.sceneId)}
                                    onKeyDown={(e) => {
                                        if (e.key !== "Enter" && e.key !== " ")
                                            return;
                                        e.preventDefault();
                                        selectScene(seg.sceneId);
                                    }}
                                >
                                    <div
                                        className="absolute"
                                        style={{
                                            top: 4,
                                            left: 4,
                                            right: 4,
                                            bottom: 4 + SCENE_LABEL_HEIGHT_PX,
                                        }}
                                    >
                                        <LightingEffectBars
                                            sceneId={seg.sceneId}
                                            widthPx={Math.max(
                                                0,
                                                segmentInnerWidthPx - 8,
                                            )}
                                            pixelsPerSecond={pps}
                                            pages={pages}
                                            beats={beats}
                                            orderedStarts={orderedStarts}
                                            onLaneCountChange={
                                                setSelectedSceneLaneCount
                                            }
                                        />
                                    </div>
                                    <span
                                        className="bg-accent text-text-invert text-sub pointer-events-none absolute right-1 bottom-1 z-20 flex items-center justify-center rounded-full px-6 font-mono leading-none"
                                        style={{
                                            height: `${SCENE_LABEL_HEIGHT_PX}px`,
                                        }}
                                    >
                                        {positionMap[seg.sceneId] ??
                                            seg.sceneId}
                                    </span>
                                    {splitButtons}
                                </div>
                            ) : (
                                <div
                                    className={clsx(
                                        "bg-accent text-body text-text-invert border-stroke absolute top-0 flex items-center justify-center overflow-clip rounded-full border px-8 py-4 font-mono transition-all",
                                        !isPlaying &&
                                            "cursor-pointer hover:-translate-y-[1px]",
                                        isHovered && "brightness-110",
                                    )}
                                    style={{
                                        left: `${barLeftPx}px`,
                                        width: `${segmentInnerWidthPx}px`,
                                        height: `${COLLAPSED_HEIGHT_PX}px`,
                                    }}
                                    role="button"
                                    tabIndex={isPlaying ? -1 : 0}
                                    aria-pressed={false}
                                    aria-label={`Select scene ${positionMap[seg.sceneId] ?? seg.sceneId}`}
                                    onPointerEnter={() =>
                                        setHoveredSceneId(seg.sceneId)
                                    }
                                    onPointerLeave={() =>
                                        setHoveredSceneId(null)
                                    }
                                    onClick={() => selectScene(seg.sceneId)}
                                    onKeyDown={(e) => {
                                        if (isPlaying) return;
                                        if (e.key !== "Enter" && e.key !== " ")
                                            return;
                                        e.preventDefault();
                                        selectScene(seg.sceneId);
                                    }}
                                >
                                    <span className="pointer-events-none">
                                        {positionMap[seg.sceneId] ??
                                            seg.sceneId}
                                    </span>
                                    {splitButtons}
                                </div>
                            )}
                        </ContextMenu.Trigger>
                        <ContextMenu.Portal>
                            <ContextMenu.Content className="bg-modal text-text rounded-6 border-stroke shadow-modal z-50 m-6 flex min-w-[180px] flex-col gap-8 border p-12 backdrop-blur-md">
                                <ContextMenu.Item
                                    disabled={cannotDeleteScene}
                                    className={clsx(
                                        "rounded-4 flex items-center justify-between gap-8 px-8 py-6 text-sm outline-none",
                                        cannotDeleteScene
                                            ? "text-text/40 cursor-not-allowed"
                                            : "text-red focus:bg-fg-2 cursor-pointer",
                                    )}
                                    onSelect={() =>
                                        handleDeleteScene(seg.sceneId)
                                    }
                                >
                                    {t("timeline.deleteScene")}
                                    <TrashIcon size={16} />
                                </ContextMenu.Item>
                            </ContextMenu.Content>
                        </ContextMenu.Portal>
                    </ContextMenu.Root>
                );
            })}
        </div>
    );
}

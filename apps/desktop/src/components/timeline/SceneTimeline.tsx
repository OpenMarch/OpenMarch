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
import { useTranslate } from "@tolgee/react";

const SPACING = 4;

export default function SceneTimeline() {
    const { t } = useTranslate();
    const { isPlaying } = useIsPlaying()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { uiSettings } = useUiSettingsStore();
    const { pages } = useTimingObjects()!;
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

    if (pages.length === 0) {
        return null;
    }

    return (
        <div
            className="relative h-fit shrink-0"
            style={{ width: `${totalWidthPx}px`, minHeight: "2.5rem" }}
            aria-label="lighting scenes"
        >
            {segments.map((seg) => {
                const barLeftPx = seg.leftPx + SPACING;
                const isSelected = selectedSceneId === seg.sceneId;
                const isHovered = hoveredSceneId === seg.sceneId;
                const cannotDeleteScene =
                    isPlaying || orderedStarts.length <= 1;
                return (
                    <ContextMenu.Root key={seg.sceneId}>
                        <ContextMenu.Trigger>
                            <div
                                className={clsx(
                                    "bg-accent text-body text-text-invert border-stroke absolute top-0 flex h-[2rem] items-center justify-center overflow-clip rounded-full border px-8 py-4 font-mono transition-all",
                                    !isPlaying &&
                                        "cursor-pointer hover:-translate-y-[1px]",
                                    isHovered && "brightness-110",
                                    isSelected &&
                                        "ring-text ring-2 ring-offset-1",
                                )}
                                style={{
                                    left: `${barLeftPx}px`,
                                    width: `${seg.widthPx - SPACING * 2}px`,
                                }}
                                role="button"
                                tabIndex={isPlaying ? -1 : 0}
                                aria-pressed={isSelected}
                                aria-label={`Select scene ${positionMap[seg.sceneId] ?? seg.sceneId}`}
                                onPointerEnter={() =>
                                    setHoveredSceneId(seg.sceneId)
                                }
                                onPointerLeave={() => setHoveredSceneId(null)}
                                onClick={() => {
                                    if (isPlaying) return;
                                    const startPageId =
                                        sceneStartPageIdBySceneId[seg.sceneId];
                                    if (startPageId == null) return;
                                    const pageIdToSelect =
                                        resolveLightingInspectorSelectedPageId(
                                            pages,
                                            startPageId,
                                        );
                                    if (pageIdToSelect == null) return;
                                    setSelectedPage({ id: pageIdToSelect });
                                }}
                                onKeyDown={(e) => {
                                    if (isPlaying) return;
                                    if (e.key !== "Enter" && e.key !== " ")
                                        return;
                                    e.preventDefault();
                                    const startPageId =
                                        sceneStartPageIdBySceneId[seg.sceneId];
                                    if (startPageId == null) return;
                                    const pageIdToSelect =
                                        resolveLightingInspectorSelectedPageId(
                                            pages,
                                            startPageId,
                                        );
                                    if (pageIdToSelect == null) return;
                                    setSelectedPage({ id: pageIdToSelect });
                                }}
                            >
                                <span className="pointer-events-none">
                                    {positionMap[seg.sceneId] ?? seg.sceneId}
                                </span>
                                {!isPlaying &&
                                    seg.internalSplitPageIndices.map(
                                        (pageIndex) => {
                                            const boundaryAbsPx =
                                                timelineLeftPxAtPageStart(
                                                    pages,
                                                    pageIndex,
                                                    pps,
                                                );
                                            const leftInSegment =
                                                boundaryAbsPx - barLeftPx;
                                            return (
                                                <button
                                                    key={`split-${seg.sceneId}-${pageIndex}`}
                                                    type="button"
                                                    className="hover:bg-text-invert/10 absolute top-0 z-10 flex h-full w-[10px] -translate-x-1/2 cursor-pointer items-stretch justify-center border-0 bg-transparent p-0"
                                                    style={{
                                                        left: `${leftInSegment}px`,
                                                    }}
                                                    aria-label="Split scene at page boundary"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        splitAtPageIndex(
                                                            pageIndex,
                                                        );
                                                    }}
                                                    onPointerDown={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <span
                                                        className="border-text-invert/40 pointer-events-none h-full shrink-0 border-l border-dashed"
                                                        aria-hidden
                                                    />
                                                </button>
                                            );
                                        },
                                    )}
                            </div>
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

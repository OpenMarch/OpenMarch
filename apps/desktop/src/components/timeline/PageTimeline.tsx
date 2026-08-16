import { useIsPlaying } from "@/services/clock/frame-clock";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
import Page, { updatePageCountRequest } from "@/global/classes/Page";
import clsx from "clsx";
import { durationToBeats } from "@/global/classes/Beat";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Switch, TooltipClassName } from "@openmarch/ui";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { T, useTolgee } from "@tolgee/react";
import * as ToolTip from "@radix-ui/react-tooltip";
import {
    deletePageYankMutationOptions,
    deletePagesMutationOptions,
    ModifyPagesRequest,
    updatePagesMutationOptions,
} from "@/hooks/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelectionStore } from "@/stores/SelectionStore";
import {
    getAvailableOffsets,
    useCreateLastPageOnTimeline,
} from "./PageTimeline.utils";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";

type PageTimelineItemProps = {
    page: Page;
    width: number;
    isSelected: boolean;
    isPlaying: boolean;
    isFullscreen: boolean;
    showProgressBar: boolean;
    isResizingThis: boolean;
    dragCount: number | undefined;
    nextPageCount: number | null;
    t: ReturnType<typeof useTolgee>["t"];
    onSelect: (page: Page) => void;
    onClearShapeSelection: () => void;
    onResizeStart: (e: MouseEvent, page: Page) => void;
    onToggleSubset: (page: Page) => void;
    onDeleteYank: (page: Page) => void;
    onDelete: (page: Page) => void;
};

/**
 * A single row in the page timeline. Memoized because each row mounts a Radix
 * `ContextMenu.Root` + `Tooltip.Root` (portals, floating-ui positioning, etc.) which is
 * expensive to reconcile — without memoization, every page change during playback
 * re-renders *every* row in the show just to flip the "selected" styling on the 1-2
 * rows that actually changed. See the `PageTimeline` hitch investigation.
 */
const PageTimelineItem = memo(function PageTimelineItem({
    page,
    width,
    isSelected,
    isPlaying,
    isFullscreen,
    showProgressBar,
    isResizingThis,
    dragCount,
    nextPageCount,
    t,
    onSelect,
    onClearShapeSelection,
    onResizeStart,
    onToggleSubset,
    onDeleteYank,
    onDelete,
}: PageTimelineItemProps) {
    return (
        <ContextMenu.Root
            aria-label={t("timeline.page.label", {
                pageName: page.name,
            })}
        >
            <ContextMenu.Trigger
                disabled={isPlaying || isFullscreen}
                className="group"
            >
                <div
                    className="relative h-full overflow-clip"
                    timeline-page-id={page.id}
                    style={{ width: `${width}px` }}
                >
                    <div
                        className={clsx(
                            "bg-fg-2 text-body text-text group-last:rounded-r-6 relative flex h-full items-center justify-end overflow-clip border px-8 py-4 font-mono",
                            !isPlaying && "cursor-pointer",
                            isSelected
                                ? [
                                      "border-accent",
                                      isPlaying &&
                                          "text-text/75 pointer-events-none",
                                  ]
                                : [
                                      "border-stroke",
                                      isPlaying &&
                                          "text-text/75 pointer-events-none",
                                  ],
                        )}
                        onClick={() => {
                            if (!isPlaying) onSelect(page);
                            onClearShapeSelection();
                        }}
                    >
                        <div className="rig static z-10">{page.name}</div>
                        {/* ------ progress bar (fullscreen) ------ */}
                        {showProgressBar && isPlaying && (
                            <div
                                className={clsx(
                                    "absolute top-0 left-0 z-0 h-full w-full",
                                    !isFullscreen
                                        ? "bg-accent/25"
                                        : "bg-accent/25",
                                )}
                                style={{
                                    animation: `progress ${page.duration}s linear forwards`,
                                }}
                            />
                        )}
                    </div>
                    {/* ------ page resize dragging ------ */}
                    {!isFullscreen && (
                        <ToolTip.Root
                            key={`tooltip-${page.id}-${isResizingThis ? "resizing" : "normal"}`}
                            open={isResizingThis ? true : undefined}
                            delayDuration={100}
                        >
                            <ToolTip.Trigger asChild>
                                <div
                                    className={clsx(
                                        "absolute top-0 right-0 z-20 h-full w-16 cursor-ew-resize transition-colors",
                                        isResizingThis
                                            ? "bg-accent/50"
                                            : "hover:bg-accent/30 bg-transparent",
                                    )}
                                    hidden={isPlaying}
                                    onMouseDown={(e) =>
                                        onResizeStart(e.nativeEvent, page)
                                    }
                                >
                                    &nbsp;
                                </div>
                            </ToolTip.Trigger>
                            <ToolTip.Portal>
                                <ToolTip.Content className={TooltipClassName}>
                                    {(isResizingThis && dragCount) ||
                                        page.counts}{" "}
                                    {/* calculates the next page count based on the difference */}
                                    {nextPageCount != null &&
                                        `| ${nextPageCount}`}
                                </ToolTip.Content>
                            </ToolTip.Portal>
                        </ToolTip.Root>
                    )}
                </div>
            </ContextMenu.Trigger>
            {/* ------ context menu ------ */}
            <ContextMenu.Portal>
                <ContextMenu.Content className="bg-modal text-text rounded-6 border-stroke shadow-modal z-50 m-6 flex flex-col gap-8 border p-16 py-12 backdrop-blur-md">
                    <h5 className="text-h5">
                        {t("timeline.page.contextMenu.title", {
                            pageName: page.name,
                        })}
                    </h5>

                    <div className="flex w-full items-center justify-between gap-8">
                        <label className="text-body text-text-subtitle">
                            <T keyName="timeline.page.contextMenu.subsetToggle" />
                        </label>
                        <Switch
                            onClick={() => onToggleSubset(page)}
                            checked={page?.isSubset || false}
                        />
                    </div>
                    <div className="border-stroke flex w-full flex-col items-start gap-8 border-t pt-8">
                        <div className="text-text flex items-center gap-6 text-xs">
                            <TrashIcon size={16} />
                            <T keyName="timeline.page.contextMenu.delete" />
                        </div>
                        <ToolTip.Root delayDuration={500}>
                            <ToolTip.Trigger asChild>
                                <button
                                    className="text-body text-text-subtitle hover:text-red cursor-pointer text-left transition-colors"
                                    onClick={() => onDeleteYank(page)}
                                >
                                    <T keyName="timeline.page.contextMenu.deleteYank" />
                                </button>
                            </ToolTip.Trigger>
                            <ToolTip.Portal>
                                <ToolTip.Content
                                    className={TooltipClassName}
                                    side="right"
                                >
                                    {t(
                                        "timeline.page.contextMenu.deleteYankTooltip",
                                    )}
                                </ToolTip.Content>
                            </ToolTip.Portal>
                        </ToolTip.Root>
                        <ToolTip.Root delayDuration={500}>
                            <ToolTip.Trigger asChild>
                                <button
                                    className="text-body text-text-subtitle hover:text-red cursor-pointer text-left transition-colors"
                                    onClick={() => onDelete(page)}
                                >
                                    <T keyName="timeline.page.contextMenu.deleteInPlace" />
                                </button>
                            </ToolTip.Trigger>
                            <ToolTip.Portal>
                                <ToolTip.Content
                                    className={TooltipClassName}
                                    side="right"
                                >
                                    {t(
                                        "timeline.page.contextMenu.deleteInPlaceTooltip",
                                    )}
                                </ToolTip.Content>
                            </ToolTip.Portal>
                        </ToolTip.Root>
                    </div>
                </ContextMenu.Content>
            </ContextMenu.Portal>
        </ContextMenu.Root>
    );
});

// eslint-disable-next-line max-lines-per-function
export default function PageTimeline() {
    const queryClient = useQueryClient();
    const { uiSettings } = useUiSettingsStore();
    const isPlaying = useIsPlaying();
    const { selectedPage, seekTo } = useSelectedPage()!;
    const { setSelectedShapePageIds } = useSelectionStore()!;
    const { isFullscreen } = useFullscreenStore();
    const { pages, beats } = useTimingObjects()!;
    const { mutate: updatePages } = useMutation(
        updatePagesMutationOptions(queryClient),
    );
    const { mutate: deletePages } = useMutation(
        deletePagesMutationOptions(queryClient),
    );
    const { mutate: deletePageYank } = useMutation(
        deletePageYankMutationOptions(queryClient),
    );

    // Page clicking and dragging
    const resizingPage = useRef<Page | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [currentDragCounts, setCurrentDragCounts] = useState<{
        [pageId: number]: number;
    }>({});
    const startX = useRef(0);
    const startWidth = useRef(0);
    const availableOffsets = useRef<number[]>([]);

    const { mutate: createDefaultTempoGroupAndPage } =
        useCreateLastPageOnTimeline();
    // Creating a page needs the workspace settings, which load asynchronously
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );
    const { t } = useTolgee();

    // Calculate the width of a page based on its duration
    // Add a small buffer to ensure the page visually includes all its beats
    const getWidth = useCallback(
        (page: Page) => {
            // Use the page's duration to calculate the width
            // Add a small buffer (equivalent to 1 beat) to ensure all beats are visually included
            return page.duration * uiSettings.timelinePixelsPerSecond;
        },
        [uiSettings.timelinePixelsPerSecond],
    );

    // Function to handle the start of resizing
    const handlePageResizeStart = useCallback(
        (e: MouseEvent, page: Page) => {
            if (isPlaying) return; // Don't allow resizing during playback

            e.preventDefault();
            e.stopPropagation(); // Prevent triggering page selection

            resizingPage.current = page;
            setIsResizing(true);
            startX.current = e.clientX;
            startWidth.current = getWidth(page);
            availableOffsets.current = getAvailableOffsets({
                currentPage: page,
                nextPage: pages[pages.indexOf(page) + 1] || null,
                allBeats: beats,
            }).map((offset) => offset * uiSettings.timelinePixelsPerSecond);

            // Add event listeners for mouse move and mouse up
            document.addEventListener("mousemove", handlePageResizeMove);
            document.addEventListener("mouseup", handlePageResizeEnd);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isPlaying, getWidth, pages, beats, uiSettings.timelinePixelsPerSecond],
    );

    // Function to handle resizing movement
    const handlePageResizeMove = useCallback(
        (e: MouseEvent) => {
            if (!resizingPage.current) return;

            // Find the next page
            const currentPageIndex = pages.findIndex(
                (page) => page.id === resizingPage.current!.id,
            );
            const nextPageIndex = currentPageIndex + 1;
            const nextPage =
                nextPageIndex < pages.length ? pages[nextPageIndex] : null;

            const deltaX = e.clientX - startX.current;
            const closestOffset = availableOffsets.current.reduce((a, b) => {
                return Math.abs(b - deltaX) < Math.abs(a - deltaX) ? b : a;
            });
            const newWidth = startWidth.current + closestOffset;

            // Calculate new duration based on the new width
            // Subtract the buffer we added in getWidth to get the actual duration

            const newDuration = newWidth / uiSettings.timelinePixelsPerSecond;

            // Calculate new counts for the tooltip display
            const newBeats = durationToBeats({
                newDuration,
                allBeats: beats,
                startBeat: resizingPage.current.beats[0],
            });
            const newCounts = newBeats.length;

            // Update the current drag counts for tooltip display
            setCurrentDragCounts((prev) => ({
                ...prev,
                [resizingPage.current!.id]: newCounts,
            }));

            // We can use the deltaX to adjust the next page's width directly

            // Update the visual width immediately for smooth dragging
            const pageElement = document.querySelector(
                `[timeline-page-id="${resizingPage.current.id}"]`,
            );
            if (pageElement instanceof HTMLElement) {
                pageElement.style.width = `${newWidth}px`;
                // Store the new duration as a data attribute for later use
                pageElement.dataset.newDuration = newDuration.toString();
            }

            // Update the next page's width if it exists
            if (nextPage) {
                const nextPageElement = document.querySelector(
                    `[timeline-page-id="${nextPage.id}"]`,
                );
                if (nextPageElement instanceof HTMLElement) {
                    // Calculate the next page's new width
                    // The next page's width should change in the opposite direction
                    const nextPageBuffer =
                        nextPage.beats.length > 0
                            ? nextPage.beats[0].duration
                            : 0;
                    const nextPageOriginalWidth = getWidth(nextPage);
                    const nextPageNewWidth =
                        nextPageOriginalWidth - closestOffset;

                    // Ensure the next page's width doesn't go below minimum
                    const finalNextPageWidth = nextPageNewWidth;

                    // Update the next page's visual width
                    nextPageElement.style.width = `${finalNextPageWidth}px`;

                    // Calculate and store the next page's new duration
                    const nextPageNewDuration =
                        finalNextPageWidth /
                            uiSettings.timelinePixelsPerSecond -
                        nextPageBuffer;
                    nextPageElement.dataset.newDuration =
                        nextPageNewDuration.toString();
                }
            }
        },
        [pages, uiSettings.timelinePixelsPerSecond, beats, getWidth],
    );

    // Function to handle the end of resizing
    const handlePageResizeEnd = useCallback(async () => {
        const pageElement = document.querySelector(
            `[timeline-page-id="${resizingPage.current?.id}"]`,
        );

        if (
            resizingPage.current &&
            resizingPage.current.beats.length > 0 &&
            pageElement instanceof HTMLElement &&
            pageElement.dataset.newDuration
        ) {
            const newDuration = parseFloat(pageElement.dataset.newDuration);

            // Find the next page
            const currentPageIndex = pages.findIndex(
                (page) => page.id === resizingPage.current!.id,
            );
            const nextPageIndex = currentPageIndex + 1;
            const nextPage =
                nextPageIndex < pages.length ? pages[nextPageIndex] : null;

            // Check if the next page was also resized
            let updateArgs: ModifyPagesRequest;
            const newBeats = durationToBeats({
                newDuration,
                allBeats: beats,
                startBeat: resizingPage.current.beats[0],
            });
            updateArgs = updatePageCountRequest({
                pages,
                beats,
                pageToUpdate: resizingPage.current,
                // The last page is a special case and should be adjusted accordingly
                newCounts: newBeats.length - (nextPage ? 0 : 1),
            });

            await updatePages(updateArgs);

            // Clean up the data attribute
            delete pageElement.dataset.newDuration;
        }

        resizingPage.current = null;
        setIsResizing(false);
        setCurrentDragCounts({});
        startX.current = 0;
        startWidth.current = 0;

        // Remove event listeners
        document.removeEventListener("mousemove", handlePageResizeMove);
        document.removeEventListener("mouseup", handlePageResizeEnd);
    }, [handlePageResizeMove, pages, beats, updatePages]);

    // Clean up event listeners when component unmounts
    useEffect(() => {
        return () => {
            document.removeEventListener("mousemove", handlePageResizeMove);
            document.removeEventListener("mouseup", handlePageResizeEnd);
        };
    }, [handlePageResizeEnd, handlePageResizeMove]);

    const nextPageBeatDiff = useCallback(
        (nextPageId: number, currId: number): number => {
            const currPageDrag = currentDragCounts[currId];
            const currPage = pages.find((p) => p.id === currId);
            const nextPage = pages.find((p) => p.id === nextPageId);
            if (!nextPage || !currPage) return 0;
            return nextPage.counts + (currPage.counts - currPageDrag || 0);
        },
        [currentDragCounts, pages],
    );

    const handleDeletePage = useCallback(
        (page: Page) => {
            deletePages(new Set([page.id]), {
                onSuccess: () => {
                    if (page.previousPageId != null)
                        seekTo({ id: page.previousPageId });
                },
            });
        },
        [deletePages, seekTo],
    );
    const handleDeletePageYank = useCallback(
        (page: Page) => {
            deletePageYank(page.id, {
                onSuccess: () => {
                    if (page.previousPageId != null)
                        seekTo({ id: page.previousPageId });
                },
            });
        },
        [deletePageYank, seekTo],
    );
    const handleToggleSubset = useCallback(
        (page: Page) => {
            updatePages({
                modifiedPagesArgs: [{ id: page.id, is_subset: !page.isSubset }],
            });
        },
        [updatePages],
    );
    const clearShapeSelection = useCallback(() => {
        setSelectedShapePageIds([]);
    }, [setSelectedShapePageIds]);

    // Computed once per render rather than once per row (was previously an O(pages²)
    // `pages.findIndex` call repeated inside the `.map` below).
    const selectedIndex = useMemo(
        () => pages.findIndex((p) => p.id === selectedPage?.id),
        [pages, selectedPage?.id],
    );

    return (
        <div className="flex h-fit gap-0" id="pages">
            {/* ------------------------------------ FIRST PAGE ------------------------------------ */}
            <ul className="rounded-6 border-stroke flex h-fit gap-0 overflow-clip border">
                {pages.length > 0 && (
                    <li
                        className={clsx(
                            "rounded-l-6 bg-fg-2 flex h-full w-[40px] items-center justify-center border px-10 py-4 font-mono",
                            !isPlaying && "cursor-pointer",
                            pages[0].id === selectedPage?.id
                                ? [
                                      "border-accent",
                                      isPlaying &&
                                          "text-text/75 pointer-events-none",
                                  ]
                                : [
                                      "border-stroke",
                                      isPlaying &&
                                          "text-text/75 pointer-events-none",
                                  ],
                        )}
                        onClick={() => {
                            seekTo(pages[0]);
                            setSelectedShapePageIds([]);
                        }}
                        title={t("timeline.page.firstPage")}
                        aria-label={t("timeline.page.firstPage")}
                        timeline-page-id={pages[0].id}
                    >
                        <div>{pages[0].name}</div>
                    </li>
                )}
                {/* ------------------------------------ PAGES ------------------------------------ */}
                {pages.map((page, index) => {
                    if (index === 0) return null;
                    const showProgressBar =
                        selectedIndex === index - 1 ||
                        (selectedIndex === 0 && index === pages.length);
                    return (
                        <PageTimelineItem
                            key={page.id}
                            page={page}
                            width={getWidth(page)}
                            isSelected={page.id === selectedPage?.id}
                            isPlaying={isPlaying}
                            isFullscreen={isFullscreen}
                            showProgressBar={showProgressBar}
                            isResizingThis={
                                isResizing &&
                                resizingPage.current?.id === page.id
                            }
                            dragCount={currentDragCounts[page.id]}
                            nextPageCount={
                                page.nextPageId != null
                                    ? nextPageBeatDiff(page.nextPageId, page.id)
                                    : null
                            }
                            t={t}
                            onSelect={seekTo}
                            onClearShapeSelection={clearShapeSelection}
                            onResizeStart={handlePageResizeStart}
                            onToggleSubset={handleToggleSubset}
                            onDeleteYank={handleDeletePageYank}
                            onDelete={handleDeletePage}
                        />
                    );
                })}
            </ul>
            {!isFullscreen && (
                <button
                    className="bg-accent text-sub text-text-invert ml-8 flex size-[28px] cursor-pointer items-center justify-center self-center rounded-full duration-150 ease-out enabled:hover:-translate-y-2 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => createDefaultTempoGroupAndPage()}
                    disabled={!workspaceSettings}
                >
                    <PlusIcon size={20} />
                </button>
            )}
        </div>
    );
}

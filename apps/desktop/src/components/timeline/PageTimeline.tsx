import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
import Page, { updatePageCountRequest } from "@/global/classes/Page";
import clsx from "clsx";
import Beat, { durationToBeats } from "@/global/classes/Beat";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Button, Switch, TooltipClassName } from "@openmarch/ui";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { T, useTolgee } from "@tolgee/react";
import * as ToolTip from "@radix-ui/react-tooltip";
import {
    createLastPageMutationOptions,
    deletePagesMutationOptions,
    ModifyPagesRequest,
    updatePagesMutationOptions,
} from "@/hooks/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const getAvailableOffsets = ({
    currentPage,
    nextPage,
    allBeats,
}: {
    currentPage: Page;
    nextPage: Page | null;
    allBeats: Beat[];
}): number[] => {
    if (!allBeats.length) return [];
    const offsets: number[] = [];

    // Get the current page's total duration
    const currentPageDuration = currentPage.beats.reduce(
        (acc, beat) => acc + beat.duration,
        0,
    );

    // Add all possible negative offsets from the current page
    let runningTime = -currentPageDuration + currentPage.beats[0].duration;
    for (let i = 1; i < currentPage.beats.length; i++) {
        offsets.push(runningTime);
        runningTime += currentPage.beats[i].duration;
    }

    // Add 0 (current position)
    offsets.push(0);

    // If there's a next page, add all possible positive offsets
    if (nextPage) {
        runningTime = 0;
        for (let i = 0; i < nextPage.beats.length - 1; i++) {
            runningTime += nextPage.beats[i].duration;
            offsets.push(runningTime);
        }
    } else {
        // If there's no next page, use all of the following beats
        runningTime = 0;
        const lastBeat = currentPage.beats[currentPage.beats.length - 1];
        for (const beat of allBeats) {
            if (beat.position <= lastBeat.position) continue;
            runningTime += beat.duration;
            offsets.push(runningTime);
        }
    }

    // Remove -0 if it exists
    return offsets.map((offset) => (Object.is(offset, -0) ? 0 : offset));
};

export default function PageTimeline() {
    const queryClient = useQueryClient();
    const { uiSettings } = useUiSettingsStore();
    const { isPlaying } = useIsPlaying()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { setSelectedMarcherShapes } = useShapePageStore()!;
    const { isFullscreen } = useFullscreenStore();
    const { pages, beats } = useTimingObjects()!;
    const { mutate: updatePages } = useMutation(
        updatePagesMutationOptions(queryClient),
    );
    const { mutate: createLastPage } = useMutation(
        createLastPageMutationOptions(queryClient),
    );
    const { mutate: deletePages } = useMutation(
        deletePagesMutationOptions(queryClient),
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
    const handlePageResizeStart = (e: MouseEvent, page: Page) => {
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
    };

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

            // Log the update args
            console.log("update args", updateArgs);

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

    function nextPageBeatDiff(nextPageId: number, currId: number): number {
        const currPageDrag = currentDragCounts[currId];
        const currPage = pages.find((p) => p.id === currId);
        const nextPage = pages.find((p) => p.id === nextPageId);
        if (!nextPage || !currPage) return 0;
        return nextPage.counts + (currPage.counts - currPageDrag || 0);
    }

    return (
        <div className="flex h-fit gap-0" id="pages">
            {/* ------------------------------------ FIRST PAGE ------------------------------------ */}
            {pages.length > 0 && (
                <div
                    className={clsx(
                        "rounded-6 bg-fg-2 flex h-full w-[40px] items-center justify-center border px-10 py-4 font-mono",
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
                        setSelectedPage(pages[0]);
                        setSelectedMarcherShapes([]);
                    }}
                    title={t("timeline.page.firstPage")}
                    aria-label={t("timeline.page.firstPage")}
                    timeline-page-id={pages[0].id}
                >
                    <div>{pages[0].name}</div>
                </div>
            )}
            {/* ------------------------------------ PAGES ------------------------------------ */}
            {pages.map((page, index) => {
                if (index === 0) return null;
                const width = getWidth(page);
                const selectedIndex = pages.findIndex(
                    (p) => p.id === selectedPage?.id,
                );
                return (
                    <ContextMenu.Root
                        key={index}
                        aria-label={t("timeline.page.label", {
                            pageName: page.name,
                        })}
                    >
                        <ContextMenu.Trigger
                            disabled={isPlaying || isFullscreen}
                        >
                            <div
                                className="relative h-full overflow-clip"
                                timeline-page-id={page.id}
                                style={{ width: `${width}px` }}
                            >
                                <div
                                    className={clsx(
                                        "rounded-6 bg-fg-2 text-body text-text relative ml-6 flex h-full items-center justify-end overflow-clip border px-8 py-4 font-mono",
                                        !isPlaying && "cursor-pointer",
                                        page.id === selectedPage?.id
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
                                        if (!isPlaying) setSelectedPage(page);
                                        setSelectedMarcherShapes([]);
                                    }}
                                >
                                    <div className="rig static z-10">
                                        {page.name}
                                    </div>
                                    {/* ------ progress bar (fullscreen) ------ */}
                                    {(selectedIndex === index - 1 ||
                                        (selectedIndex === 0 &&
                                            index === pages.length)) &&
                                        isPlaying && (
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
                                        key={`tooltip-${page.id}-${isResizing && resizingPage.current?.id === page.id ? "resizing" : "normal"}`}
                                        open={
                                            isResizing &&
                                            resizingPage.current?.id === page.id
                                                ? true
                                                : undefined
                                        }
                                        delayDuration={100}
                                    >
                                        <ToolTip.Trigger asChild>
                                            <div
                                                className={clsx(
                                                    "rounded-r-6 absolute top-0 right-0 z-20 h-full w-3 cursor-ew-resize transition-colors",
                                                    resizingPage.current?.id ===
                                                        page.id
                                                        ? "bg-accent/50"
                                                        : "hover:bg-accent/30 bg-transparent",
                                                )}
                                                hidden={isPlaying}
                                                onMouseDown={(e) =>
                                                    handlePageResizeStart(
                                                        e.nativeEvent,
                                                        page,
                                                    )
                                                }
                                            >
                                                &nbsp;
                                            </div>
                                        </ToolTip.Trigger>
                                        <ToolTip.Portal>
                                            <ToolTip.Content
                                                className={TooltipClassName}
                                            >
                                                {(resizingPage.current?.id ===
                                                    page.id &&
                                                    currentDragCounts[
                                                        page.id
                                                    ]) ||
                                                    page.counts}{" "}
                                                {/* calculates the next page count based on the difference */}
                                                {page.nextPageId &&
                                                    `| ${nextPageBeatDiff(
                                                        page.nextPageId,
                                                        page.id,
                                                    )}`}
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
                                        onClick={(e) => {
                                            updatePages({
                                                modifiedPagesArgs: [
                                                    {
                                                        id: page.id,
                                                        is_subset:
                                                            !page.isSubset,
                                                    },
                                                ],
                                            });
                                        }}
                                        checked={page?.isSubset || false}
                                    />
                                </div>
                                <div className="flex w-full items-center justify-between gap-8">
                                    <label className="text-body text-text-subtitle">
                                        <T keyName="timeline.page.contextMenu.deletePage" />
                                    </label>
                                    <Button
                                        onClick={() =>
                                            deletePages(new Set([page.id]))
                                        }
                                        size="compact"
                                        variant="red"
                                        content="icon"
                                    >
                                        <TrashIcon size={20} />
                                    </Button>
                                </div>
                            </ContextMenu.Content>
                        </ContextMenu.Portal>
                    </ContextMenu.Root>
                );
            })}
            {!isFullscreen && (
                <button
                    className="bg-accent text-sub text-text-invert ml-8 flex size-[28px] cursor-pointer items-center justify-center self-center rounded-full duration-150 ease-out hover:-translate-y-2"
                    onClick={() => createLastPage(8)}
                >
                    <PlusIcon size={20} />
                </button>
            )}
        </div>
    );
}

import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { useCallback, useEffect, useRef } from "react";
import { Plus, Minus } from "@phosphor-icons/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import AudioPlayer from "./AudioPlayer";
import Page, { createLastPage } from "@/global/classes/Page";
import clsx from "clsx";
import Beat from "@/global/classes/Beat";

export const getAvailableOffsets = ({
    currentPage,
    nextPage,
}: {
    currentPage: Page;
    nextPage: Page | null;
    allBeats: Beat[];
}): number[] => {
    const offsets: number[] = [];

    // Get the current page's total duration
    const currentPageDuration = currentPage.beats.reduce(
        (acc, beat) => acc + beat.duration,
        0,
    );

    // Add all possible negative offsets from the current page
    let runningTime = -currentPageDuration;
    for (let i = 0; i < currentPage.beats.length; i++) {
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
    }

    // Remove -0 if it exists
    return offsets.map((offset) => (Object.is(offset, -0) ? 0 : offset));
};

export function PageTimeline() {
    const { uiSettings } = useUiSettingsStore();
    const { isPlaying } = useIsPlaying()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { setSelectedMarcherShapes } = useShapePageStore()!;

    const { pages, beats, fetchTimingObjects } = useTimingObjectsStore()!;
    // Page clicking and dragging
    const resizingPage = useRef<Page | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);
    const availableOffsets = useRef<number[]>([]);

    // Calculate the width of a page based on its duration
    // Add a small buffer to ensure the page visually includes all its beats
    const getWidth = useCallback(
        (page: Page) => {
            // Use the page's duration to calculate the width
            // Add a small buffer (equivalent to 1 beat) to ensure all beats are visually included
            const buffer =
                page.beats.length > 0 && page.order === 1
                    ? page.beats[0].duration
                    : 0;
            return (
                (page.duration + buffer) * uiSettings.timelinePixelsPerSecond
            );
        },
        [uiSettings.timelinePixelsPerSecond],
    );

    // Function to handle the start of resizing
    const handlePageResizeStart = (e: MouseEvent, page: Page) => {
        if (isPlaying) return; // Don't allow resizing during playback

        e.preventDefault();
        e.stopPropagation(); // Prevent triggering page selection

        resizingPage.current = page;
        startX.current = e.clientX;
        startWidth.current = getWidth(page);
        availableOffsets.current = getAvailableOffsets({
            currentPage: page,
            nextPage: pages[pages.indexOf(page) + 1] || null,
            allBeats: beats,
        }).map((offset) => offset * uiSettings.timelinePixelsPerSecond);
        console.log(availableOffsets.current);

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
            const newWidth = startWidth.current + closestOffset; // Minimum width of 100px

            // Calculate new duration based on the new width
            // Subtract the buffer we added in getWidth to get the actual duration
            const buffer =
                resizingPage.current.beats.length > 0 &&
                resizingPage.current.order === 1
                    ? resizingPage.current.beats[0].duration
                    : 0;
            const newDuration =
                newWidth / uiSettings.timelinePixelsPerSecond - buffer;

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
        [uiSettings.timelinePixelsPerSecond, pages, getWidth],
    );

    // Function to update page duration in the database
    const updatePageDuration = useCallback(
        async (
            pageId: number,
            newDuration: number,
            nextPageId?: number,
            nextPageNewDuration?: number,
        ) => {
            // Get the latest pages and beats from the store
            const { pages, beats } = useTimingObjectsStore.getState();

            // Find the current page and the next page
            const currentPageIndex = pages.findIndex(
                (page) => page.id === pageId,
            );
            if (currentPageIndex === -1) return;

            const currentPage = pages[currentPageIndex];
            const nextPageIndex = currentPageIndex + 1;

            // If there's no next page, we can't adjust the duration
            if (nextPageIndex >= pages.length) return;

            const nextPage = pages[nextPageIndex];

            // Calculate how many beats to include in the current page based on the new duration
            let cumulativeDuration = 0;
            let targetBeatIndex = -1;

            // Find all beats in the show
            const allBeats = [...beats].sort((a, b) => a.position - b.position);

            // Find the index of the first beat of the current page
            const currentPageStartBeatIndex = allBeats.findIndex(
                (beat) => beat.id === currentPage.beats[0].id,
            );

            // Calculate how many beats should be included to match the new duration
            for (let i = currentPageStartBeatIndex; i < allBeats.length; i++) {
                cumulativeDuration += allBeats[i].duration;
                if (
                    cumulativeDuration >= newDuration ||
                    i === allBeats.length - 1
                ) {
                    targetBeatIndex = i; // The last beat we want to include in the current page
                    break;
                }
            }

            // If we couldn't find a suitable beat, don't update
            if (targetBeatIndex === -1 || targetBeatIndex >= allBeats.length)
                return;

            // Get the beat ID that should be the start of the next page
            // We need the beat after the last one we included in the current page
            const nextBeatIndex = targetBeatIndex + 1;

            // If there's no next beat, don't update
            if (nextBeatIndex >= allBeats.length) return;

            const newNextPageStartBeatId = allBeats[nextBeatIndex].id;

            // Update the next page's start beat
            try {
                // If we have a specific next page ID and duration, we're updating both pages
                // This happens when the user drags a page and we need to update both the current
                // and next page durations
                if (
                    nextPageId !== undefined &&
                    nextPageNewDuration !== undefined
                ) {
                    // Verify the next page ID matches what we expect
                    if (nextPageId !== nextPage.id) {
                        console.error(
                            "Next page ID mismatch",
                            nextPageId,
                            nextPage.id,
                        );
                        return;
                    }

                    // Update the next page's start beat
                    await window.electron.updatePages([
                        {
                            id: nextPage.id,
                            start_beat: newNextPageStartBeatId,
                        },
                    ]);
                } else {
                    // Standard single page update
                    await window.electron.updatePages([
                        {
                            id: nextPage.id,
                            start_beat: newNextPageStartBeatId,
                        },
                    ]);
                }

                // Refresh the timing objects to update everything
                await fetchTimingObjects();
            } catch (error) {
                console.error("Failed to update page duration:", error);
            }
        },
        [fetchTimingObjects],
    );

    // Function to handle the end of resizing
    const handlePageResizeEnd = useCallback(() => {
        const pageElement = document.querySelector(
            `[timeline-page-id="${resizingPage.current?.id}"]`,
        );

        if (
            resizingPage.current &&
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
            if (nextPage) {
                const nextPageElement = document.querySelector(
                    `[timeline-page-id="${nextPage.id}"]`,
                );

                if (
                    nextPageElement instanceof HTMLElement &&
                    nextPageElement.dataset.newDuration
                ) {
                    const nextPageNewDuration = parseFloat(
                        nextPageElement.dataset.newDuration,
                    );

                    // Update both pages in the database
                    updatePageDuration(
                        resizingPage.current.id,
                        newDuration,
                        nextPage.id,
                        nextPageNewDuration,
                    );

                    // Clean up the data attributes
                    delete nextPageElement.dataset.newDuration;
                } else {
                    // Only update the current page
                    updatePageDuration(resizingPage.current.id, newDuration);
                }
            } else {
                // Only update the current page
                updatePageDuration(resizingPage.current.id, newDuration);
            }

            // Clean up the data attribute
            delete pageElement.dataset.newDuration;
        }

        resizingPage.current = null;
        startX.current = 0;
        startWidth.current = 0;

        // Remove event listeners
        document.removeEventListener("mousemove", handlePageResizeMove);
        document.removeEventListener("mouseup", handlePageResizeEnd);
    }, [handlePageResizeMove, updatePageDuration, pages]);

    // Clean up event listeners when component unmounts
    useEffect(() => {
        return () => {
            document.removeEventListener("mousemove", handlePageResizeMove);
            document.removeEventListener("mouseup", handlePageResizeEnd);
        };
    }, [handlePageResizeEnd, handlePageResizeMove]);

    return (
        <div className="flex gap-0" id="pages">
            {/* ------ FIRST PAGE ------ */}
            {pages.length > 0 && (
                <div
                    className={`flex h-full w-[25px] items-center justify-center rounded-6 border bg-fg-2 px-10 py-4 ${
                        !isPlaying && "cursor-pointer"
                    } ${
                        pages[0].id === selectedPage?.id
                            ? // if the page is selected
                              `border-accent ${
                                  isPlaying
                                      ? "pointer-events-none text-text/75"
                                      : ""
                              }`
                            : `border-stroke ${
                                  isPlaying
                                      ? "pointer-events-none text-text/75"
                                      : ""
                              }`
                    }`}
                    onClick={() => {
                        setSelectedPage(pages[0]);
                        setSelectedMarcherShapes([]);
                    }}
                    title="First page"
                    aria-label="First page"
                >
                    <div>{pages[0].name}</div>
                </div>
            )}
            {pages.map((page, index) => {
                if (index === 0) return null;
                const width = getWidth(page);
                const selectedIndex = pages.findIndex(
                    (p) => p.id === selectedPage?.id,
                );
                return (
                    <div
                        key={index}
                        className="relative inline-block"
                        timeline-page-id={page.id}
                        style={{ width: `${width}px` }}
                        title={`Page ${page.name}`}
                        aria-label={`Page ${page.name}`}
                    >
                        {/* ------ PAGES ------ */}
                        <div
                            className={`relative ml-6 flex h-full items-center justify-end overflow-clip rounded-6 border bg-fg-2 px-8 py-4 text-body text-text ${
                                !isPlaying && "cursor-pointer"
                            } ${
                                page.id === selectedPage?.id
                                    ? // if the page is selected
                                      `border-accent ${
                                          isPlaying
                                              ? "pointer-events-none text-text/75"
                                              : ""
                                      }`
                                    : `border-stroke ${
                                          isPlaying
                                              ? "pointer-events-none text-text/75"
                                              : ""
                                      }`
                            }`}
                            onClick={() => {
                                if (!isPlaying) setSelectedPage(page);
                                setSelectedMarcherShapes([]);
                            }}
                        >
                            <div className="rig static z-10">{page.name}</div>
                            {(selectedIndex === index - 1 ||
                                (selectedIndex === 0 &&
                                    index === pages.length)) &&
                                isPlaying && (
                                    <div
                                        className="absolute left-0 top-0 z-0 h-full w-full bg-accent/25"
                                        style={{
                                            animation: `progress ${page.duration}s linear forwards`,
                                        }}
                                    />
                                )}
                        </div>
                        <div
                            className={clsx(
                                "w-3 rounded absolute right-0 top-0 z-20 h-full cursor-ew-resize transition-colors",
                                resizingPage.current?.id === page.id
                                    ? "bg-accent/50"
                                    : "bg-transparent hover:bg-accent/30",
                            )}
                            onMouseDown={(e) =>
                                handlePageResizeStart(e.nativeEvent, page)
                            }
                        >
                            &nbsp;
                        </div>
                    </div>
                );
            })}
            <div
                className="ml-8 flex h-24 w-24 cursor-pointer items-center justify-center self-center rounded-full bg-accent text-sub text-text-invert"
                onClick={() =>
                    createLastPage({
                        currentLastPage: pages[pages.length - 1],
                        allBeats: beats,
                        counts: 8,
                        fetchPagesFunction: fetchTimingObjects,
                    })
                }
            >
                <Plus />
            </div>
        </div>
    );
}

export default function TimelineContainer() {
    const { isPlaying } = useIsPlaying()!;
    const { measures } = useTimingObjectsStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { uiSettings, setPixelsPerSecond } = useUiSettingsStore();
    const timelineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectedPage) return;

        const container = timelineRef.current;
        const selectedPageElement = document.querySelector(
            `[data-page-id="${selectedPage.id}"]`,
        );

        if (!container || !selectedPageElement) return;

        if (isPlaying) {
            // During playback: Linear scroll animation
            container.style.scrollBehavior = "auto";
            const containerRect = container.getBoundingClientRect();
            const elementRect = selectedPageElement.getBoundingClientRect();

            const targetScroll =
                elementRect.left +
                container.scrollLeft -
                containerRect.left -
                (containerRect.width - elementRect.width) / 2;

            container.style.transition = `scroll-left ${selectedPage.duration}s linear`;
            container.scrollLeft = targetScroll;
        } else {
            // Manual selection: Smooth scroll
            container.style.scrollBehavior = "smooth";
            selectedPageElement.scrollIntoView({
                block: "nearest",
                inline: "center",
            });
        }

        return () => {
            container.style.scrollBehavior = "smooth";
            container.style.transition = "";
        };
    }, [selectedPage, isPlaying]);

    // Rerender the timeline when the measures or pages change
    useEffect(() => {
        // do nothing, just re-render
    }, [measures]);

    return (
        <div
            ref={timelineRef}
            id="timeline"
            className={
                (uiSettings.showWaveform ? "min-h-[10rem]" : "min-h-[8rem]") +
                " relative flex w-full min-w-0 rounded-6 border border-stroke bg-fg-1 p-8"
            }
        >
            <div
                className="fixed bottom-0 right-0 m-16 flex gap-6 drop-shadow-md"
                id="zoomIcons"
            >
                <button
                    className="m-4 text-text outline-none duration-150 ease-out focus-visible:-translate-y-4 active:hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() =>
                        setPixelsPerSecond(
                            uiSettings.timelinePixelsPerSecond * 0.8,
                        )
                    }
                    disabled={uiSettings.timelinePixelsPerSecond <= 25}
                >
                    <Minus size={16} />
                </button>
                <button
                    className="m-4 text-text outline-none duration-150 ease-out focus-visible:-translate-y-4 active:hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() =>
                        setPixelsPerSecond(
                            uiSettings.timelinePixelsPerSecond * 1.2,
                        )
                    }
                    disabled={uiSettings.timelinePixelsPerSecond >= 100}
                >
                    <Plus size={16} />
                </button>
            </div>
            <div className="grid grid-cols-[4em_1fr] grid-rows-[2em_90px] gap-6 overflow-x-auto overflow-y-hidden">
                <div className="flex h-[2em] items-center">
                    <p className="text-sub leading-none">Pages</p>
                </div>

                <PageTimeline />
                <div
                    className={
                        (uiSettings.showWaveform ? "" : "hidden") +
                        " flex h-[30px] items-center"
                    }
                >
                    <p className="text-sub leading-none">Audio</p>
                </div>
                <div
                    className={
                        (uiSettings.showWaveform ? "" : "hidden") + " h-[30px]"
                    }
                >
                    <AudioPlayer />
                </div>
            </div>
        </div>
    );
}

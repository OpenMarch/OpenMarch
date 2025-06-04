import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { useCallback, useEffect, useRef } from "react";
import { XIcon, PlusIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import AudioPlayer from "./AudioPlayer";
import Page, {
    createLastPage,
    ModifyPagesRequest,
    updatePageCountRequest,
    updatePages,
    deletePages,
} from "@/global/classes/Page";
import clsx from "clsx";
import Beat, { durationToBeats } from "@/global/classes/Beat";
import RegisteredActionButton from "../RegisteredActionButton";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import EditableAudioPlayer from "./EditableAudioPlayer";
import MusicModal from "../music/MusicModal";
import TimelineControls from "./TimelineControls";
<<<<<<< HEAD
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Button } from "@openmarch/ui";
import { toast } from "sonner";
=======
>>>>>>> 7dbba7f (move timeline controls, polishes)

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

    // Function to handle the end of resizing
    const handlePageResizeEnd = useCallback(() => {
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

            updatePages(updateArgs, fetchTimingObjects);

            // Clean up the data attribute
            delete pageElement.dataset.newDuration;
        }

        resizingPage.current = null;
        startX.current = 0;
        startWidth.current = 0;

        // Remove event listeners
        document.removeEventListener("mousemove", handlePageResizeMove);
        document.removeEventListener("mouseup", handlePageResizeEnd);
    }, [handlePageResizeMove, pages, beats, fetchTimingObjects]);

    // Clean up event listeners when component unmounts
    useEffect(() => {
        return () => {
            document.removeEventListener("mousemove", handlePageResizeMove);
            document.removeEventListener("mouseup", handlePageResizeEnd);
        };
    }, [handlePageResizeEnd, handlePageResizeMove]);

    async function handleDeletePage(pageId: number, pageName: string) {
        const response = await deletePages(
            new Set([pageId]),
            fetchTimingObjects,
        );
        if (response.success) {
            toast.success(`Page ${pageName} deleted`);
        } else {
            toast.error("Failed to delete page");
        }
    }

    return (
        <div className="flex h-fit gap-0" id="pages">
            {/* ------ FIRST PAGE ------ */}
            {pages.length > 0 && (
                <div
                    className={`rounded-l-6 bg-fg-2 flex h-full w-[40px] items-center justify-center border px-10 py-4 ${
                        !isPlaying && "cursor-pointer"
                    } ${
                        pages[0].id === selectedPage?.id
                            ? // if the page is selected
                              `border-accent ${
                                  isPlaying
                                      ? "text-text/75 pointer-events-none"
                                      : ""
                              }`
                            : `border-stroke ${
                                  isPlaying
                                      ? "text-text/75 pointer-events-none"
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
                    <ContextMenu.Root
                        key={index}
                        timeline-page-id={page.id}
                        aria-label={`Page ${page.name}`}
                    >
                        <ContextMenu.Trigger>
                            <div
                                className="relative h-full"
                                style={{ width: `${width}px` }}
                            >
                                {/* ------ PAGES ------ */}
                                <div
                                    className={`first:rounded-l-0 last:rounded-r-6 bg-fg-2 text-body text-text relative flex h-full items-center justify-end overflow-clip border px-8 py-4 ${
                                        !isPlaying && "cursor-pointer"
                                    } ${
                                        page.id === selectedPage?.id
                                            ? // if the page is selected
                                              `border-accent ${
                                                  isPlaying
                                                      ? "text-text/75 pointer-events-none"
                                                      : ""
                                              }`
                                            : `border-stroke ${
                                                  isPlaying
                                                      ? "text-text/75 pointer-events-none"
                                                      : ""
                                              }`
                                    }`}
                                    onClick={() => {
                                        if (!isPlaying) setSelectedPage(page);
                                        setSelectedMarcherShapes([]);
                                    }}
                                >
                                    <div className="rig static z-10">
                                        {page.name}
                                    </div>
                                    {(selectedIndex === index - 1 ||
                                        (selectedIndex === 0 &&
                                            index === pages.length)) &&
                                        isPlaying && (
                                            <div
                                                className={clsx(
                                                    "absolute top-0 left-0 z-0 h-full w-full",
                                                    uiSettings.showWaveform
                                                        ? ""
                                                        : "bg-accent/25",
                                                )}
                                                style={
                                                    uiSettings.showWaveform
                                                        ? {}
                                                        : {
                                                              animation: `progress ${page.duration}s linear forwards`,
                                                          }
                                                }
                                            />
                                        )}
                                </div>
                                <div
                                    className={clsx(
                                        "absolute top-0 right-0 z-20 h-full w-3 cursor-ew-resize transition-colors",
                                        resizingPage.current?.id === page.id
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
                            </div>
                        </ContextMenu.Trigger>
                        <ContextMenu.Portal>
                            <ContextMenu.Content className="bg-modal text-text rounded-6 border-stroke shadow-modal z-50 flex flex-col gap-4 border p-16 py-12 backdrop-blur-md">
                                <h5 className="text-h5">Page {page.name}</h5>
                                <Button
                                    onClick={() =>
                                        handleDeletePage(page.id, page.name)
                                    }
                                    size="compact"
                                    variant="red"
                                >
                                    Delete
                                </Button>
                            </ContextMenu.Content>
                        </ContextMenu.Portal>
                    </ContextMenu.Root>
                );
            })}
            <div
                className={clsx(
                    "bg-accent text-sub text-text-invert ml-8 flex cursor-pointer items-center justify-center self-center rounded-full duration-150 ease-out hover:-translate-y-2",
<<<<<<< HEAD
                    beats.length > 1 ? "size-[28px]" : "h-[28px] px-8 py-4",
=======
                    beats.length > 1 ? "size-[26px]" : "h-[26px] px-8 py-4",
>>>>>>> 7dbba7f (move timeline controls, polishes)
                )}
                onClick={() =>
                    beats.length > 1 &&
                    createLastPage({
                        currentLastPage: pages[pages.length - 1],
                        allBeats: beats,
                        counts: 8,
                        fetchPagesFunction: fetchTimingObjects,
                    })
                }
            >
                {beats.length > 1 ? (
                    <PlusIcon size={20} />
                ) : (
                    <MusicModal label="Add tempo data" />
                )}
            </div>
        </div>
    );
}

export default function TimelineContainer() {
    const { isPlaying } = useIsPlaying()!;
    const { measures } = useTimingObjectsStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { uiSettings } = useUiSettingsStore();
    const timelineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectedPage) return;

        const container = timelineRef.current;
        const selectedPageElement = document.querySelector(
            `[data-timeline-page-id="${selectedPage.id}"]`,
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
        <div className="flex gap-8">
            <TimelineControls />
            <div
                ref={timelineRef}
                id="timeline"
<<<<<<< HEAD
                className="rounded-6 border-stroke bg-fg-1 relative flex h-full min-w-0 overflow-x-auto border p-8 transition-all duration-200"
            >
                <div className="grid h-fit min-h-0 w-full grid-cols-[4em_1fr] grid-rows-2 gap-6 overflow-x-auto overflow-y-hidden">
                    <div className="flex h-[34px] items-center">
                        <p className="text-sub leading-none">Pages</p>
                    </div>
=======
                className={clsx(
                    "rounded-6 border-stroke bg-fg-1 relative flex w-full min-w-0 border p-8 transition-all duration-200",
                    uiSettings.focussedComponent === "timeline"
                        ? "h-[48rem]"
                        : uiSettings.showWaveform
                          ? "h-[8rem]"
                          : "h-[4rem]",
                )}
            >
                <div
                    className="fixed right-0 bottom-0 m-16 flex gap-6 drop-shadow-md"
                    id="zoomIcons"
                >
                    <button
                        className="text-text active:hover:text-accent m-4 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() =>
                            setPixelsPerSecond(
                                uiSettings.timelinePixelsPerSecond * 0.8,
                            )
                        }
                        disabled={uiSettings.timelinePixelsPerSecond <= 10}
                    >
                        <MinusIcon size={16} />
                    </button>
                    <button
                        className="text-text active:hover:text-accent m-4 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() =>
                            setPixelsPerSecond(
                                uiSettings.timelinePixelsPerSecond * 1.2,
                            )
                        }
                        disabled={uiSettings.timelinePixelsPerSecond >= 200}
                    >
                        <PlusIcon size={16} />
                    </button>
                </div>
                <div className="grid grid-cols-[4em_1fr] grid-rows-[2em_90px] gap-6 overflow-x-auto overflow-y-hidden">
                    <div className="flex h-[2em] items-center">
                        <p className="text-sub leading-none">Pages</p>
                    </div>

>>>>>>> 7dbba7f (move timeline controls, polishes)
                    <PageTimeline />
                    <div
                        className={
                            (uiSettings.showWaveform ? "" : "hidden") +
                            " flex h-[30px] items-center justify-between"
                        }
                    >
                        <p className="text-sub leading-none">Audio</p>
                        {uiSettings.showWaveform &&
                        uiSettings.focussedComponent !== "timeline" ? (
                            <RegisteredActionButton
                                registeredAction={
                                    RegisteredActionsObjects.focusTimeline
                                }
                            >
<<<<<<< HEAD
                                <PencilSimpleIcon />
=======
                                <FaEdit />
>>>>>>> 7dbba7f (move timeline controls, polishes)
                            </RegisteredActionButton>
                        ) : (
                            <RegisteredActionButton
                                registeredAction={
                                    RegisteredActionsObjects.focusCanvas
                                }
                            >
                                <XIcon />
                            </RegisteredActionButton>
                        )}
                    </div>
                    {uiSettings.focussedComponent === "timeline" ? (
                        <EditableAudioPlayer timelineRef={timelineRef} />
                    ) : (
                        <div
                            className={uiSettings.showWaveform ? "" : "hidden"}
                        >
                            <AudioPlayer />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

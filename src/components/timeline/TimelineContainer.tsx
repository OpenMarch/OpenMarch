import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useShapePageStore } from "@/stores/ShapePageStore";
import React, { useCallback, useEffect, useRef } from "react";
import { Plus, Minus } from "@phosphor-icons/react";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import Page, { createLastPage } from "@/global/classes/Page";
import clsx from "clsx";

function PageTimeline({
    pxPerSecond,
    isPlaying,
}: {
    pxPerSecond: number;
    isPlaying: boolean;
}) {
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { setSelectedMarcherShapes } = useShapePageStore()!;

    const { pages, beats, fetchTimingObjects } = useTimingObjectsStore()!;
    // Page clicking and dragging
    const resizingPage = React.useRef<Page | null>(null);
    const startX = React.useRef(0);
    const startWidth = React.useRef(0);

    const getWidth = (page: Page) => page.duration * pxPerSecond;

    // Function to handle the start of resizing
    const handlePageResizeStart = (
        e: React.MouseEvent,
        page: Page,
        index: number,
    ) => {
        if (isPlaying) return; // Don't allow resizing during playback

        e.preventDefault();
        e.stopPropagation(); // Prevent triggering page selection

        resizingPage.current = page;
        startX.current = e.clientX;
        startWidth.current = getWidth(page);

        // Add event listeners for mouse move and mouse up
        document.addEventListener("mousemove", handlePageResizeMove);
        document.addEventListener("mouseup", handlePageResizeEnd);
    };

    // Function to handle resizing movement
    const handlePageResizeMove = React.useCallback((e: MouseEvent) => {
        console.log("MOVING");
        if (!resizingPage.current) return;

        const deltaX = e.clientX - startX.current;
        const newWidth = Math.max(100, startWidth.current + deltaX); // Minimum width of 100px

        // // Calculate new duration based on the new width
        // const newDuration = newWidth / pxPerSecond;

        // Update the visual width immediately for smooth dragging
        const pageElement = document.querySelector(
            `[timeline-page-id="${resizingPage.current.id}"]`,
        );
        if (pageElement instanceof HTMLElement) {
            pageElement.style.width = `${newWidth}px`;
        }

        // // Store the updated page for later database update
        // setResizingPage({
        //     ...resizingPage,
        //     duration: newDuration,
        // });
    }, []);

    // Function to handle the end of resizing
    const handlePageResizeEnd = useCallback(() => {
        console.log("RESIZING PAGE END");

        resizingPage.current = null;
        startX.current = 0;
        startWidth.current = 0;

        // if (resizingPage.current) {
        //     try {
        //         // Update the page in the database
        //         // await updatePageDuration(resizingPage.id, resizingPage.duration);

        //         // Refresh the timing objects to update everything
        //         fetchTimingObjects();

        //         // Reset resizing state
        //     } catch (error) {
        //         console.error("Failed to update page duration:", error);
        //     }
        // }
        // Remove event listeners
        document.removeEventListener("mousemove", handlePageResizeMove);
        document.removeEventListener("mouseup", handlePageResizeEnd);
    }, [handlePageResizeMove]);

    // Function to update page duration in the database
    // const updatePageDuration = async (pageId, newDuration) => {
    //     // This function would need to be implemented based on your API
    //     // For example:
    //     // await fetch(`/api/pages/${pageId}`, {
    //     //     method: 'PATCH',
    //     //     headers: { 'Content-Type': 'application/json' },
    //     //     body: JSON.stringify({ duration: newDuration })
    //     // });

    //     // For now, we'll just update the local state
    //     useTimingObjectsStore.getState().updatePage(pageId, newDuration);
    // };

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
                                handlePageResizeStart(e, page, index)
                            }
                        >
                            &nbsp;
                        </div>
                    </div>
                );
            })}
            <div
                className="ml-8 flex h-32 w-32 cursor-pointer items-center justify-center rounded-full bg-accent text-text-invert"
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
    const { measures, beats } = useTimingObjectsStore()!;
    const { selectedPage } = useSelectedPage()!;
    const [pxPerSecond, setPxPerSecond] = React.useState(40); // scale of the timeline
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
    React.useEffect(() => {
        // do nothing, just re-render
    }, [measures]);

    return (
        <div
            ref={timelineRef}
            id="timeline"
            className="relative flex h-[8rem] min-h-[8rem] w-full min-w-0 gap-6 overflow-x-auto overflow-y-hidden rounded-6 border border-stroke bg-fg-1 p-8"
        >
            <div
                className="fixed bottom-0 right-0 m-16 flex gap-6 drop-shadow-md"
                id="zoomIcons"
            >
                <button
                    className="m-4 text-text outline-none duration-150 ease-out focus-visible:-translate-y-4 active:hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setPxPerSecond(pxPerSecond * 0.8)}
                    disabled={pxPerSecond <= 25}
                >
                    <Minus size={16} />
                </button>
                <button
                    className="m-4 text-text outline-none duration-150 ease-out focus-visible:-translate-y-4 active:hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setPxPerSecond(pxPerSecond * 1.2)}
                    disabled={pxPerSecond >= 100}
                >
                    <Plus size={16} />
                </button>
            </div>
            <div id="legend" className="grid grid-rows-3 gap-6">
                <div className="flex h-full items-center">
                    <p className="text-sub leading-none">Pages</p>
                </div>
                <div className="flex h-full items-center">
                    <p className="text-sub leading-none">Measures</p>
                </div>
                <div className="flex h-full items-center">
                    <p className="text-sub leading-none">Beats</p>
                </div>
            </div>
            <div id="timeline" className="grid grid-rows-3 gap-6">
                <PageTimeline pxPerSecond={pxPerSecond} isPlaying={isPlaying} />
                <div
                    className="row-span-1 h-full min-h-0 whitespace-nowrap pl-[31px]"
                    id="counts measures"
                >
                    {measures.map((measure, index) => {
                        const countsToUse = measure.counts;
                        const width = measure.duration * pxPerSecond;
                        const metadata = `m${measure.number} - ${
                            measure.duration
                        } seconds - ${measure.counts} counts - rehearsalMark ${measure.rehearsalMark}`;
                        return (
                            <div
                                key={index}
                                className="inline-block h-full pr-6"
                                style={{ width: `${width}px` }}
                                title={metadata}
                                aria-label={metadata}
                            >
                                <div
                                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize hover:bg-accent/50"
                                    style={{
                                        gridTemplateColumns: "1fr ".repeat(
                                            countsToUse,
                                        ),
                                    }}
                                >
                                    <div className="col-span-full flex h-full items-center justify-start rounded-6 border border-stroke bg-fg-2 px-8 py-4 text-body leading-none">
                                        {measure.number}
                                    </div>
                                    {/* {Array.from(
                                        { length: countsToUse },
                                        (_, i) => (
                                            <div
                                                key={i}
                                                className="col-span-1 h-full w-full select-none self-center rounded-[12px] border-[1.5px] border-text/25"
                                                // style={{ width: `${width / page.counts}` }}
                                            />
                                        ),
                                    )} */}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div
                    className="row-span-1 h-full min-h-0 whitespace-nowrap pl-[31px]"
                    id="counts measures"
                >
                    {beats.slice(1).map((beat, index) => {
                        const width = beat.duration * pxPerSecond;
                        const metadata = `Beat ${beat.id} - ${beat.duration} seconds`;
                        return (
                            <div
                                key={index}
                                className="inline-block h-full pr-6"
                                style={{ width: `${width}px` }}
                                title={metadata}
                                aria-label={metadata}
                            >
                                <div
                                    className="col-span-1 h-full w-full select-none self-center rounded-[12px] border-[1.5px] border-text/25"
                                    // style={{ width: `${width / page.counts}` }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useMeasureStore } from "@/stores/MeasureStore";
import { usePageStore } from "@/stores/PageStore";
import { useShapePageStore } from "@/stores/ShapePageStore";
import React, { useEffect, useRef } from "react";
import { Plus, Minus } from "@phosphor-icons/react";

export default function TimelineContainer() {
    const { isPlaying } = useIsPlaying()!;
    const { measures } = useMeasureStore()!;
    const { pages } = usePageStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { setSelectedMarcherShapes } = useShapePageStore()!;
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
    }, [measures, pages]);

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
                    <p className="text-sub leading-none">Counts</p>
                </div>
            </div>
            <div id="timeline" className="grid grid-rows-3 gap-6">
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
                            <div>1</div>
                        </div>
                    )}
                    {pages.map((page, index) => {
                        if (index === 0) return null;
                        const width = page.duration * pxPerSecond;
                        const selectedIndex = pages.findIndex(
                            (p) => p.id === selectedPage?.id,
                        );
                        return (
                            <div
                                key={index}
                                className="inline-block"
                                data-page-id={page.id}
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
                                    <div className="rig static z-10">
                                        {page.name}
                                    </div>
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
                            </div>
                        );
                    })}
                </div>
                <div
                    className="row-span-2 h-full min-h-0 whitespace-nowrap pl-[31px]"
                    id="counts measures"
                >
                    {measures.map((measure, index) => {
                        const countsToUse = measure.getBigBeats();
                        const width = measure.duration * pxPerSecond;
                        const metadata = `m${measure.number} - ${
                            measure.duration
                        } seconds - ${measure.getBigBeats()} counts - time signature: ${measure.timeSignature.toString()} - tempo: ${
                            measure.tempo
                        }bpm - rehearsalMark ${measure.rehearsalMark}`;
                        return (
                            <div
                                key={index}
                                className="inline-block h-full pr-6"
                                style={{ width: `${width}px` }}
                                title={metadata}
                                aria-label={metadata}
                            >
                                <div
                                    className="grid h-full grid-rows-2 gap-6"
                                    style={{
                                        gridTemplateColumns: "1fr ".repeat(
                                            countsToUse,
                                        ),
                                    }}
                                >
                                    <div className="col-span-full flex h-full items-center justify-start rounded-6 border border-stroke bg-fg-2 px-8 py-4 text-body leading-none">
                                        {measure.number}
                                    </div>
                                    {Array.from(
                                        { length: countsToUse },
                                        (_, i) => (
                                            <div
                                                key={i}
                                                className="col-span-1 h-full w-full select-none self-center rounded-[12px] border-[1.5px] border-text/25"
                                                // style={{ width: `${width / page.counts}` }}
                                            />
                                        ),
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

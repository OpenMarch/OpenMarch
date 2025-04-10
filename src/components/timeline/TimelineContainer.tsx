import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { useEffect, useRef } from "react";
import { Plus, Minus } from "@phosphor-icons/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import AudioPlayer from "./AudioPlayer";

export default function TimelineContainer() {
    const { isPlaying } = useIsPlaying()!;
    const { measures, pages } = useTimingObjectsStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { setSelectedMarcherShapes } = useShapePageStore()!;
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
                <div className="flex h-[2em] gap-0" id="pages">
                    {/* ------ FIRST PAGE ------ */}
                    {pages.length > 0 && (
                        <div
                            className={`flex h-full w-[2em] items-center justify-center rounded-6 border bg-fg-2 px-10 py-4 ${
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
                            <div>0</div>
                        </div>
                    )}
                    {pages.map((page, index) => {
                        if (index === 0) return null;
                        const width =
                            page.duration * uiSettings.timelinePixelsPerSecond;
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
                                                className="absolute left-0 top-0 z-0 h-full w-full"
                                                style={
                                                    !uiSettings.showWaveform
                                                        ? {
                                                              backgroundColor:
                                                                  "rgba(var(--accent), 0.25)",
                                                              animation: `progress ${page.duration}s linear forwards`,
                                                          }
                                                        : {}
                                                }
                                            />
                                        )}
                                </div>
                            </div>
                        );
                    })}
                </div>
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

import { useRef, useEffect, useState } from "react";
import { useUiSettingsStore } from "../../stores/useUiSettingsStore";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherStore } from "@/stores/useMarcherStore";
import { usePageStore } from "@/stores/usePageStore";
import { useMarcherPageStore } from "@/stores/useMarcherPageStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import MarcherPage from "@/global/classes/MarcherPage";
import OpenMarchCanvas from "./OpenMarchCanvas";
import DefaultListeners from "./listeners/DefaultListeners";
import { useCursorModeStore } from "@/stores/useCursorModeStore";
import LineListeners from "./listeners/LineListeners";
import { CanvasColors } from "./CanvasConstants";
import { useMarcherLineStore } from "@/stores/useMarcherLineStore";
import MarcherLine from "@/global/classes/MarcherLine";

/**
 * The field/stage UI of OpenMarch
 *
 * @param className Additional classNames to add to the <div/> containing this canvas
 * @param testCanvas An OpenMarchCanvas object to pass in, rather than this component creating its own. Should only be used for test purposes.
 * @returns
 */
export default function Canvas({
    className = "",
    testCanvas,
}: {
    className?: string;
    testCanvas?: OpenMarchCanvas;
}) {
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const { marchers } = useMarcherStore()!;
    const { pages } = usePageStore()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { fieldProperties } = useFieldProperties()!;
    const { uiSettings } = useUiSettingsStore()!;
    const { cursorMode } = useCursorModeStore()!;
    const { marcherLines } = useMarcherLineStore()!;
    const [canvas, setCanvas] = useState<OpenMarchCanvas>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationCallbacks = useRef<any>([]);
    const timeoutID = useRef<any>(null);

    /* -------------------------- useEffects -------------------------- */
    /* Initialize the canvas */
    useEffect(() => {
        if (canvas || !selectedPage || !fieldProperties) return; // If the canvas is already initialized, or the selected page is not set, return

        if (testCanvas) {
            setCanvas(testCanvas);
        } else {
            setCanvas(
                new OpenMarchCanvas({
                    canvasRef: canvasRef.current,
                    fieldProperties,
                    uiSettings,
                    currentPage: selectedPage,
                })
            );
        }
    }, [selectedPage, fieldProperties, testCanvas, uiSettings, canvas]);

    // Initiate listeners
    useEffect(() => {
        if (canvas) {
            // Initiate listeners
            switch (cursorMode) {
                case "line":
                    canvas.setListeners(new LineListeners({ canvas: canvas }));
                    break;
                default:
                    canvas.setListeners(
                        new DefaultListeners({ canvas: canvas })
                    );
                    break;
            }

            // Cleanup
            return () => {
                canvas.clearListeners();
            };
        }
    }, [canvas, cursorMode]);

    // Set the canvas UI settings to the global UI settings
    useEffect(() => {
        if (canvas) canvas.setUiSettings(uiSettings);
    }, [canvas, uiSettings]);

    // Set the canvas setSelectedMarchers function to the setSelectedMarchers function
    useEffect(() => {
        if (canvas) canvas.setGlobalsSelectedMarchers = setSelectedMarchers;
    }, [canvas, setSelectedMarchers]);

    // Set the canvas globalSelectedMarchers to the selected marchers
    useEffect(() => {
        if (canvas) canvas.globalSelectedMarchers = selectedMarchers;
    }, [canvas, selectedMarchers]);

    // Update/render the marchers when the selected page or the marcher pages change
    useEffect(() => {
        if (canvas && selectedPage && marchers && marcherPages) {
            canvas.currentPage = selectedPage;
            canvas.renderMarchers({
                currentMarcherPages: MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.id
                ),
                allMarchers: marchers,
            });
        }
    }, [canvas, marcherPages, marchers, selectedPage]);

    // Renders pathways when selected page or settings change
    useEffect(() => {
        if (canvas && selectedPage) {
            const prevPage = selectedPage.getPreviousPage(pages);
            const nextPage = selectedPage.getNextPage(pages);

            canvas.removePathways();
            canvas.removeStaticCanvasMarchers();

            // Only find the marcher pages if the settings are enabled. This is to prevent unnecessary calculations
            let selectedPageMarcherPages: MarcherPage[] = [];
            if (uiSettings.previousPaths || uiSettings.nextPaths)
                selectedPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.id
                );

            if (uiSettings.previousPaths && prevPage) {
                const prevPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    prevPage.id
                );

                canvas.renderStaticMarchers({
                    intendedMarcherPages: prevPageMarcherPages,
                    color: CanvasColors.previousPage,
                    allMarchers: marchers,
                });
                canvas.renderPathways({
                    startPageMarcherPages: prevPageMarcherPages,
                    endPageMarcherPages: selectedPageMarcherPages,
                    color: CanvasColors.previousPage,
                });
            }
            if (uiSettings.nextPaths && nextPage) {
                const nextPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    nextPage.id
                );

                canvas.renderStaticMarchers({
                    intendedMarcherPages: nextPageMarcherPages,
                    color: CanvasColors.nextPage,
                    allMarchers: marchers,
                });
                canvas.renderPathways({
                    startPageMarcherPages: selectedPageMarcherPages,
                    endPageMarcherPages: nextPageMarcherPages,
                    color: CanvasColors.nextPage,
                });
            }

            canvas.sendCanvasMarchersToFront();
        }
    }, [
        canvas,
        marcherPages,
        marchers,
        pages,
        selectedPage,
        uiSettings.nextPaths,
        uiSettings.previousPaths,
    ]);

    // Set the active object to the selected marchers when they change outside of user-canvas-interaction
    useEffect(() => {
        if (!(canvas && marchers) || selectedMarchers.length === 0) return;

        const selectedMarcherIds = selectedMarchers.map(
            (marcher) => marcher.id
        );
        const canvasMarchersToSelect = canvas
            .getCanvasMarchers()
            .filter((canvasMarcher) =>
                selectedMarcherIds.includes(canvasMarcher.marcherObj.id)
            );

        canvas.setSelectedCanvasMarchers(canvasMarchersToSelect);
    }, [
        marchers,
        selectedMarchers,
        marcherPages,
        selectedPage,
        canvas,
        setSelectedMarchers,
    ]);

    useEffect(() => {
        if (!canvas || !selectedPage) return;

        const currentPageMarcherLines = MarcherLine.getMarcherLinesForPage({
            marcherLines,
            page: selectedPage,
            allPages: pages,
        });
        canvas.renderMarcherLines({ marcherLines: currentPageMarcherLines });
    }, [canvas, marcherLines, pages, selectedPage]);

    /* --------------------------Animation Functions-------------------------- */

    useEffect(() => {
        if (canvas && selectedPage) {
            if (isPlaying) {
                const nextPage = selectedPage.getNextPage(pages);
                if (!nextPage) return;

                const nextPageMarcherPages = marcherPages.filter(
                    (marcherPage) => marcherPage.page_id === nextPage.id
                );
                canvas.getCanvasMarchers().forEach((canvasMarcher) => {
                    const marcherPageToUse = nextPageMarcherPages.find(
                        (marcherPage) =>
                            marcherPage.marcher_id ===
                                canvasMarcher.marcherObj.id &&
                            marcherPage.page_id === nextPage.id
                    );
                    if (!marcherPageToUse) {
                        console.error(
                            "Marcher page not found - startAnimation: Canvas.tsx",
                            canvasMarcher
                        );
                        return;
                    }

                    const callback = canvasMarcher.setNextAnimation({
                        marcherPage: marcherPageToUse,
                        durationMilliseconds: nextPage.duration * 1000,
                    });
                    animationCallbacks.current.push(callback);
                });

                canvas.requestRenderAll();
                // Set the selected page after the animation is done and set isPlaying to false
                timeoutID.current = setTimeout(() => {
                    const isLastPage = nextPage.getNextPage(pages) === null;
                    setSelectedPage(nextPage);
                    if (isLastPage) setIsPlaying(false);
                }, nextPage.duration * 1000);
            } else {
                animationCallbacks.current.forEach((callback: any) => {
                    // Not sure why these are two functions in Fabric.js
                    (callback[0] as () => void)(); // Stop X animation
                    (callback[1] as () => void)(); // Stop Y animation
                });
                if (timeoutID.current) {
                    clearTimeout(timeoutID.current);
                }

                canvas.renderMarchers({
                    currentMarcherPages: MarcherPage.filterByPageId(
                        marcherPages,
                        selectedPage.id
                    ),
                    allMarchers: marchers,
                });
            }
        }
    }, [
        canvas,
        isPlaying,
        marcherPages,
        marchers,
        pages,
        selectedPage,
        setIsPlaying,
        setSelectedPage,
    ]);

    return (
        <div className={`overflow-hidden ${className}`}>
            {marchers.length > 0 && pages.length > 0 ? (
                <canvas ref={canvasRef} id="fieldCanvas" />
            ) : (
                // If there are no marchers or pages, display a message
                <div className="flex bg-gray-900 text-white h-full w-full align-middle flex-col justify-center text-center">
                    <h3>To start the show, create Marchers and Pages</h3>
                    <p>Then {"`Window -> Refresh` (or `Ctrl+R`)"}</p>
                    <h5>
                        If anything in OpenMarch ever seems broken, a refresh
                        will often fix it.
                    </h5>
                </div>
            )}
        </div>
    );
}

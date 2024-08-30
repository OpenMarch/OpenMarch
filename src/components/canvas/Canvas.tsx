/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useEffect, useCallback } from "react";
import { fabric } from "fabric";
import { useUiSettingsStore } from "../../stores/uiSettings/useUiSettingsStore";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { usePageStore } from "@/stores/page/usePageStore";
import { useMarcherPageStore } from "@/stores/marcherPage/useMarcherPageStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { MarcherPage } from "@/global/classes/MarcherPage";
import CanvasMarcher from "@/components/canvas/CanvasMarcher";
import OpenMarchCanvas, {
    ActiveObjectArgs,
    CanvasColors,
} from "./OpenMarchCanvas";
import DefaultListeners from "./listeners/DefaultListeners";
import Marcher from "@/global/classes/Marcher";

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
    const canvas = useRef<OpenMarchCanvas>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationCallbacks = useRef<any>([]);
    const timeoutID = useRef<any>(null);
    const dragStart = useRef<{ x: number; y: number; time: number }>({
        x: 0,
        y: 0,
        time: Date.now(),
    });
    // Not a real lock, just a way to prevent infinite loops
    const handleSelectLock = useRef<boolean>(false);

    /* -------------------------- Marcher Functions-------------------------- */

    const setSelectedCanvasMarchers = (
        newSelectedCanvasMarchers: CanvasMarcher[],
        setSelectedMarchers: (marchers: Marcher[]) => void
    ) => {
        if (!canvas.current) return;
        if (newSelectedCanvasMarchers.length > 1) {
            // The current active object needs to be discarded before creating a new active selection
            // This is due to buggy behavior in Fabric.js
            (canvas.current as fabric.Canvas).discardActiveObject();

            const activeSelection = new fabric.ActiveSelection(
                newSelectedCanvasMarchers,
                {
                    canvas: canvas.current,
                    ...ActiveObjectArgs,
                }
            );

            (canvas.current as fabric.Canvas).setActiveObject(activeSelection);
            canvas.current.requestRenderAll();
        }

        const activeObject = canvas.current.getActiveObject();
        if (activeObject) {
            activeObject.lockMovementX = uiSettings.lockX;
            activeObject.lockMovementY = uiSettings.lockY;
        }

        const newSelectedMarchers = newSelectedCanvasMarchers.map(
            (canvasMarcher) => canvasMarcher.marcherObj
        );
        setSelectedMarchers(newSelectedMarchers);
    };

    /* -------------------------- Listener Functions -------------------------- */
    /**
     * Set the selected marcher(s) when selected element changes
     */
    const handleSelect = useCallback(
        (e: { selected: any[] }) => {
            // // Ensure that the handleSelect function is not called while the lockHandelSelect is true. Prevents infinite loop
            // // This semaphore is resolved in a useEffect that sets the active object to the selected marchers
            if (handleSelectLock.current) return;

            // // When multiple marchers are selected, mark as them as the active object
            // // This is how the view of the most current active marcher is maintained
            handleSelectLock.current = true;
            setSelectedCanvasMarchers(e.selected, setSelectedMarchers);
            // if (e.selected.length > 1) {
            //     // The current active object needs to be discarded before creating a new active selection
            //     // This is due to buggy behavior in Fabric.js
            //     (canvas.current as fabric.Canvas).discardActiveObject();
            //     const selectedCanvasMarchers: CanvasMarcher[] =
            //         e.selected.filter(
            //             (canvasObject: CanvasMarcher) =>
            //                 canvasObject instanceof CanvasMarcher
            //         );

            //     const activeSelection = new fabric.ActiveSelection(
            //         selectedCanvasMarchers,
            //         {
            //             canvas: canvas.current,
            //             ...ActiveObjectArgs,
            //         }
            //     );

            //     (canvas.current as fabric.Canvas).setActiveObject(
            //         activeSelection
            //     );
            //     canvas.current.requestRenderAll();
            // }

            // const activeObject = canvas.current.getActiveObject();
            // if (activeObject) {
            //     activeObject.lockMovementX = uiSettings.lockX;
            //     activeObject.lockMovementY = uiSettings.lockY;
            // }

            // const activeObjectMarcherIds = canvas.current
            //     .getActiveObjects()
            //     .map((activeObject: any) =>
            //         activeObject instanceof CanvasMarcher
            //             ? activeObject.marcherObj.id
            //             : null
            //     );
            // const newSelectedMarchers = marchers.filter((marcher) =>
            //     activeObjectMarcherIds.includes(marcher.id)
            // );
            // setSelectedMarchers(newSelectedMarchers);
        },
        [setSelectedCanvasMarchers, setSelectedMarchers]
    );

    /**
     * Deselect the marcher when the selection is cleared
     */
    const handleDeselect = useCallback(
        (e: any) => {
            if (e.deselected) {
                setSelectedMarchers([]);
            }
        },
        [setSelectedMarchers]
    );

    /**
     * Set the canvas to dragging mode on mousedown.
     */
    const handleMouseDown = (opt: any) => {
        if (!canvas.current) return;
        const evt = opt.e;
        // opt.target checks if the mouse is on the canvas at all
        // Don't move the canvas if the mouse is on a marcher
        const isMarcherSelection =
            opt.target &&
            (opt.target instanceof CanvasMarcher ||
                // If the target is a group of marchers (currently only checked if any of the objects are marchers)
                // Will not work when selecting multiple items that aren't marchers
                opt.target._objects?.some(
                    (obj: any) => obj instanceof CanvasMarcher
                ));
        if (isMarcherSelection) {
            dragStart.current = {
                x: evt.clientX,
                y: evt.clientY,
                time: Date.now(),
            };
        } else if (!evt.shiftKey) {
            // If no marcher is selected and the shift key is not pressed, move the canvas with the mouse
            canvas.current.isDragging = true;
            canvas.current.selection = false;
            canvas.current.panDragStartPos = { x: evt.clientX, y: evt.clientY };
        }
    };

    /**
     * Move the canvas on mousemove when in dragging mode
     */
    const handleMouseMove = (opt: any) => {
        if (!canvas.current) return;
        if (canvas.current.isDragging) {
            const e = opt.e;
            const vpt = canvas.current.viewportTransform;
            if (!vpt) {
                console.error(
                    "Viewport transform not set - handleMouseMove: Canvas.tsx"
                );
                return;
            }
            vpt[4] += e.clientX - canvas.current.panDragStartPos.x;
            vpt[5] += e.clientY - canvas.current.panDragStartPos.y;
            canvas.current.requestRenderAll();
            canvas.current.panDragStartPos = { x: e.clientX, y: e.clientY };
        }
    };

    /**
     * Handler for the mouse up event
     * Disables dragging and re-enables selection
     *
     * If the mouse was only clicked and not dragged, select the marcher and do not move it
     */
    const handleMouseUp = (opt: any) => {
        if (!canvas.current) return;
        // on mouse up we want to recalculate new interaction
        // for all objects, so we call setViewportTransform
        canvas.current.setViewportTransform(canvas.current.viewportTransform);
        canvas.current.isDragging = false;
        canvas.current.selection = true;
    };

    const initiateListeners = useCallback(() => {
        if (!canvas.current) return;
        // canvas.current.on("object:modified", handleObjectModified);
        canvas.current.setListeners(
            new DefaultListeners({ canvas: canvas.current })
        );
        canvas.current.on("selection:updated", handleSelect);
        canvas.current.on("selection:created", handleSelect);
        canvas.current.on("selection:cleared", handleDeselect);

        canvas.current.on("mouse:down", handleMouseDown);
        canvas.current.on("mouse:move", handleMouseMove);
        canvas.current.on("mouse:up", handleMouseUp);
    }, [handleSelect, handleDeselect]);

    const cleanupListeners = useCallback(() => {
        if (!canvas.current) return;
        // canvas.current.off("object:modified");
        canvas.current.off("selection:updated");
        canvas.current.off("selection:created");
        canvas.current.off("selection:cleared");

        canvas.current.off("mouse:down");
        canvas.current.off("mouse:move");
        canvas.current.off("mouse:up");
    }, []);

    /* -------------------------- useEffects -------------------------- */
    /* Initialize the canvas */
    useEffect(() => {
        if (canvas.current || !selectedPage || !fieldProperties) return; // If the canvas is already initialized, or the selected page is not set, return

        if (testCanvas) {
            canvas.current = testCanvas;
        } else {
            canvas.current = new OpenMarchCanvas(
                canvasRef.current,
                fieldProperties,
                uiSettings
            );
        }
    }, [selectedPage, fieldProperties, testCanvas, uiSettings]);

    // Initiate listeners
    useEffect(() => {
        if (canvas.current) {
            // Initiate listeners
            initiateListeners();

            // Cleanup
            return () => {
                cleanupListeners();
            };
        }
    }, [initiateListeners, cleanupListeners]);

    // Update/render the marchers when the selected page or the marcher pages change
    useEffect(() => {
        if (canvas.current && selectedPage && marchers && marcherPages) {
            canvas.current.renderMarchers({
                selectedMarcherPages: MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.id
                ),
                allMarchers: marchers,
            });
        }
    }, [marcherPages, marchers, selectedPage]);

    // Renders pathways when selected page or settings change
    useEffect(() => {
        if (canvas.current && selectedPage) {
            const prevPage = selectedPage.getPreviousPage(pages);
            const nextPage = selectedPage.getNextPage(pages);

            canvas.current.removePathways();
            canvas.current.removeStaticCanvasMarchers();

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

                canvas.current.renderStaticMarchers({
                    intendedMarcherPages: prevPageMarcherPages,
                    color: CanvasColors.previousPage,
                    allMarchers: marchers,
                });
                canvas.current.renderPathways({
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

                canvas.current.renderStaticMarchers({
                    intendedMarcherPages: nextPageMarcherPages,
                    color: CanvasColors.nextPage,
                    allMarchers: marchers,
                });
                canvas.current.renderPathways({
                    startPageMarcherPages: selectedPageMarcherPages,
                    endPageMarcherPages: nextPageMarcherPages,
                    color: CanvasColors.nextPage,
                });
            }

            canvas.current.sendCanvasMarchersToFront();
        }
    }, [
        marcherPages,
        marchers,
        pages,
        selectedPage,
        uiSettings.nextPaths,
        uiSettings.previousPaths,
    ]);

    // Set the active object to the selected marchers when they change outside of user-canvas-interaction
    useEffect(() => {
        if (!(canvas.current && marchers) || selectedMarchers.length === 0)
            return;
        /**
         * The handleSelectLock is used to prevent this effect from triggering when the user clicks on a marcher
         *
         * This Effect changes the active object to the selected marchers when they change outside of the canvas, so
         * this "lock" is used to prevent an infinite loop of "select -> set active object -> select -> set active object"
         */
        if (handleSelectLock.current) {
            handleSelectLock.current = false;
            return;
        }

        const selectedMarcherIds = selectedMarchers.map(
            (marcher) => marcher.id
        );
        const canvasMarchersToSelect = canvas.current
            .getCanvasMarchers()
            .filter((canvasMarcher) =>
                selectedMarcherIds.includes(canvasMarcher.marcherObj.id)
            );
        handleSelect({ selected: canvasMarchersToSelect });
    }, [marchers, selectedMarchers, marcherPages, selectedPage, handleSelect]);

    /* --------------------------Animation Functions-------------------------- */

    useEffect(() => {
        if (canvas.current && selectedPage) {
            if (isPlaying) {
                const nextPage = selectedPage.getNextPage(pages);
                if (!nextPage) return;

                const nextPageMarcherPages = marcherPages.filter(
                    (marcherPage) => marcherPage.page_id === nextPage.id
                );
                canvas.current.getCanvasMarchers().forEach((canvasMarcher) => {
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

                canvas.current.requestRenderAll();
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

                canvas.current.renderMarchers({
                    selectedMarcherPages: MarcherPage.filterByPageId(
                        marcherPages,
                        selectedPage.id
                    ),
                    allMarchers: marchers,
                });
            }
        }
    }, [
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

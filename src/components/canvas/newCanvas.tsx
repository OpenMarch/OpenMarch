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
import Page from "@/global/classes/Page";
import CanvasMarcher from "@/components/canvas/CanvasMarcher";
import StaticCanvasMarcher from "@/components/canvas/StaticCanvasMarcher";
import { Pathway } from "./Pathway";
import { useCursorModeStore } from "@/stores/cursorMode/useCursorModeStore";
import OpenMarchCanvas, {
    ActiveObjectArgs,
    CanvasColors,
} from "./OpenMarchCanvas";
import DefaultListeners from "./listeners/DefaultListeners";
import MarcherPage, {
    ModifiedMarcherPageArgs,
} from "@/global/classes/MarcherPage";

export default function Canvas({ className = "" }: { className?: string }) {
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const { marchers } = useMarcherStore()!;
    const { pages } = usePageStore()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { fieldProperties } = useFieldProperties()!;
    const { uiSettings } = useUiSettingsStore()!;
    const { cursorMode } = useCursorModeStore()!;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const canvas = useRef<OpenMarchCanvas>();
    const animationCallbacks = useRef<any>([]);
    const animationTimeout = useRef<any>(null);

    // Not a real lock, just a way to prevent infinite loops
    const handleSelectLock = useRef<boolean>(false);

    /* -------------------------- Marcher Functions-------------------------- */
    /**
     * Render the marchers for the current page
     */
    const renderMarchers = useCallback(() => {
        if (!(canvas.current && selectedPage && marchers && marcherPages))
            return;

        const curMarcherPages = marcherPages.filter(
            (marcherPage) => marcherPage.page_id === selectedPage.id
        );

        // Get the canvas marchers on the canvas
        const curCanvasMarchers: CanvasMarcher[] =
            canvas.current.getCanvasMarchers();

        curMarcherPages.forEach((marcherPage) => {
            // Marcher does not exist on the Canvas, create a new one
            const curCanvasMarcher = curCanvasMarchers.find(
                (canvasMarcher) =>
                    canvasMarcher.marcherObj.id === marcherPage.marcher_id
            );
            if (!curCanvasMarcher) {
                const curMarcher = marchers.find(
                    (marcher) => marcher.id === marcherPage.marcher_id
                );
                if (!curMarcher) {
                    console.error(
                        "Marcher not found - renderMarchers: Canvas.tsx"
                    );
                    return;
                }

                canvas.current &&
                    canvas.current.add(
                        new CanvasMarcher({ marcher: curMarcher, marcherPage })
                    );
            }
            // Marcher exists on the Canvas, move it to the new location if it has changed
            else {
                curCanvasMarcher.setMarcherCoords(marcherPage);
            }
        });

        canvas.current.requestRenderAll();
    }, [selectedPage, marchers, marcherPages]);

    const sendCanvasMarchersToFront = useCallback(() => {
        if (!(canvas.current && selectedPage && marchers && marcherPages))
            return;

        // Get the canvas marchers on the canvas
        const curCanvasMarchers: CanvasMarcher[] =
            canvas.current.getCanvasMarchers();

        curCanvasMarchers.forEach((canvasMarcher) => {
            canvas.current && canvas.current.bringToFront(canvasMarcher);
        });
    }, [marcherPages, marchers, selectedPage]);

    /**
     * Remove the static canvas marchers from the canvas
     */
    const removeStaticCanvasMarchers = useCallback(() => {
        if (!canvas.current) return;

        const curStaticCanvasMarchers: StaticCanvasMarcher[] =
            canvas.current.getStaticCanvasMarchers();

        curStaticCanvasMarchers.forEach((canvasMarcher) => {
            canvas.current && canvas.current.remove(canvasMarcher);
        });
        canvas.current.requestRenderAll();
    }, []);

    /**
     * Render static marchers for the given page
     *
     * @param page The page to render the static marchers for
     * @param color The color of the static marchers (use rgba for transparency)
     */
    const renderStaticMarchers = useCallback(
        (page: Page, color: string) => {
            if (!(canvas.current && marchers && marcherPages)) return;

            const theseMarcherPages = marcherPages.filter(
                (marcherPage) => page.id === marcherPage.page_id
            );

            theseMarcherPages.forEach((marcherPage) => {
                const curMarcher = marchers.find(
                    (marcher) => marcher.id === marcherPage.marcher_id
                );
                if (!curMarcher) {
                    console.error(
                        "Marcher not found - renderStaticMarchers: Canvas.tsx"
                    );
                    return;
                }

                const staticMarcher = new StaticCanvasMarcher({
                    marcher: curMarcher,
                    marcherPage,
                    color,
                });

                canvas.current && canvas.current.add(staticMarcher);
            });
            canvas.current.requestRenderAll();
        },
        [marchers, marcherPages]
    );

    const removePathways = useCallback(() => {
        if (!canvas.current) return;

        const curPathways: Pathway[] = canvas.current.getPathways();

        curPathways.forEach((pathway) => {
            canvas.current && canvas.current.remove(pathway);
        });
        canvas.current.requestRenderAll();
    }, []);

    /**
     * Render the pathways from the selected page to the given one
     *
     * @param page the page to render the pathway to from the selected page
     * @param color color of the pathway
     */
    const renderPathways = useCallback(
        (page: Page, color = "rgba(0, 0, 0, 1)") => {
            if (!(canvas.current && selectedPage && marcherPages)) return;

            const selectedPageMarcherPages = marcherPages.filter(
                (marcherPage) => marcherPage.page_id === selectedPage.id
            );

            if (!page) return; // If there is no previous page, return

            const previousPageMarcherPages = marcherPages.filter(
                (marcherPage) => marcherPage.page_id === page.id
            );
            previousPageMarcherPages.forEach((previousMarcherPage) => {
                const selectedMarcherPage = selectedPageMarcherPages.find(
                    (marcherPage) =>
                        marcherPage.marcher_id ===
                        previousMarcherPage.marcher_id
                );
                if (!selectedMarcherPage) return; // If the marcher does not exist on the selected page, return

                const pathway = new Pathway({
                    start: previousMarcherPage,
                    end: selectedMarcherPage,
                    color,
                });

                canvas.current && canvas.current.add(pathway);
            });
        },
        [selectedPage, marcherPages]
    );

    /**
     * Set the given CanvasMarchers as the selected marchers both in the app and on the Canvas
     *
     * @param selectedObjects The CanvasMarchers to set as selected (can pass any fabric.Object, they are filtered)
     */
    const setSelectedCanvasMarchers = useCallback(
        (selectedObjects: fabric.Object[]) => {
            if (!canvas.current) {
                console.error("Canvas is not defined", new Error().stack);
                return;
            }
            console.log("selectLock", handleSelectLock.current);
            if (handleSelectLock.current) return;
            // When multiple marchers are selected, mark as them as the active object
            // This is how the view of the most current active marcher is maintained
            handleSelectLock.current = true;
            console.log("CANVAS", canvas.current);
            if (selectedObjects.length > 1) {
                // The current active object needs to be discarded before creating a new active selection
                // This is due to buggy behavior in Fabric.js
                canvas.current.discardActiveObject();
                const selectedCanvasMarchers =
                    canvas.current.getActiveObjectsByType(CanvasMarcher);

                const activeSelection = new fabric.ActiveSelection(
                    selectedCanvasMarchers,
                    {
                        canvas: canvas.current,
                        ...ActiveObjectArgs,
                    }
                );

                canvas.current.setActiveObject(activeSelection);
                canvas.current.requestRenderAll();
            }

            const activeObject = canvas.current.getActiveObject();

            // Apply the lock settings to the active object
            if (activeObject) {
                activeObject.lockMovementX = uiSettings.lockX;
                activeObject.lockMovementY = uiSettings.lockY;
            }

            const activeMarcherIds = canvas.current
                .getActiveObjectsByType(CanvasMarcher)
                .map((activeObject) => activeObject.marcherObj.id);
            console.log("ACTIVE MARCHER IDS", activeMarcherIds);
            const newSelectedMarchers = marchers.filter((marcher) =>
                activeMarcherIds.includes(marcher.id)
            );
            setSelectedMarchers(newSelectedMarchers);
        },
        [marchers, setSelectedMarchers, uiSettings.lockX, uiSettings.lockY]
    );

    // /* -------------------------- Listener Functions -------------------------- */
    // const handleObjectModified = useCallback(
    //     (e: any) => {
    //         if (!canvas.current) {
    //             console.error("Canvas is not defined", new Error().stack);
    //             return;
    //         }
    //         if (!selectedPage)
    //             throw new Error(
    //                 "Selected page not found - handleObjectModified: Canvas.tsx"
    //             );

    //         const activeObjects = canvas.current.getActiveObjects();
    //         const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [];

    //         // Determine if the mouse was clicked or dragged
    //         // If the mouse was clicked, likely the user does not want to move the marcher
    //         // This prevents the marcher from moving a little bit when it's just trying to be selected
    //         const mouseDistance = Math.sqrt(
    //             (e.e.clientX - canvas.current.selectDragStart.x) ** 2 +
    //                 (e.e.clientY - canvas.current.selectDragStart.y) ** 2
    //         );
    //         if (
    //             mouseDistance < 20 &&
    //             Date.now() - canvas.current.selectDragStart.time < 500
    //         ) {
    //             // If the mouse was clicked and not dragged, return and don't update the marcher
    //             return;
    //         }

    //         activeObjects.forEach((activeCanvasMarcher) => {
    //             // If the active object is not a marcher, return
    //             if (!(activeCanvasMarcher instanceof CanvasMarcher)) return;

    //             const newCoords = activeCanvasMarcher.getMarcherCoords();
    //             modifiedMarcherPages.push({
    //                 marcher_id: activeCanvasMarcher.marcherObj.id,
    //                 page_id: selectedPage!.id,
    //                 x: newCoords.x,
    //                 y: newCoords.y,
    //             });
    //         });

    //         MarcherPage.updateMarcherPages(modifiedMarcherPages);
    //     },
    //     [selectedPage]
    // );

    // /**
    //  * Set the selected marcher(s) when selected element changes
    //  */
    // const handleSelect = useCallback(
    //     (e: { selected: any[] }) => {
    //         // Ensure that the handleSelect function is not called while the lockHandelSelect is true. Prevents infinite loop
    //         // This semaphore is resolved in a useEffect that sets the active object to the selected marchers
    //         if (handleSelectLock.current) return;

    //         // When multiple marchers are selected, mark as them as the active object
    //         // This is how the view of the most current active marcher is maintained
    //         handleSelectLock.current = true;
    //         if (e.selected.length > 1) {
    //             // The current active object needs to be discarded before creating a new active selection
    //             // This is due to buggy behavior in Fabric.js
    //             (canvas.current as fabric.Canvas).discardActiveObject();
    //             const selectedCanvasMarchers: CanvasMarcher[] =
    //                 e.selected.filter(
    //                     (canvasObject: CanvasMarcher) =>
    //                         canvasObject instanceof CanvasMarcher
    //                 );

    //             const activeSelection = new fabric.ActiveSelection(
    //                 selectedCanvasMarchers,
    //                 {
    //                     canvas: canvas.current,
    //                     ...ActiveObjectArgs,
    //                 }
    //             );

    //             (canvas.current as fabric.Canvas).setActiveObject(
    //                 activeSelection
    //             );
    //             if (canvas.current) canvas.current.requestRenderAll();
    //             else console.error("Canvas is not defined", new Error().stack);
    //         }

    //         if (!canvas.current) {
    //             console.error("Canvas is not defined", new Error().stack);
    //             return;
    //         }
    //         const activeObject = canvas.current.getActiveObject();
    //         if (activeObject) {
    //             activeObject.lockMovementX = uiSettings.lockX;
    //             activeObject.lockMovementY = uiSettings.lockY;
    //         }

    //         const activeObjectMarcherIds = canvas.current
    //             .getActiveObjects()
    //             .map((activeObject: any) =>
    //                 activeObject instanceof CanvasMarcher
    //                     ? activeObject.marcherObj.id
    //                     : null
    //             );
    //         const newSelectedMarchers = marchers.filter((marcher) =>
    //             activeObjectMarcherIds.includes(marcher.id)
    //         );
    //         setSelectedMarchers(newSelectedMarchers);
    //     },
    //     [marchers, setSelectedMarchers, uiSettings.lockX, uiSettings.lockY]
    // );

    // /**
    //  * Deselect the marcher when the selection is cleared
    //  */
    // const handleDeselect = useCallback(
    //     (e: any) => {
    //         if (e.deselected) {
    //             setSelectedMarchers([]);
    //         }
    //     },
    //     [setSelectedMarchers]
    // );

    // /**
    //  * Set the canvas to dragging mode on mousedown.
    //  */
    // const handleMouseDown = (opt: any) => {
    //     if (!canvas.current) {
    //         console.error("Canvas is not defined", new Error().stack);
    //         return;
    //     }
    //     const evt = opt.e;
    //     // opt.target checks if the mouse is on the canvas at all
    //     // Don't move the canvas if the mouse is on a marcher
    //     const isMarcherSelection =
    //         opt.target &&
    //         (opt.target instanceof CanvasMarcher ||
    //             // If the target is a group of marchers (currently only checked if any of the objects are marchers)
    //             // Will not work when selecting multiple items that aren't marchers
    //             opt.target._objects?.some(
    //                 (obj: any) => obj instanceof CanvasMarcher
    //             ));
    //     if (!isMarcherSelection && !evt.shiftKey) {
    //         canvas.current.isDragging = true;
    //         canvas.current.selection = false;
    //         canvas.current.panDragStartPos = { x: evt.clientX, y: evt.clientY };
    //     }
    // };

    // /**
    //  * Move the canvas on mousemove when in dragging mode
    //  */
    // const handleMouseMove = (opt: any) => {
    //     if (!canvas.current) {
    //         console.error("Canvas is not defined", new Error().stack);
    //         return;
    //     }
    //     if (canvas.current.isDragging) {
    //         const e = opt.e;
    //         const vpt = canvas.current.viewportTransform;
    //         if (!vpt) {
    //             console.error(
    //                 "Viewport transform not defined",
    //                 new Error().stack
    //             );
    //             return;
    //         }
    //         vpt[4] += e.clientX - canvas.current.panDragStartPos.x;
    //         vpt[5] += e.clientY - canvas.current.panDragStartPos.y;
    //         canvas.current.requestRenderAll();
    //         canvas.current.panDragStartPos = { x: e.clientX, y: e.clientY };
    //     }
    // };

    // /**
    //  * Handler for the mouse up event
    //  * Disables dragging and re-enables selection
    //  *
    //  * If the mouse was only clicked and not dragged, select the marcher and do not move it
    //  */
    // const handleMouseUp = (opt: any) => {
    //     if (!canvas.current) {
    //         console.error("Canvas is not defined", new Error().stack);
    //         return;
    //     }
    //     // on mouse up we want to recalculate new interaction
    //     // for all objects, so we call setViewportTransform
    //     const viewportTransform = canvas.current.viewportTransform;
    //     if (!viewportTransform) {
    //         console.error("Viewport transform not defined", new Error().stack);
    //         return;
    //     }
    //     canvas.current.setViewportTransform(viewportTransform);
    //     canvas.current.isDragging = false;
    //     canvas.current.selection = true;
    // };

    // const initiateListeners = useCallback(() => {
    //     if (!canvas.current) return;
    //     canvas.current.on("object:modified", handleObjectModified);
    //     canvas.current.on("selection:updated", handleSelect);
    //     canvas.current.on("selection:created", handleSelect);
    //     canvas.current.on("selection:cleared", handleDeselect);

    //     canvas.current.on("mouse:down", handleMouseDown);
    //     canvas.current.on("mouse:move", handleMouseMove);
    //     canvas.current.on("mouse:up", handleMouseUp);
    // }, [handleObjectModified, handleSelect, handleDeselect]);

    // const cleanupListeners = useCallback(() => {
    //     if (!canvas.current) return;
    //     canvas.current.off("object:modified");
    //     canvas.current.off("selection:updated");
    //     canvas.current.off("selection:created");
    //     canvas.current.off("selection:cleared");

    //     canvas.current.off("mouse:down");
    //     canvas.current.off("mouse:move");
    //     canvas.current.off("mouse:up");
    // }, []);

    /* -------------------------- useEffects -------------------------- */
    // Initialize the Canvas
    useEffect(() => {
        // Don't create a new canvas if one already exists
        // Wait until the field properties and the canvasRef are defined
        if (!canvas.current && !!canvasRef.current && !!fieldProperties) {
            canvas.current = new OpenMarchCanvas(
                canvasRef.current,
                fieldProperties
            );
            // set the initial listeners
            canvas.current.setListeners(
                new DefaultListeners({
                    canvas: canvas.current,
                })
            );
        }
    }, [fieldProperties]);

    // Update the renderMarcher function on state changes
    useEffect(() => {
        if (canvas.current) {
            canvas.current.renderMarchers = renderMarchers;
        }
    }, [renderMarchers]);

    // Initiate listeners
    useEffect(() => {
        if (canvas.current) {
            switch (cursorMode) {
                // case "line":
                //     canvas.current.setListeners("crosshair");
                //     break;
                default:
                    canvas.current.setListeners(
                        new DefaultListeners({
                            canvas: canvas.current,
                        })
                    );
                    break;
            }

            // Cleanup
            return () => {
                if (canvas.current) canvas.current.clearListeners();
            };
        }
    }, [cursorMode]);

    // Update/render the marchers when the selected page or the marcher pages change
    useEffect(() => {
        if (canvas.current && selectedPage) {
            renderMarchers();
        }
    }, [renderMarchers, selectedPage]);

    // Renders pathways when selected page or settings change
    useEffect(() => {
        if (canvas.current && selectedPage) {
            const prevPage = selectedPage.getPreviousPage(pages);
            const nextPage = selectedPage.getNextPage(pages);

            removePathways();
            removeStaticCanvasMarchers();

            if (uiSettings.previousPaths && prevPage) {
                renderStaticMarchers(prevPage, CanvasColors.previousPage);
                renderPathways(prevPage, CanvasColors.previousPage);
            }
            if (uiSettings.nextPaths && nextPage) {
                renderStaticMarchers(nextPage, CanvasColors.nextPage);
                renderPathways(nextPage, CanvasColors.nextPage);
            }

            sendCanvasMarchersToFront();
        }
    }, [
        pages,
        removePathways,
        removeStaticCanvasMarchers,
        renderPathways,
        renderStaticMarchers,
        selectedPage,
        sendCanvasMarchersToFront,
        uiSettings.nextPaths,
        uiSettings.previousPaths,
    ]);

    // TODO outside selection doesn't work anymore
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
        console.log("selectLockEffect", handleSelectLock.current);
        if (handleSelectLock.current) {
            handleSelectLock.current = false;
            return;
        }

        const selectedMarcherIds = selectedMarchers.map(
            (marcher) => marcher.id
        );
        const allCanvasMarchers: CanvasMarcher[] =
            canvas.current.getCanvasMarchers();
        const canvasMarchersToSelect = allCanvasMarchers.filter(
            (canvasMarcher) =>
                selectedMarcherIds.includes(canvasMarcher.marcherObj.id)
        );
        // TODO make a function to set the selected CanvasMarchers
        setSelectedCanvasMarchers(canvasMarchersToSelect);
    }, [
        marchers,
        selectedMarchers,
        marcherPages,
        selectedPage,
        setSelectedMarchers,
        uiSettings,
        setSelectedCanvasMarchers,
    ]);

    /* --------------------------Animation Functions-------------------------- */

    useEffect(() => {
        if (canvas.current && selectedPage) {
            if (isPlaying) {
                const nextPage = selectedPage.getNextPage(pages);
                if (!nextPage) return;

                const nextPageMarcherPages = marcherPages.filter(
                    (marcherPage) => marcherPage.page_id === nextPage.id
                );
                const canvasMarchers = canvas.current.getCanvasMarchers();
                canvasMarchers.forEach((canvasMarcher) => {
                    // If the active object is not a marcher, return
                    if (!(canvasMarcher instanceof CanvasMarcher)) return;

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
                animationTimeout.current = setTimeout(() => {
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
                if (animationTimeout.current) {
                    clearTimeout(animationTimeout.current);
                }
                renderMarchers();
            }
        }
    }, [
        isPlaying,
        marcherPages,
        pages,
        renderMarchers,
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

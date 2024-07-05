/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useEffect, useCallback } from "react";
import { fabric } from "fabric";
import { useUiSettingsStore } from "../../stores/uiSettings/useUiSettingsStore";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";
import * as CanvasUtils from "./utils/CanvasUtils";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { usePageStore } from "@/stores/page/usePageStore";
import { useMarcherPageStore } from "@/stores/marcherPage/useMarcherPageStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import {
    MarcherPage,
    ModifiedMarcherPageArgs,
} from "@/global/classes/MarcherPage";
import Page from "@/global/classes/Page";
import CanvasMarcher from "@/components/canvas/CanvasMarcher";
import StaticCanvasMarcher from "@/components/canvas/StaticCanvasMarcher";
import { Pathway } from "./Pathway";
import { ActiveObjectArgs, CanvasColors } from "@/global/Constants";

function Canvas({ className = "" }: { className?: string }) {
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const { marchers } = useMarcherStore()!;
    const { pages } = usePageStore()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { fieldProperties } = useFieldProperties()!;
    const { uiSettings } = useUiSettingsStore()!;
    const staticGridRef = useRef<fabric.Rect | any>(null);
    const canvas = useRef<fabric.Canvas | any>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationCallbacks = useRef<any>([]);
    const timeoutID = useRef<any>(null);
    // Not a real lock, just a way to prevent infinite loops
    const handleSelectLock = useRef<boolean>(false);

    /* -------------------------- Listener Functions -------------------------- */
    const handleObjectModified = useCallback(
        (e: any) => {
            if (!selectedPage)
                throw new Error(
                    "Selected page not found - handleObjectModified: Canvas.tsx"
                );

            const activeObjects = canvas.current.getActiveObjects();
            const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [];
            activeObjects.forEach((activeCanvasMarcher: CanvasMarcher) => {
                if (!(activeCanvasMarcher instanceof CanvasMarcher)) return; // If the active object is not a marcher, return

                const newCoords = activeCanvasMarcher.getMarcherCoords();
                modifiedMarcherPages.push({
                    marcher_id: activeCanvasMarcher.marcherObj.id,
                    page_id: selectedPage!.id,
                    x: newCoords.x,
                    y: newCoords.y,
                });
            });

            MarcherPage.updateMarcherPages(modifiedMarcherPages);
        },
        [selectedPage]
    );

    /**
     * Set the selected marcher(s) when selected element changes
     */
    const handleSelect = useCallback(
        (e: { selected: any[] }) => {
            // Ensure that the handleSelect function is not called while the lockHandelSelect is true. Prevents infinite loop
            // This semaphore is resolved in a useEffect that sets the active object to the selected marchers
            if (handleSelectLock.current) return;

            // When multiple marchers are selected, mark as them as the active object
            // This is how the view of the most current active marcher is maintained
            handleSelectLock.current = true;
            if (e.selected.length > 1) {
                // The current active object needs to be discarded before creating a new active selection
                // This is due to buggy behavior in Fabric.js
                (canvas.current as fabric.Canvas).discardActiveObject();
                const selectedCanvasMarchers: CanvasMarcher[] =
                    e.selected.filter(
                        (canvasObject: CanvasMarcher) =>
                            canvasObject instanceof CanvasMarcher
                    );

                const activeSelection = new fabric.ActiveSelection(
                    selectedCanvasMarchers,
                    {
                        canvas: canvas.current,
                        ...ActiveObjectArgs,
                    }
                );

                (canvas.current as fabric.Canvas).setActiveObject(
                    activeSelection
                );
                canvas.current.requestRenderAll();
            }

            const activeObject = canvas.current.getActiveObject();
            if (activeObject) {
                activeObject.lockMovementX = uiSettings.lockX;
                activeObject.lockMovementY = uiSettings.lockY;
            }

            const activeObjectMarcherIds = canvas.current
                .getActiveObjects()
                .map((activeObject: any) =>
                    activeObject instanceof CanvasMarcher
                        ? activeObject.marcherObj.id
                        : null
                );
            const newSelectedMarchers = marchers.filter((marcher) =>
                activeObjectMarcherIds.includes(marcher.id)
            );
            setSelectedMarchers(newSelectedMarchers);
        },
        [marchers, setSelectedMarchers, uiSettings.lockX, uiSettings.lockY]
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
        if (!isMarcherSelection && !evt.shiftKey) {
            canvas.current.isDragging = true;
            canvas.current.selection = false;
            canvas.current.lastPosX = evt.clientX;
            canvas.current.lastPosY = evt.clientY;
        }
    };

    /**
     * Move the canvas on mousemove when in dragging mode
     */
    const handleMouseMove = (opt: any) => {
        if (canvas.current.isDragging) {
            const e = opt.e;
            const vpt = canvas.current.viewportTransform;
            vpt[4] += e.clientX - canvas.current.lastPosX;
            vpt[5] += e.clientY - canvas.current.lastPosY;
            canvas.current.requestRenderAll();
            canvas.current.lastPosX = e.clientX;
            canvas.current.lastPosY = e.clientY;
        }
    };

    /**
     * Disable dragging mode on mouseup.
     */
    const handleMouseUp = (opt: any) => {
        // on mouse up we want to recalculate new interaction
        // for all objects, so we call setViewportTransform
        canvas.current.setViewportTransform(canvas.current.viewportTransform);
        canvas.current.isDragging = false;
        canvas.current.selection = true;
    };

    /**
     * Zoom in and out with the mouse wheel
     */
    const handleMouseWheel = (opt: any) => {
        // set objectCaching to true to improve performance while zooming
        if (!staticGridRef.current.objectCaching)
            staticGridRef.current.objectCaching = true;

        // set objectCaching to true to improve performance while zooming
        if (!staticGridRef.current.objectCaching)
            staticGridRef.current.objectCaching = true;

        const delta = opt.e.deltaY;
        let zoom = canvas.current.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 25) zoom = 25;
        if (zoom < 0.35) zoom = 0.35;
        canvas.current.zoomToPoint(
            { x: opt.e.offsetX, y: opt.e.offsetY },
            zoom
        );
        opt.e.preventDefault();
        opt.e.stopPropagation();

        // set objectCaching to false after 100ms to improve performance after zooming
        // This is what prevents the grid from being blurry after zooming
        clearTimeout(canvas.current.zoomTimeout);
        canvas.current.zoomTimeout = setTimeout(() => {
            if (staticGridRef.current.objectCaching) {
                staticGridRef.current.objectCaching = false;
                canvas.current.renderAll();
            }
        }, 50);
    };

    const initiateListeners = useCallback(() => {
        if (!canvas.current) return;
        canvas.current.on("object:modified", handleObjectModified);
        canvas.current.on("selection:updated", handleSelect);
        canvas.current.on("selection:created", handleSelect);
        canvas.current.on("selection:cleared", handleDeselect);

        canvas.current.on("mouse:down", handleMouseDown);
        canvas.current.on("mouse:move", handleMouseMove);
        canvas.current.on("mouse:up", handleMouseUp);
        canvas.current.on("mouse:wheel", handleMouseWheel);
    }, [handleObjectModified, handleSelect, handleDeselect]);

    const cleanupListeners = useCallback(() => {
        if (!canvas.current) return;
        canvas.current.off("object:modified");
        canvas.current.off("selection:updated");
        canvas.current.off("selection:created");
        canvas.current.off("selection:cleared");

        canvas.current.off("mouse:down");
        canvas.current.off("mouse:move");
        canvas.current.off("mouse:up");
        canvas.current.off("mouse:wheel");
    }, []);

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
        const curCanvasMarchers: CanvasMarcher[] = canvas.current
            .getObjects()
            .filter(
                (canvasObject: CanvasMarcher) =>
                    canvasObject instanceof CanvasMarcher
            );

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

                canvas.current.add(
                    new CanvasMarcher({ marcher: curMarcher, marcherPage })
                );
            }
            // Marcher exists on the Canvas, move it to the new location if it has changed
            else {
                curCanvasMarcher.setMarcherCoords(marcherPage);
            }
        });

        // Refresh the selection
        // const selectedMarcherIds = selectedMarchers.map((marcher) => marcher.id);
        // const activeSelection = new fabric.ActiveSelection(
        //     curCanvasMarchers.filter((canvasMarcher) => selectedMarcherIds.includes(canvasMarcher.marcherObj.id)),
        //     { canvas: canvas.current, }
        // );
        // canvas.current.setActiveObject(activeSelection);

        canvas.current.requestRenderAll();
    }, [selectedPage, marchers, marcherPages]);

    const sendCanvasMarchersToFront = useCallback(() => {
        if (!(canvas.current && selectedPage && marchers && marcherPages))
            return;

        // Get the canvas marchers on the canvas
        const curCanvasMarchers: CanvasMarcher[] = canvas.current
            .getObjects()
            .filter(
                (canvasObject: CanvasMarcher) =>
                    canvasObject instanceof CanvasMarcher
            );

        curCanvasMarchers.forEach((canvasMarcher) => {
            canvas.current.bringToFront(canvasMarcher);
        });
    }, [marcherPages, marchers, selectedPage]);

    /**
     * Remove the static canvas marchers from the canvas
     */
    const removeStaticCanvasMarchers = useCallback(() => {
        if (!canvas.current) return;

        const curStaticCanvasMarchers: StaticCanvasMarcher[] = canvas.current
            .getObjects()
            .filter(
                (canvasObject: StaticCanvasMarcher) =>
                    canvasObject instanceof StaticCanvasMarcher
            );

        curStaticCanvasMarchers.forEach((canvasMarcher) => {
            canvas.current.remove(canvasMarcher);
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

                canvas.current.add(staticMarcher);
            });
            canvas.current.requestRenderAll();
        },
        [marchers, marcherPages]
    );

    const removePathways = useCallback(() => {
        if (!canvas.current) return;

        const curPathways: Pathway[] = canvas.current
            .getObjects()
            .filter((canvasObject: Pathway) => canvasObject instanceof Pathway);

        curPathways.forEach((pathway) => {
            canvas.current.remove(pathway);
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

                canvas.current.add(pathway);
            });
        },
        [selectedPage, marcherPages]
    );

    /* -------------------------- useEffects -------------------------- */
    /* Initialize the canvas */
    useEffect(() => {
        if (
            canvas.current ||
            !selectedPage ||
            !canvasRef.current ||
            !fieldProperties
        )
            return; // If the canvas is already initialized, or the selected page is not set, return

        canvas.current = new fabric.Canvas(canvasRef.current, {});

        canvas.current.perfLimitSizeTotal = 225000000;
        canvas.current.maxCacheSideLimit = 11000;

        // Set canvas.current size
        CanvasUtils.refreshCanvasSize(canvas.current);
        // Update canvas.current size on window resize
        window.addEventListener("resize", (evt) => {
            CanvasUtils.refreshCanvasSize(canvas.current);
        });

        // Set canvas.current configuration options
        canvas.current.selectionColor = "white";
        canvas.current.selectionLineWidth = 8;
        // set initial canvas.current size
        staticGridRef.current = CanvasUtils.buildField({ fieldProperties });
        canvas.current.add(staticGridRef.current);
        staticGridRef.current.objectCaching = true;

        // Set canvas selection color
        canvas.current.selectionColor = "rgba(0, 0, 255, 0.2)";
        canvas.current.selectionBorderColor = "rgba(0, 0, 255, 1)";
        canvas.current.selectionLineWidth = 2;

        canvas.current.renderAll();
    }, [selectedPage, fieldProperties]);

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
        const allCanvasMarchers: CanvasMarcher[] = canvas.current
            .getObjects()
            .filter(
                (canvasObject: CanvasMarcher) =>
                    canvasObject instanceof CanvasMarcher
            );
        const canvasMarchersToSelect = allCanvasMarchers.filter(
            (canvasMarcher) =>
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
                canvas.current
                    .getObjects()
                    .forEach((canvasMarcher: CanvasMarcher) => {
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

export default Canvas;
